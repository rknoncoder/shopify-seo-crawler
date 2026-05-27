import config from "../config/config.js";
import { fetchPage, sleepBetweenRequests } from "./fetcher.js";
import { isCollectionUrl, shouldSkipUrl } from "../utils/urlUtils.js";
import { UrlManager } from "./urlManager.js";

const SHOPIFY_COLLECTION_PAGE_LIMIT = 250;
const MAX_COLLECTION_PAGINATION_PROBES = 20;

interface DiscoverCollectionPaginationOptions {
  collectionUrl: string;
  baseUrl: string;
  depth: number;
  manager: UrlManager;
  onRequest: () => void;
}

export async function discoverShopifyCollectionPagination(options: DiscoverCollectionPaginationOptions): Promise<number> {
  if (config.crawlMode !== "discover") return 0;
  if (!isCollectionUrl(options.collectionUrl)) return 0;
  if (options.depth + 1 > config.maxDepth) return 0;

  const seenProductUrls = new Set<string>();
  let discoveredProducts = 0;

  for (let pageNumber = 1; pageNumber <= MAX_COLLECTION_PAGINATION_PROBES; pageNumber += 1) {
    const pageUrl = buildShopifyCollectionProductsApiUrl(options.collectionUrl, pageNumber);
    let products: Array<{ handle?: unknown }>;

    try {
      options.onRequest();
      const fetched = await fetchPage(pageUrl);
      if (fetched.status < 200 || fetched.status >= 300) break;

      products = parseProductsJson(fetched.html);
    } catch {
      break;
    }

    if (products.length === 0) break;

    const newProducts = addProductHandles(products, seenProductUrls, options.manager, options.depth + 1, options.baseUrl);
    discoveredProducts += newProducts;
    if (newProducts === 0) break;

    if (config.crawlDelayMs > 0) {
      await sleepBetweenRequests(config.crawlDelayMs);
    }
  }

  return discoveredProducts;
}

function buildShopifyCollectionProductsApiUrl(collectionUrl: string, pageNumber: number): string {
  const parsed = new URL(collectionUrl);
  const handle = parsed.pathname.split("/").filter(Boolean)[1];
  const url = new URL(`/collections/${handle}/products.json`, parsed.origin);
  url.searchParams.set("limit", String(SHOPIFY_COLLECTION_PAGE_LIMIT));
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function addProductHandles(
  products: Array<{ handle?: unknown }>,
  seenProductUrls: Set<string>,
  manager: UrlManager,
  depth: number,
  baseUrl: string
): number {
  let added = 0;

  for (const product of products) {
    if (typeof product.handle !== "string" || product.handle.trim() === "") continue;

    const productUrl = new URL(`/products/${product.handle.trim()}`, baseUrl).toString();
    if (!productUrl || seenProductUrls.has(productUrl) || shouldSkipUrl(productUrl, baseUrl)) continue;

    seenProductUrls.add(productUrl);
    if (manager.add(productUrl, depth, "pagination_probe")) {
      added += 1;
    }
  }

  return added;
}

function parseProductsJson(rawJson: string): Array<{ handle?: unknown }> {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object" || !("products" in parsed)) return [];

  const products = (parsed as { products?: unknown }).products;
  return Array.isArray(products) ? products as Array<{ handle?: unknown }> : [];
}
