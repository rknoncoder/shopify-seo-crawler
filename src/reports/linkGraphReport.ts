import type { LinkGraph } from "../types/crawl.js";
import type { CrawledPage } from "../types/page.js";

export type LinkGraphNodeType = "product" | "collection" | "blog" | "page" | "home" | "other";

export interface LinkGraphNode {
  id: string;
  type: LinkGraphNodeType;
  crawled: boolean;
}

export interface LinkGraphEdge {
  source: string;
  target: string;
}

export interface LinkGraphReport {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
}

export interface LinkGraphCsvRow {
  source: string;
  target: string;
  source_type: LinkGraphNodeType;
  target_type: LinkGraphNodeType;
}

export interface LinkGraphSummaryRow {
  url: string;
  type: LinkGraphNodeType;
  inbound_count: number;
  outbound_count: number;
  inbound_sources: string[];
  depth_from_home: number | null;
  is_orphan: boolean;
  is_hub: boolean;
  is_sink: boolean;
  is_utility: boolean;
  pagerank_score: number;
  seo_pagerank_score: number;
}

export function buildLinkGraphReport(linkGraph: LinkGraph, pages: CrawledPage[]): LinkGraphReport {
  const crawledUrls = buildCrawledUrlSet(pages);
  const nodeIds = collectNodeIds(linkGraph);
  const edges = buildEdges(linkGraph);

  return {
    nodes: [...nodeIds]
      .sort()
      .map((id) => ({
        id,
        type: inferLinkGraphNodeType(id),
        crawled: crawledUrls.has(id)
      })),
    edges
  };
}

export function buildLinkGraphCsvRows(linkGraphReport: LinkGraphReport): LinkGraphCsvRow[] {
  return linkGraphReport.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    source_type: inferLinkGraphNodeType(edge.source),
    target_type: inferLinkGraphNodeType(edge.target)
  }));
}

export function buildLinkGraphSummaryReport(linkGraph: LinkGraph, pages: CrawledPage[] = []): LinkGraphSummaryRow[] {
  const nodeIds = collectNodeIds(linkGraph);
  const inboundSources = buildInboundSources(linkGraph, nodeIds);
  const depths = computeDepthsFromHome(linkGraph, nodeIds);
  const discoverySources = buildDiscoverySourceMap(pages);
  const outboundCounts = buildOutboundCounts(linkGraph, nodeIds);
  const hubThreshold = calculateHubThreshold([...outboundCounts.values()]);
  const pageRankScores = calculatePageRankScores(linkGraph, nodeIds, inboundSources, outboundCounts);
  const seoPageRankScores = calculateSeoPageRankScores(linkGraph, nodeIds);

  return [...nodeIds]
    .sort()
    .map((url) => {
      const type = inferLinkGraphNodeType(url);
      const inbound = [...(inboundSources.get(url) ?? new Set<string>())].sort();
      const outboundCount = outboundCounts.get(url) ?? 0;
      const discoverySource = discoverySources.get(url);
      const isUtility = isUtilityUrl(url);

      return {
        url,
        type,
        inbound_count: inbound.length,
        outbound_count: outboundCount,
        inbound_sources: inbound,
        depth_from_home: depths.get(url) ?? null,
        is_orphan: type !== "home" && inbound.length === 0 && !isApiSeedDiscovery(discoverySource),
        is_hub: outboundCount > 0 && outboundCount >= hubThreshold,
        is_sink: outboundCount === 0,
        is_utility: isUtility,
        pagerank_score: pageRankScores.get(url) ?? 0,
        seo_pagerank_score: isUtility ? 0 : seoPageRankScores.get(url) ?? 0
      };
    });
}

export function inferLinkGraphNodeType(url: string): LinkGraphNodeType {
  try {
    const pathname = new URL(url).pathname;
    if (pathname === "/" || pathname === "") return "home";
    if (pathname.startsWith("/products/")) return "product";
    if (pathname.startsWith("/collections/")) return "collection";
    if (pathname.startsWith("/blogs/")) return "blog";
    if (pathname.startsWith("/pages/")) return "page";
    return "other";
  } catch {
    return "other";
  }
}

function buildCrawledUrlSet(pages: CrawledPage[]): Set<string> {
  return new Set(pages.map((page) => normalizeGraphUrl(page.finalUrl)).filter(Boolean));
}

function buildDiscoverySourceMap(pages: CrawledPage[]): Map<string, string> {
  const sources = new Map<string, string>();

  for (const page of pages) {
    const url = normalizeGraphUrl(page.finalUrl);
    if (!url || !page.discoverySource || sources.has(url)) continue;
    sources.set(url, page.discoverySource);
  }

  return sources;
}

function collectNodeIds(linkGraph: LinkGraph): Set<string> {
  const nodeIds = new Set<string>();

  for (const [source, targets] of linkGraph) {
    if (source) nodeIds.add(source);
    for (const target of targets) {
      if (target) nodeIds.add(target);
    }
  }

  return nodeIds;
}

function buildEdges(linkGraph: LinkGraph): LinkGraphEdge[] {
  const edges: LinkGraphEdge[] = [];

  for (const [source, targets] of linkGraph) {
    for (const target of targets) {
      if (source === target) continue;
      edges.push({ source, target });
    }
  }

  return edges.sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    return sourceCompare === 0 ? left.target.localeCompare(right.target) : sourceCompare;
  });
}

