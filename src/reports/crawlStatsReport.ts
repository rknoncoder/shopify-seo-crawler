import type { CrawlTelemetry } from "../types/crawl.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import type { LinkGraphSummaryRow } from "./linkGraphReport.js";
import { isFetchFailureCode } from "../utils/fetchFailureClassifier.js";

interface LoadTimeSummary {
  avg: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

interface StatusCodeCounts {
  families: {
    "2xx": number;
    "3xx": number;
    "4xx": number;
    "5xx": number;
    other: number;
  };
  exact: Record<string, number>;
}

export interface NetworkSummary {
  total_nodes: number;
  total_edges: number;
  orphan_count: number;
  sink_count: number;
  hub_count: number;
  avg_inbound_links: number | null;
  max_inbound_url: string;
  avg_depth_from_home: number | null;
  top_pagerank_url: string;
  top_seo_pagerank_url: string;
  top_seo_pagerank_score: number;
}

export interface CrawlStatsReport {
  generatedAt: string;
  totalRequested: number;
  totalCrawled: number;
  statusCodeCounts: StatusCodeCounts;
  fetchFailedCount: number;
  skippedNonHtmlCount: number;
  api_seeded_products: number;
  api_seeded_collections: number;
  probe_discovered_products: number;
  probe_collections_attempted: number;
  probe_collections_exhausted: number;
  probe_collections_failed: number;
  probe_total_pages_fetched: number;
  sitemap_only_products: number;
  orphaned_collection_count: number;
  redirectedCount: number;
  retryCounters: CrawlTelemetry["retries"];
  loadTimeMs: LoadTimeSummary;
  network: NetworkSummary;
}

export interface CrawlStatsCsvRow {
  generatedAt: string;
  totalRequested: number;
  totalCrawled: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  statusOther: number;
  exactStatusCounts: string;
  fetchFailedCount: number;
  skippedNonHtmlCount: number;
  api_seeded_products: number;
  api_seeded_collections: number;
  probe_discovered_products: number;
  probe_collections_attempted: number;
  probe_collections_exhausted: number;
  probe_collections_failed: number;
  probe_total_pages_fetched: number;
  sitemap_only_products: number;
  orphaned_collection_count: number;
  redirectedCount: number;
  totalRetries: number;
  statusRetries: number;
  errorRetries: number;
  retryStatusCounts: string;
  avgLoadTimeMs: number | null;
  p50LoadTimeMs: number | null;
  p95LoadTimeMs: number | null;
  maxLoadTimeMs: number | null;
  total_nodes: number;
  total_edges: number;
  orphan_count: number;
  sink_count: number;
  hub_count: number;
  avg_inbound_links: number | null;
  max_inbound_url: string;
  avg_depth_from_home: number | null;
  top_pagerank_url: string;
  top_seo_pagerank_url: string;
  top_seo_pagerank_score: number;
}

export function buildCrawlStatsReport(
  pages: CrawledPage[],
  issues: SeoIssue[],
  telemetry: CrawlTelemetry,
  linkGraphSummary: LinkGraphSummaryRow[] = []
): CrawlStatsReport {
  return {
    generatedAt: new Date().toISOString(),
    totalRequested: telemetry.totalRequested,
    totalCrawled: pages.length,
    statusCodeCounts: countStatusCodes(pages),
    fetchFailedCount: issues.filter((issue) => isFetchFailureCode(issue.code)).length,
    skippedNonHtmlCount: telemetry.skippedNonHtmlCount,
    api_seeded_products: telemetry.apiSeededProducts,
    api_seeded_collections: telemetry.apiSeededCollections,
    probe_discovered_products: telemetry.probeDiscoveredProducts,
    probe_collections_attempted: telemetry.probeCollectionsAttempted,
    probe_collections_exhausted: telemetry.probeCollectionsExhausted,
    probe_collections_failed: telemetry.probeCollectionsFailed,
    probe_total_pages_fetched: telemetry.probeTotalPagesFetched,
    sitemap_only_products: telemetry.sitemapOnlyProducts,
    orphaned_collection_count: issues.filter((issue) => issue.code === "orphaned_collection").length,
    redirectedCount: pages.filter((page) => page.redirected).length,
    retryCounters: telemetry.retries,
    loadTimeMs: summarizeLoadTimes(pages),
    network: summarizeNetwork(linkGraphSummary)
  };
}

export function buildCrawlStatsCsvRows(report: CrawlStatsReport): CrawlStatsCsvRow[] {
  return [{
    generatedAt: report.generatedAt,
    totalRequested: report.totalRequested,
    totalCrawled: report.totalCrawled,
    status2xx: report.statusCodeCounts.families["2xx"],
    status3xx: report.statusCodeCounts.families["3xx"],
    status4xx: report.statusCodeCounts.families["4xx"],
    status5xx: report.statusCodeCounts.families["5xx"],
    statusOther: report.statusCodeCounts.families.other,
    exactStatusCounts: JSON.stringify(report.statusCodeCounts.exact),
    fetchFailedCount: report.fetchFailedCount,
    skippedNonHtmlCount: report.skippedNonHtmlCount,
    api_seeded_products: report.api_seeded_products,
    api_seeded_collections: report.api_seeded_collections,
    probe_discovered_products: report.probe_discovered_products,
    probe_collections_attempted: report.probe_collections_attempted,
    probe_collections_exhausted: report.probe_collections_exhausted,
    probe_collections_failed: report.probe_collections_failed,
    probe_total_pages_fetched: report.probe_total_pages_fetched,
    sitemap_only_products: report.sitemap_only_products,
    orphaned_collection_count: report.orphaned_collection_count,
    redirectedCount: report.redirectedCount,
    totalRetries: report.retryCounters.totalRetries,
    statusRetries: report.retryCounters.statusRetries,
    errorRetries: report.retryCounters.errorRetries,
    retryStatusCounts: JSON.stringify(report.retryCounters.retryStatusCounts),
    avgLoadTimeMs: report.loadTimeMs.avg,
    p50LoadTimeMs: report.loadTimeMs.p50,
    p95LoadTimeMs: report.loadTimeMs.p95,
    maxLoadTimeMs: report.loadTimeMs.max,
    total_nodes: report.network.total_nodes,
    total_edges: report.network.total_edges,
    orphan_count: report.network.orphan_count,
    sink_count: report.network.sink_count,
    hub_count: report.network.hub_count,
    avg_inbound_links: report.network.avg_inbound_links,
    max_inbound_url: report.network.max_inbound_url,
    avg_depth_from_home: report.network.avg_depth_from_home,
    top_pagerank_url: report.network.top_pagerank_url,
    top_seo_pagerank_url: report.network.top_seo_pagerank_url,
    top_seo_pagerank_score: report.network.top_seo_pagerank_score
  }];
}

function countStatusCodes(pages: CrawledPage[]): StatusCodeCounts {
  const families: StatusCodeCounts["families"] = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
    other: 0
  };
  const exact: Record<string, number> = {};

