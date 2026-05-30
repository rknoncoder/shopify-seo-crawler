import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { delay, fetchPage } from "../crawler/fetcher.js";
import { toReachableVia } from "../utils/discoverySource.js";
import type { LinkGraphSummaryRow } from "./linkGraphReport.js";

export interface UnreachableProductReportRow {
  url: string;
  handle: string;
  discovery_source: string;
  inbound_count: number;
  pagerank_score: number;
  collection_memberships: string;
  collection_is_crawled: string;
  collections_count: number;
}

export type ProductCollectionMembershipFetcher = (handle: string, productJsonUrl: string) => Promise<string[] | undefined>;

export interface UnreachableProductsReportOptions {
  baseUrl?: string;
  concurrency?: number;
  requestDelayMs?: number;
  fetchCollectionMemberships?: ProductCollectionMembershipFetcher;
}

export async function buildUnreachableProductsReport(
  pages: CrawledPage[],
  issues: SeoIssue[],
  linkGraphSummary: LinkGraphSummaryRow[],
  options: UnreachableProductsReportOptions = {}
): Promise<UnreachableProductReportRow[]> {
  const pagesByUrl = new Map(pages.map((page) => [normalizeUrl(page.finalUrl), page]));
  const summaryByUrl = new Map(linkGraphSummary.map((row) => [normalizeUrl(row.url), row]));
  const crawledCollectionHandles = buildCrawledCollectionHandleSet(pages);
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
        collections_count: countCollectionInboundSources(summary)
      };
    })
    .filter((row): row is UnreachableProductReportRow => Boolean(row))
    .sort((left, right) => left.discovery_source.localeCompare(right.discovery_source) || left.url.localeCompare(right.url));

  await enrichCollectionMemberships(rows, crawledCollectionHandles, options);
  return rows;
}

async function enrichCollectionMemberships(
  rows: UnreachableProductReportRow[],
  crawledCollectionHandles: Set<string>,
  options: UnreachableProductsReportOptions
): Promise<void> {
  const fetchMemberships = options.fetchCollectionMemberships ?? defaultCollectionMembershipFetcher(options.baseUrl);
  if (!fetchMemberships) return;

  const membershipFetcher: ProductCollectionMembershipFetcher = fetchMemberships;
  const concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 2)));
  const requestDelayMs = Math.max(0, options.requestDelayMs ?? 250);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex];
      nextIndex += 1;
      await enrichRow(row, crawledCollectionHandles, membershipFetcher, requestDelayMs);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
}

async function enrichRow(
  row: UnreachableProductReportRow,
  crawledCollectionHandles: Set<string>,
  fetchMemberships: ProductCollectionMembershipFetcher,
  requestDelayMs: number
): Promise<void> {
  try {
    const productJsonUrl = buildProductJsonUrl(row.url);
    const handles = await fetchMemberships(row.handle, productJsonUrl);
    if (handles === undefined) {
      row.collection_memberships = "not_exposed";
      row.collection_is_crawled = "not_exposed";
      row.collections_count = 0;
      return;
    }

    const uniqueHandles = [...new Set(handles.map((handle) => handle.trim()).filter(Boolean))].sort();
    row.collection_memberships = uniqueHandles.join("|");
    row.collection_is_crawled = uniqueHandles
      .map((handle) => `${handle}:${crawledCollectionHandles.has(handle) ? "true" : "false"}`)
      .join("|");
    row.collections_count = uniqueHandles.length;
  } catch {
    row.collection_memberships = "lookup_failed";
    row.collection_is_crawled = "lookup_failed";
    row.collections_count = 0;
  }

  if (requestDelayMs > 0) {
    await delay(requestDelayMs);
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

function countCollectionInboundSources(summary: LinkGraphSummaryRow | undefined): number {
  if (!summary) return 0;
  return summary.inbound_sources.filter(isCollectionUrl).length;
}

function buildCrawledCollectionHandleSet(pages: CrawledPage[]): Set<string> {
  const handles = new Set<string>();

  for (const page of pages) {
    if (page.status >= 400 || page.pageType !== "collection") continue;
    const handle = extractCollectionHandle(page.finalUrl);
    if (handle) handles.add(handle);
  }

  return handles;
}

function extractCollectionHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[0] === "collections" ? parts[1] ?? "" : "";
  } catch {
    return "";
  }
}

function isCollectionUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith("/collections/");
  } catch {
    return false;
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

function defaultCollectionMembershipFetcher(baseUrl: string | undefined): ProductCollectionMembershipFetcher | undefined {
  if (!baseUrl) return undefined;

  return async (handle: string) => {
    const productJsonUrl = buildProductJsonUrl(new URL(`/products/${handle}`, new URL(baseUrl).origin).toString());
    const response = await fetchPage(productJsonUrl);
    if (response.status < 200 || response.status >= 300) return [];
    return extractCollectionHandlesFromProductJson(response.html);
  };
}

function buildProductJsonUrl(productUrl: string): string {
  const parsed = new URL(productUrl);
  const pathname = parsed.pathname.endsWith(".json") ? parsed.pathname : `${parsed.pathname}.json`;
  parsed.pathname = pathname;
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

function extractCollectionHandlesFromProductJson(rawJson: string): string[] | undefined {
  const parsed = JSON.parse(rawJson) as unknown;
  const product = getObjectProperty(parsed, "product") ?? parsed;
  const collections = getObjectProperty(product, "collections");

  if (collections === undefined) return undefined;
  if (!Array.isArray(collections)) return [];

  return collections.map(extractHandleFromCollectionValue).filter(Boolean);
}

function extractHandleFromCollectionValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.handle === "string") return record.handle;
  if (typeof record.url === "string") return extractCollectionHandle(record.url);
  if (typeof record.href === "string") return extractCollectionHandle(record.href);
  return "";
}

function getObjectProperty(value: unknown, property: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[property] : undefined;
}
