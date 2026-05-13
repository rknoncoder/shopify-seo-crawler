import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

interface LinkGraphNode {
  page: CrawledPage;
  inboundLinks: Set<string>;
  collectionLinks: Set<string>;
}

export function detectInternalLinkIssues(pages: CrawledPage[]): SeoIssue[] {
  const graph = buildLinkGraph(pages);
  const issues: SeoIssue[] = [];

  for (const node of graph.values()) {
    if (node.page.status >= 400 || node.page.pageType === "home") continue;

    if (node.inboundLinks.size === 0) {
      issues.push(issue(
        node.page,
        node.page.pageType === "product" || node.page.pageType === "collection" ? "high" : "medium",
        "orphan_page",
        "Page has no internal links from other crawled pages.",
        "Add internal links from navigation, collections, related products, blog articles, or other relevant pages.",
        "inboundInternalLinks=0"
      ));
      continue;
    }

    const minimumInboundLinks = getMinimumInboundLinks(node.page.pageType);
    if (node.inboundLinks.size < minimumInboundLinks) {
      issues.push(issue(
        node.page,
        "recommended",
        "low_internal_links",
        `Page has only ${node.inboundLinks.size} internal link(s) from other crawled pages.`,
        "Add more relevant internal links so search engines and users can discover this page more easily.",
        `inboundInternalLinks=${node.inboundLinks.size}; sampleSources=${[...node.inboundLinks].slice(0, 3).join("|")}`
      ));
    }

    if (node.page.pageType === "product" && node.collectionLinks.size === 0) {
      issues.push(issue(
        node.page,
        "medium",
        "product_not_linked_from_collection",
        "Product has no internal links from crawled collection pages.",
        "Link this product from at least one relevant Shopify collection page.",
        `inboundInternalLinks=${node.inboundLinks.size}`
      ));
    }
  }

  return issues;
}

function buildLinkGraph(pages: CrawledPage[]): Map<string, LinkGraphNode> {
  const graph = new Map<string, LinkGraphNode>();

  for (const page of pages) {
    graph.set(normalizeForGraph(page.finalUrl), {
      page,
      inboundLinks: new Set<string>(),
      collectionLinks: new Set<string>()
    });
  }

  for (const sourcePage of pages) {
    const sourceKey = normalizeForGraph(sourcePage.finalUrl);

    for (const link of sourcePage.links) {
      if (!link.internal) continue;

      const targetKey = normalizeForGraph(link.href);
      if (targetKey === sourceKey) continue;

      const targetNode = graph.get(targetKey);
      if (!targetNode) continue;

      targetNode.inboundLinks.add(sourcePage.finalUrl);
      if (sourcePage.pageType === "collection") {
        targetNode.collectionLinks.add(sourcePage.finalUrl);
      }
    }
  }

  return graph;
}

function normalizeForGraph(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

function getMinimumInboundLinks(pageType: string): number {
  if (pageType === "product") return 2;
  if (pageType === "collection") return 3;
  if (pageType === "article") return 2;
  return 1;
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  code: string,
  message: string,
  recommendation: string,
  evidence = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category: "internal_links",
    code,
    message,
    recommendation,
    evidence: truncate(evidence, 240)
  };
}
