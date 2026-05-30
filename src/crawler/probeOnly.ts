import config from "../config/config.js";
import { delay, fetchPage } from "./fetcher.js";
import { discoverShopifyCollectionPagination } from "./shopifyCollectionPagination.js";
import { UrlManager } from "./urlManager.js";

const SHOPIFY_COLLECTION_LIMIT = 250;

export interface ProbeDebugPage {
  page: number;
  products_found: number;
  new: number;
}

export interface ProbeDebugCollection {
  handle: string;
  url: string;
  probe_pages_fetched: number;
  products_found: number;
  stop_reason: string;
  pages: ProbeDebugPage[];
}

export interface ProbeDebugReport {
  collections: ProbeDebugCollection[];
  total_collections_probed: number;
  total_products_discovered: number;
  probe_only_mode: true;
}

interface ShopifyCollectionSeed {
  handle: string;
  url: string;
}

export async function runProbeOnlyCrawl(baseUrl: string): Promise<ProbeDebugReport> {
  const previousCrawlMode = config.crawlMode;
  const previousMaxPages = config.maxPages;
  const previousMaxDepth = config.maxDepth;

  config.crawlMode = "discover";
  config.maxPages = Number.MAX_SAFE_INTEGER;
  config.maxDepth = Math.max(config.maxDepth, 1);

  try {
    const manager = new UrlManager(baseUrl);
    const collections = await seedCollectionsForProbe(baseUrl);
    const debugCollections: ProbeDebugCollection[] = [];
    let totalCollectionsProbed = 0;
    let totalProductsDiscovered = 0;

    for (const collection of collections) {
      const result = await discoverShopifyCollectionPagination({
        collectionUrl: collection.url,
        baseUrl,
        depth: 0,
        status: 200,
        manager,
        onRequest: () => undefined
      });

      if (result.attempted === 1) {
        totalCollectionsProbed += 1;
      }
      totalProductsDiscovered += result.discoveredProducts;
      debugCollections.push({
        handle: collection.handle,
        url: collectionPath(collection.url),
        probe_pages_fetched: result.pagesFetched,
        products_found: result.productsFound,
        stop_reason: result.stopReason,
        pages: result.pages
      });
    }

    return {
      collections: debugCollections,
      total_collections_probed: totalCollectionsProbed,
      total_products_discovered: totalProductsDiscovered,
      probe_only_mode: true
    };
  } finally {
    config.crawlMode = previousCrawlMode;
    config.maxPages = previousMaxPages;
    config.maxDepth = previousMaxDepth;
  }
}

async function seedCollectionsForProbe(baseUrl: string): Promise<ShopifyCollectionSeed[]> {
  const collections: ShopifyCollectionSeed[] = [];
  const seenHandles = new Set<string>();

  for (let pageNumber = 1; ; pageNumber += 1) {
    const apiUrl = buildCollectionsApiUrl(baseUrl, SHOPIFY_COLLECTION_LIMIT, pageNumber);
    let apiCollections: Array<{ handle?: unknown }>;

    try {
      const fetched = await fetchPage(apiUrl);
      if (fetched.status < 200 || fetched.status >= 300) break;

      apiCollections = parseCollectionsJson(fetched.html);
    } catch {
      break;
    }

    if (apiCollections.length === 0) break;

    for (const collection of apiCollections) {
      if (typeof collection.handle !== "string" || collection.handle.trim() === "") continue;

      const handle = collection.handle.trim();
      if (seenHandles.has(handle)) continue;

      seenHandles.add(handle);
      collections.push({
        handle,
        url: new URL(`/collections/${handle}`, baseUrl).toString()
      });
    }

    if (apiCollections.length < SHOPIFY_COLLECTION_LIMIT) break;
    await delay(1000 + Math.floor(Math.random() * 1000));
  }

  console.log(`Seeded ${collections.length} collection URLs from Shopify collections.json.`);
  return collections;
}

function buildCollectionsApiUrl(baseUrl: string, limit: number, pageNumber: number): string {
  const origin = new URL(baseUrl).origin;
  const url = new URL("/collections.json", origin);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function parseCollectionsJson(rawJson: string): Array<{ handle?: unknown }> {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object" || !("collections" in parsed)) return [];

  const collections = (parsed as { collections?: unknown }).collections;
  return Array.isArray(collections) ? collections as Array<{ handle?: unknown }> : [];
}

function collectionPath(collectionUrl: string): string {
  try {
    return new URL(collectionUrl).pathname;
  } catch {
    return collectionUrl;
  }
}
