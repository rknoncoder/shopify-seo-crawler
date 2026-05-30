import * as cheerio from "cheerio";
import config from "../config/config.js";
import { fetchPage, sleepBetweenRequests } from "./fetcher.js";
import { shouldSkipUrl } from "../utils/urlUtils.js";
import { UrlManager } from "./urlManager.js";

const SHOPIFY_COLLECTION_PAGE_LIMIT = 250;
const MAX_PROBE_PAGES = 20;

interface DiscoverCollectionPaginationOptions {
  collectionUrl: string;
  baseUrl: string;
  depth: number;
  status: number;
  manager: UrlManager;
  onRequest: () => void;
}

export interface CollectionProbeResult {
  attempted: number;
  exhausted: number;
  failed: number;
  pagesFetched: number;
  discoveredProducts: number;
  productsFound: number;
  stopReason: string;
  pages: CollectionProbePageResult[];
}

export interface CollectionProbePageResult {
  page: number;
  products_found: number;
  new: number;
}

export function emptyCollectionProbeResult(): CollectionProbeResult {
  return {
    attempted: 0,
    exhausted: 0,
    failed: 0,
    pagesFetched: 0,
    discoveredProducts: 0,
    productsFound: 0,
    stopReason: "not_attempted",
    pages: []
  };
}

export function buildShopifyCollectionProductsApiUrl(collectionUrl: string, pageNumber: number): string {
  const parsed = new URL(collectionUrl);
  const handle = parsed.pathname.split("/").filter(Boolean)[1];
  const url = new URL(`/collections/${handle}/products.json`, parsed.origin);
  url.searchParams.set("limit", String(SHOPIFY_COLLECTION_PAGE_LIMIT));
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

export function buildShopifyCollectionHtmlProbeUrl(collectionUrl: string, pageNumber: number): string {
  const parsed = new URL(collectionUrl);
  parsed.search = "";
  parsed.hash = "";
  parsed.searchParams.set("limit", String(SHOPIFY_COLLECTION_PAGE_LIMIT));
  parsed.searchParams.set("page", String(pageNumber));
  return parsed.toString();
}

export async function discoverShopifyCollectionPagination(options: DiscoverCollectionPaginationOptions): Promise<CollectionProbeResult> {
  const result = emptyCollectionProbeResult();
  if (config.crawlMode !== "discover") return result;
  if (!shouldProbeShopifyCollectionPagination(options.collectionUrl, options.status)) return result;

  const seenProductUrls = new Set<string>();
  const productDepth = Math.min(options.depth + 1, config.maxDepth);
  let useJsonProbe = true;
  let totalProductHandles = 0;
  result.attempted = 1;
  result.stopReason = "max_probe_pages";

  logProbeStart(options.collectionUrl);

  for (let pageNumber = 1; pageNumber <= MAX_PROBE_PAGES; pageNumber += 1) {
    let products: Array<{ handle?: unknown }>;

    try {
      result.pagesFetched += 1;
      const probePage = await fetchProbePage(options.collectionUrl, pageNumber, useJsonProbe, options.onRequest);
      if (probePage.usedJsonProbe === false) {
        useJsonProbe = false;
      }
      if (probePage.bothTiersFailed) {
        logProbeSkip(options.collectionUrl);
        result.failed = 1;
        result.stopReason = "both_tiers_failed";
        break;
      }
      if (shouldBreakProbeForStatus(probePage.status)) {
        result.failed = 1;
        result.stopReason = "failed_status";
        break;
      }
      if (probePage.body.trim() === "") {
        result.failed = 1;
        result.stopReason = "empty_response";
        break;
      }

      products = probePage.usedJsonProbe
        ? parseProductsJson(probePage.body)
        : parseProductsFromHtml(probePage.body, options.collectionUrl);
    } catch {
      result.failed = 1;
      result.stopReason = "parse_or_fetch_error";
      break;
    }

    const probeResult = addProductHandles(products, seenProductUrls, options.manager, productDepth, options.baseUrl);
    totalProductHandles += probeResult.newProductHandles;
    result.productsFound = totalProductHandles;
    result.discoveredProducts += probeResult.enqueuedUrls;
    result.pages.push({
      page: pageNumber,
      products_found: products.length,
      new: probeResult.newProductHandles
    });

    logProbePage(options.collectionUrl, pageNumber, products.length, probeResult.newProductHandles, probeResult.newProductHandles === 0);
    if (probeResult.newProductHandles === 0) {
      result.exhausted = 1;
      result.stopReason = "zero_new_products";
      break;
    }

    if (config.crawlDelayMs > 0) {
      await sleepBetweenRequests(config.crawlDelayMs);
    }
  }

  logProbeEnd(options.collectionUrl, totalProductHandles, result.pagesFetched);
  return result;
}

export function shouldBreakProbeForStatus(status: number): boolean {
  return status === 404 || status >= 500;
}

export function shouldProbeShopifyCollectionPagination(collectionUrl: string, status: number): boolean {
  if (status !== 200) return false;

  try {
    const parsed = new URL(collectionUrl);
    if (parsed.searchParams.has("page")) return false;
    if (parsed.search) return false;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "collections" || !parts[1]) return false;
    if (parts[2] === "products") return false;
    if (parts[1].toLowerCase() === "all") return false;

    return true;
  } catch {
    return false;
  }
}

