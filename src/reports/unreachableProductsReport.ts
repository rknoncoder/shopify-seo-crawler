import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import type { ProbeDiscoveryMap } from "../types/crawl.js";
import { toReachableVia } from "../utils/discoverySource.js";
import type { LinkGraphSummaryRow } from "./linkGraphReport.js";

export type UnreachableProductBucket =
  | "A_no_collection"
  | "B_collection_crawled_not_linked"
  | "C_collection_not_crawled";

export interface UnreachableProductReportRow {
  url: string;
  handle: string;
  discovery_source: string;
  inbound_count: number;
  pagerank_score: number;
  collection_memberships: string;
  collection_is_crawled: string;
  bucket: UnreachableProductBucket;
  collections_count: number;
}

export interface UnreachableProductBucketSummary {
  total: number;
  A_no_collection: number;
  B_collection_crawled_not_linked: number;
  C_collection_not_crawled: number;
}

export interface UnreachableProductsReportOptions {
  baseUrl?: string;
  probeDiscoveryMap?: ProbeDiscoveryMap;
}

export async function buildUnreachableProductsReport(
  pages: CrawledPage[],
  issues: SeoIssue[],
  linkGraphSummary: LinkGraphSummaryRow[],
  options: UnreachableProductsReportOptions = {}
): Promise<UnreachableProductReportRow[]> {
  const pagesByUrl = new Map(pages.map((page) => [normalizeUrl(page.finalUrl), page]));
  const summaryByUrl = new Map(linkGraphSummary.map((row) => [normalizeUrl(row.url), row]));
  const crawledCollectionUrls = buildCrawledCollectionUrlSet(pages);
  const noHtmlIssueUrls = new Set(
    issues
      .filter((issue) => issue.code === "no_html_inbound_link")
      .map((issue) => normalizeUrl(issue.url))
      .filter(Boolean)
  );

  const rows = [...noHtmlIssueUrls]
    .map((url) => {
      const page = pagesByUrl.get(url);
      if (!isProductUrl(url, page)) return undefined;

      const summary = summaryByUrl.get(url);
      const reachableVia = toReachableVia(page?.discoverySource) ?? issueReachableVia(issues, url);

      return {
        url,
        handle: extractProductHandle(url),
        discovery_source: reachableVia ?? page?.discoverySource ?? "",
        inbound_count: summary?.inbound_count ?? 0,
        pagerank_score: summary?.pagerank_score ?? 0,
        collection_memberships: "",
        collection_is_crawled: "",
        bucket: "A_no_collection" as UnreachableProductBucket,
        collections_count: 0
      };
    })
    .filter((row): row is UnreachableProductReportRow => Boolean(row))
    .sort((left, right) => left.discovery_source.localeCompare(right.discovery_source) || left.url.localeCompare(right.url));

  applyProbeCollectionMemberships(rows, crawledCollectionUrls, options);
  return rows;
}

export function buildUnreachableProductBucketSummary(
  rows: UnreachableProductReportRow[],
): UnreachableProductBucketSummary {
  return rows.reduce<UnreachableProductBucketSummary>((summary, row) => {
    summary.total += 1;
    summary[row.bucket] += 1;
    return summary;
  }, {
    total: 0,
    A_no_collection: 0,
    B_collection_crawled_not_linked: 0,
    C_collection_not_crawled: 0
  });
}

function applyProbeCollectionMemberships(
  rows: UnreachableProductReportRow[],
  crawledCollectionUrls: Set<string>,
  options: UnreachableProductsReportOptions
): void {
  for (const row of rows) {
    const collectionHandles = [...(options.probeDiscoveryMap?.get(row.handle) ?? new Set<string>())]
      .map((handle) => handle.trim())
      .filter(Boolean)
      .sort();

    if (collectionHandles.length === 0) {
      row.collection_memberships = "no_collection";
      row.collection_is_crawled = "";
      row.collections_count = 0;
      row.bucket = "A_no_collection";
      continue;
    }

    row.collection_memberships = collectionHandles.join("|");
    row.collections_count = collectionHandles.length;
    row.collection_is_crawled = collectionHandles
      .map((handle) => `${handle}:${crawledCollectionUrls.has(buildCollectionUrl(row.url, handle, options.baseUrl)) ? "true" : "false"}`)
      .join("|");
    row.bucket = collectionHandles.some((handle) => crawledCollectionUrls.has(buildCollectionUrl(row.url, handle, options.baseUrl)))
      ? "B_collection_crawled_not_linked"
      : "C_collection_not_crawled";
  }
}

function issueReachableVia(issues: SeoIssue[], url: string): string | undefined {
  return issues.find((issue) => issue.code === "no_html_inbound_link" && normalizeUrl(issue.url) === url)?.reachable_via;
}

function isProductUrl(url: string, page: CrawledPage | undefined): boolean {
  if (page?.pageType === "product") return true;

  try {
    return new URL(url).pathname.startsWith("/products/");
  } catch {
    return false;
  }
}

function extractProductHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[0] === "products" ? parts[1] ?? "" : "";
  } catch {
    return "";
  }
}

function buildCrawledCollectionUrlSet(pages: CrawledPage[]): Set<string> {
  const urls = new Set<string>();

  for (const page of pages) {
    if (page.status >= 400 || page.pageType !== "collection") continue;
    const collectionUrl = normalizeBaseCollectionUrl(page.finalUrl);
    if (collectionUrl) urls.add(collectionUrl);
  }

  return urls;
}

function extractCollectionHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[0] === "collections" ? parts[1] ?? "" : "";
  } catch {
    return "";
  }
}

function buildCollectionUrl(productUrl: string, collectionHandle: string, baseUrl: string | undefined): string {
  try {
    return normalizeUrl(new URL(`/collections/${collectionHandle}`, baseUrl ? new URL(baseUrl).origin : new URL(productUrl).origin).toString());
  } catch {
    return "";
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

function normalizeBaseCollectionUrl(url: string): string {
  const handle = extractCollectionHandle(url);
  if (!handle) return "";
  return buildCollectionUrl(url, handle, undefined);
}
