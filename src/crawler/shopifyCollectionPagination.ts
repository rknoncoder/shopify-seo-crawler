import * as cheerio from "cheerio";
import config from "../config/config.js";
import { extractLinks } from "../parser/linkExtractor.js";
import { fetchPage, sleepBetweenRequests } from "./fetcher.js";
import type { LinkInfo } from "../types/page.js";
import { getShopifyProductCanonicalUrl, isCollectionUrl, shouldSkipUrl } from "../utils/urlUtils.js";
import { UrlManager } from "./urlManager.js";

const SHOPIFY_COLLECTION_PAGE_LIMIT = 250;
const MAX_COLLECTION_PAGINATION_PROBES = 20;

interface DiscoverCollectionPaginationOptions {
  collectionUrl: string;
  baseUrl: string;
  depth: number;
  initialLinks: LinkInfo[];
  manager: UrlManager;
  onRequest: () => void;
}

export async function discoverShopifyCollectionPagination(options: DiscoverCollectionPaginationOptions): Promise<void> {
  if (config.crawlMode !== "discover") return;
  if (!isCollectionUrl(options.collectionUrl)) return;
  if (options.depth + 1 > config.maxDepth) return;

  const seenProductUrls = new Set<string>();
  addProductLinks(options.initialLinks, seenProductUrls, options.manager, options.depth + 1, options.baseUrl);

  for (let pageNumber = 1; pageNumber <= MAX_COLLECTION_PAGINATION_PROBES; pageNumber += 1) {
    const pageUrl = buildShopifyCollectionPageUrl(options.collectionUrl, pageNumber);
    let productLinks: LinkInfo[];

    try {
      options.onRequest();
      const fetched = await fetchPage(pageUrl);
      if (fetched.status >= 400) break;
      if (!fetched.contentType.includes("text/html") && fetched.html.trim().startsWith("<") === false) break;

      productLinks = extractProductLinks(fetched.html, fetched.finalUrl);
    } catch {
      break;
    }

    const newProducts = addProductLinks(productLinks, seenProductUrls, options.manager, options.depth + 1, options.baseUrl);
    if (pageNumber > 1 && (productLinks.length === 0 || newProducts === 0)) break;

    if (config.crawlDelayMs > 0) {
      await sleepBetweenRequests(config.crawlDelayMs);
    }
  }
}

function buildShopifyCollectionPageUrl(collectionUrl: string, pageNumber: number): string {
  const url = new URL(collectionUrl);
  url.search = "";
  url.searchParams.set("limit", String(SHOPIFY_COLLECTION_PAGE_LIMIT));
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function extractProductLinks(html: string, baseUrl: string): LinkInfo[] {
  const $ = cheerio.load(html);
  return extractLinks($, baseUrl).filter((link) => Boolean(getShopifyProductCanonicalUrl(link.href)));
}

function addProductLinks(
  links: LinkInfo[],
  seenProductUrls: Set<string>,
  manager: UrlManager,
  depth: number,
  baseUrl: string
): number {
  let added = 0;

  for (const link of links) {
    const productUrl = getShopifyProductCanonicalUrl(link.href);
    if (!productUrl || seenProductUrls.has(productUrl) || shouldSkipUrl(productUrl, baseUrl)) continue;

    seenProductUrls.add(productUrl);
    if (manager.add(productUrl, depth)) {
      added += 1;
    }
  }

  return added;
}