interface ProbePageResult {
  body: string;
  status: number;
  usedJsonProbe: boolean;
  bothTiersFailed: boolean;
}

async function fetchProbePage(
  collectionUrl: string,
  pageNumber: number,
  useJsonProbe: boolean,
  onRequest: () => void
): Promise<ProbePageResult> {
  if (!useJsonProbe) {
    onRequest();
    const htmlPage = await fetchPage(buildShopifyCollectionHtmlProbeUrl(collectionUrl, pageNumber));
    return {
      body: htmlPage.html,
      status: htmlPage.status,
      usedJsonProbe: false,
      bothTiersFailed: false
    };
  }

  onRequest();
  const jsonPage = await fetchPage(buildShopifyCollectionProductsApiUrl(collectionUrl, pageNumber));
  if (pageNumber !== 1 || jsonPage.status !== 404) {
    return {
      body: jsonPage.html,
      status: jsonPage.status,
      usedJsonProbe: true,
      bothTiersFailed: false
    };
  }

  onRequest();
  const htmlPage = await fetchPage(buildShopifyCollectionHtmlProbeUrl(collectionUrl, pageNumber));
  return {
    body: htmlPage.html,
    status: htmlPage.status,
    usedJsonProbe: false,
    bothTiersFailed: shouldBreakProbeForStatus(htmlPage.status) || htmlPage.html.trim() === ""
  };
}

interface AddProductHandlesResult {
  newProductHandles: number;
  enqueuedUrls: number;
}

function addProductHandles(
  products: Array<{ handle?: unknown }>,
  seenProductUrls: Set<string>,
  manager: UrlManager,
  depth: number,
  baseUrl: string
): AddProductHandlesResult {
  let newProductHandles = 0;
  let enqueuedUrls = 0;

  for (const product of products) {
    if (typeof product.handle !== "string" || product.handle.trim() === "") continue;

    const productUrl = new URL(`/products/${product.handle.trim()}`, baseUrl).toString();
    if (!productUrl || seenProductUrls.has(productUrl) || shouldSkipUrl(productUrl, baseUrl)) continue;

    seenProductUrls.add(productUrl);
    newProductHandles += 1;
    if (manager.add(productUrl, depth, "pagination_probe")) {
      enqueuedUrls += 1;
    }
  }

  return {
    newProductHandles,
    enqueuedUrls
  };
}

function parseProductsJson(rawJson: string): Array<{ handle?: unknown }> {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object" || !("products" in parsed)) return [];

  const products = (parsed as { products?: unknown }).products;
  return Array.isArray(products) ? products as Array<{ handle?: unknown }> : [];
}

function parseProductsFromHtml(html: string, collectionUrl: string): Array<{ handle?: unknown }> {
  const $ = cheerio.load(html);
  const collectionOrigin = new URL(collectionUrl).origin;
  const handles = new Set<string>();

  $("a[href]").each((_, element) => {
    const rawHref = $(element).attr("href") || "";
    let parsed: URL;

    try {
      parsed = new URL(rawHref, collectionUrl);
    } catch {
      return;
    }

    if (parsed.origin !== collectionOrigin) return;

    const parts = parsed.pathname.split("/").filter(Boolean);
    const productsIndex = parts.indexOf("products");
    const handle = productsIndex >= 0 ? parts[productsIndex + 1] : "";
    if (handle) handles.add(handle);
  });

  return [...handles].map((handle) => ({ handle }));
}

function logProbeSkip(collectionUrl: string): void {
  console.log(`[PROBE SKIP] ${collectionPath(collectionUrl)} — both JSON and HTML probes failed on page 1`);
}

function logProbeStart(collectionUrl: string): void {
  console.log(`[PROBE START] ${collectionPath(collectionUrl)} — starting pagination probe`);
}

function logProbePage(
  collectionUrl: string,
  pageNumber: number,
  productHandleCount: number,
  newProductHandleCount: number,
  stopping: boolean
): void {
  const stopSuffix = stopping ? " → stopping" : "";
  console.log(`[PROBE PAGE]  ${collectionPath(collectionUrl)} page=${pageNumber} — found ${productHandleCount} product handles, ${newProductHandleCount} new${stopSuffix}`);
}

function logProbeEnd(collectionUrl: string, totalProductHandles: number, pagesFetched: number): void {
  console.log(`[PROBE END]   ${collectionPath(collectionUrl)} — total ${totalProductHandles} products discovered in ${pagesFetched} pages`);
}

function collectionPath(collectionUrl: string): string {
  try {
    return new URL(collectionUrl).pathname;
  } catch {
    return collectionUrl;
  }
}