function buildInboundSources(
  linkGraph: LinkGraph,
  nodeIds: Set<string>,
  includeEdge: (source: string, target: string) => boolean = (source, target) => source !== target
): Map<string, Set<string>> {
  const inboundSources = new Map<string, Set<string>>();
  for (const nodeId of nodeIds) {
    inboundSources.set(nodeId, new Set());
  }

  for (const [source, targets] of linkGraph) {
    for (const target of targets) {
      if (!includeEdge(source, target)) continue;
      if (!nodeIds.has(target)) continue;
      if (!inboundSources.has(target)) {
        inboundSources.set(target, new Set());
      }
      inboundSources.get(target)?.add(source);
    }
  }

  return inboundSources;
}

function buildOutboundCounts(
  linkGraph: LinkGraph,
  nodeIds: Set<string>,
  includeEdge: (source: string, target: string) => boolean = (source, target) => source !== target
): Map<string, number> {
  const outboundCounts = new Map<string, number>();

  for (const nodeId of nodeIds) {
    outboundCounts.set(nodeId, countIncludedTargets(nodeId, linkGraph.get(nodeId), includeEdge));
  }

  return outboundCounts;
}

function countIncludedTargets(
  source: string,
  targets: Set<string> | undefined,
  includeEdge: (source: string, target: string) => boolean
): number {
  if (!targets) return 0;
  let count = 0;

  for (const target of targets) {
    if (includeEdge(source, target)) count += 1;
  }

  return count;
}

function calculateHubThreshold(outboundCounts: number[]): number {
  if (outboundCounts.length === 0) return Number.POSITIVE_INFINITY;

  const sorted = [...outboundCounts].sort((left, right) => right - left);
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.1));
  return sorted[topCount - 1] ?? Number.POSITIVE_INFINITY;
}

function calculatePageRankScores(
  linkGraph: LinkGraph,
  nodeIds: Set<string>,
  inboundSources: Map<string, Set<string>>,
  outboundCounts: Map<string, number>
): Map<string, number> {
  const dampingFactor = 0.85;
  const iterations = 20;
  const nodes = [...nodeIds];
  const totalNodes = nodes.length;

  if (totalNodes === 0) return new Map();

  let scores = new Map(nodes.map((node) => [node, 1 / totalNodes]));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextScores = new Map<string, number>();

    for (const node of nodes) {
      let inboundScore = 0;
      for (const source of inboundSources.get(node) ?? []) {
        const outboundCount = outboundCounts.get(source) ?? linkGraph.get(source)?.size ?? 0;
        if (outboundCount === 0) continue;
        inboundScore += (scores.get(source) ?? 0) / outboundCount;
      }

      nextScores.set(node, (1 - dampingFactor) + dampingFactor * inboundScore);
    }

    scores = nextScores;
  }

  return normalizePageRankScores(scores);
}

function calculateSeoPageRankScores(linkGraph: LinkGraph, nodeIds: Set<string>): Map<string, number> {
  const seoNodeIds = new Set([...nodeIds].filter((nodeId) => !isUtilityUrl(nodeId)));
  const seoInboundSources = buildInboundSources(linkGraph, seoNodeIds, isSeoPageRankEdge);
  const seoOutboundCounts = buildOutboundCounts(linkGraph, seoNodeIds, isSeoPageRankEdge);
  return calculatePageRankScores(linkGraph, seoNodeIds, seoInboundSources, seoOutboundCounts);
}

function normalizePageRankScores(scores: Map<string, number>): Map<string, number> {
  const values = [...scores.values()];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (!Number.isFinite(range) || range === 0) {
    return new Map([...scores.keys()].map((node) => [node, 0]));
  }

  return new Map([...scores].map(([node, score]) => [node, Number(((score - min) / range).toFixed(6))]));
}

function isApiSeedDiscovery(discoverySource: string | undefined): boolean {
  return discoverySource === "api_seed"
    || discoverySource === "api_probe"
    || discoverySource === "pagination_probe"
    || discoverySource === "sitemap_unlisted";
}

function computeDepthsFromHome(linkGraph: LinkGraph, nodeIds: Set<string>): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: string[] = [];

  for (const nodeId of nodeIds) {
    if (inferLinkGraphNodeType(nodeId) === "home") {
      depths.set(nodeId, 0);
      queue.push(nodeId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const nextDepth = (depths.get(current) ?? 0) + 1;
    for (const target of linkGraph.get(current) ?? []) {
      if (target === current) continue;
      if (depths.has(target)) continue;
      depths.set(target, nextDepth);
      queue.push(target);
    }
  }

  return depths;
}

function isSeoPageRankEdge(source: string, target: string): boolean {
  return source !== target && !isUtilityUrl(source) && !isUtilityUrl(target);
}

export function isUtilityUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname === "/account"
      || pathname.startsWith("/account/")
      || pathname === "/cart"
      || pathname.startsWith("/cart/")
      || pathname === "/search"
      || pathname.startsWith("/search/")
      || pathname === "/checkout"
      || pathname.startsWith("/checkout/")
      || pathname === "/password"
      || pathname.startsWith("/password/");
  } catch {
    return false;
  }
}

function normalizeGraphUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}