  for (const page of pages) {
    const status = page.status;
    exact[status] = (exact[status] || 0) + 1;

    if (status >= 200 && status < 300) {
      families["2xx"] += 1;
    } else if (status >= 300 && status < 400) {
      families["3xx"] += 1;
    } else if (status >= 400 && status < 500) {
      families["4xx"] += 1;
    } else if (status >= 500 && status < 600) {
      families["5xx"] += 1;
    } else {
      families.other += 1;
    }
  }

  return { families, exact };
}

function summarizeLoadTimes(pages: CrawledPage[]): LoadTimeSummary {
  const values = pages
    .map((page) => page.loadTimeMs)
    .filter((loadTime) => Number.isFinite(loadTime))
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return { avg: null, p50: null, p95: null, max: null };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    avg: Math.round(total / values.length),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values[values.length - 1]
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  );
  return sortedValues[index];
}

function summarizeNetwork(rows: LinkGraphSummaryRow[]): NetworkSummary {
  if (rows.length === 0) {
    return {
      total_nodes: 0,
      total_edges: 0,
      orphan_count: 0,
      sink_count: 0,
      hub_count: 0,
      avg_inbound_links: null,
      max_inbound_url: "",
      avg_depth_from_home: null,
      top_pagerank_url: "",
      top_seo_pagerank_url: "",
      top_seo_pagerank_score: 0
    };
  }

  const totalInbound = rows.reduce((sum, row) => sum + row.inbound_count, 0);
  const depthValues = rows
    .map((row) => row.depth_from_home)
    .filter((depth): depth is number => typeof depth === "number" && Number.isFinite(depth));
  const maxInboundRow = rows.reduce((best, row) => row.inbound_count > best.inbound_count ? row : best, rows[0]);
  const topPageRankRow = rows.reduce((best, row) => row.pagerank_score > best.pagerank_score ? row : best, rows[0]);
  const seoRows = rows.filter((row) => !row.is_utility);
  const topSeoPageRankRow = seoRows.length > 0
    ? seoRows.reduce((best, row) => row.seo_pagerank_score > best.seo_pagerank_score ? row : best, seoRows[0])
    : undefined;

  return {
    total_nodes: rows.length,
    total_edges: rows.reduce((sum, row) => sum + row.outbound_count, 0),
    orphan_count: rows.filter((row) => row.is_orphan).length,
    sink_count: rows.filter((row) => row.is_sink).length,
    hub_count: rows.filter((row) => row.is_hub).length,
    avg_inbound_links: round(totalInbound / rows.length),
    max_inbound_url: maxInboundRow.url,
    avg_depth_from_home: depthValues.length > 0
      ? round(depthValues.reduce((sum, depth) => sum + depth, 0) / depthValues.length)
      : null,
    top_pagerank_url: topPageRankRow.url,
    top_seo_pagerank_url: topSeoPageRankRow?.url ?? "",
    top_seo_pagerank_score: topSeoPageRankRow?.seo_pagerank_score ?? 0
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
