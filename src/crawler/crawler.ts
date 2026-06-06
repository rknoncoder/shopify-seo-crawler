import * as cheerio from "cheerio";
import PQueue from "p-queue";
import config from "../config/config.js";
import { runAudits } from "../audits/runAudits.js";
import { analyzeSite } from "../analyzer/seoAnalyzer.js";
import { delay, fetchPage, getFetchTelemetry, resetFetchTelemetry, sleepBetweenRequests } from "./fetcher.js";
import { discoverShopifyCollectionPagination } from "./shopifyCollectionPagination.js";
import { UrlManager } from "./urlManager.js";
import { parseHtml } from "../parser/htmlParser.js";
import type { CollectionProbeSummary, CrawlResult, LinkGraph, ProbeDiscoveryMap } from "../types/crawl.js";
import type { ImageInventoryUsage } from "../types/image.js";
import type { CrawledPage } from "../types/page.js";
import type { SeoIssue } from "../types/issue.js";
import { classifyFetchError } from "../utils/fetchFailureClassifier.js";
import { truncate } from "../utils/textUtils.js";
import { shouldSkipUrl } from "../utils/urlUtils.js";

interface StartCrawlerOptions {
  followLinks?: boolean;
}

export async function startCrawler(seedUrls: string[], options: StartCrawlerOptions = {}): Promise<CrawlResult> {
  resetFetchTelemetry();
  const followLinks = options.followLinks ?? true;
  const baseUrl = seedUrls[0];
  const manager = new UrlManager(baseUrl);
  const pages: CrawledPage[] = [];
  const analysisPages: CrawledPage[] = [];
  const pageIssues: SeoIssue[] = [];
  const imageInventoryUsages: ImageInventoryUsage[] = [];
  const linkGraph: LinkGraph = new Map();
  const probeDiscoveryMap: ProbeDiscoveryMap = new Map();
  const collectionProbeSummaries: CollectionProbeSummary[] = [];
  let totalRequested = 0;
  let skippedNonHtmlCount = 0;
  let apiSeededProducts = 0;
  let apiSeededCollections = 0;
  let probeDiscoveredProducts = 0;
  let probeCollectionsAttempted = 0;
  let probeCollectionsExhausted = 0;
  let probeCollectionsFailed = 0;
  let probeTotalPagesFetched = 0;
  let sitemapOnlyProducts = 0;
  const queue = new PQueue({ concurrency: config.concurrency });

  seedUrls.slice(0, config.maxPages).forEach((url) => manager.add(url, 0));
  if (config.crawlMode === "discover") {
    const productSeed = await seedAllProductsFromApi(baseUrl, manager);
    totalRequested += productSeed.apiRequests;
    apiSeededProducts += productSeed.seededUrls;

    const sitemapSeed = await seedUnlistedProductsFromSitemap(baseUrl, manager);
    totalRequested += sitemapSeed.apiRequests;
    sitemapOnlyProducts += sitemapSeed.seededUrls;

    const collectionSeed = await seedAllCollectionsFromApi(baseUrl, manager);
    totalRequested += collectionSeed.apiRequests;
    apiSeededCollections += collectionSeed.seededUrls;
  }

  while (pages.length < config.maxPages) {
    const next = manager.next();
    if (!next) {
      if (queue.size === 0 && queue.pending === 0) break;
      await queue.onIdle();
      continue;
    }

    queue.add(async () => {
      try {
        totalRequested += 1;
        const fetched = await fetchPage(next.url);
        if (!fetched.contentType.includes("text/html") && fetched.html.trim().startsWith("<") === false) {
          skippedNonHtmlCount += 1;
          return;
        }

        const page = parseHtml(fetched, next.depth, next.discoverySource);
        recordLinkGraphEdges(linkGraph, page, baseUrl);
        const issues = runAudits(page);
        page.issues = issues.map((issue) => issue.code);
        pageIssues.push(...issues);
        imageInventoryUsages.push(...buildImageInventoryUsages(page));

        if (followLinks) {
          if (next.depth < config.maxDepth) {
            page.links
              .filter((link) => link.internal && !shouldSkipUrl(link.href, baseUrl))
              .forEach((link) => manager.add(link.href, next.depth + 1));
          }

          const probeResult = await discoverShopifyCollectionPagination({
            collectionUrl: page.finalUrl,
            baseUrl,
            depth: next.depth,
            status: page.status,
            manager,
            probeDiscoveryMap,
            onRequest: () => {
              totalRequested += 1;
            }
          });
          probeDiscoveredProducts += probeResult.discoveredProducts;
          probeCollectionsAttempted += probeResult.attempted;
          probeCollectionsExhausted += probeResult.exhausted;
          probeCollectionsFailed += probeResult.failed;
          probeTotalPagesFetched += probeResult.pagesFetched;
          if (probeResult.attempted === 1) {
            collectionProbeSummaries.push(buildCollectionProbeSummary(page.finalUrl, probeResult));
          }
        }

        analysisPages.push(compactPageForAnalysis(page));
        pages.push(compactPageForStorage(page));
      } catch (error) {
        const fetchIssue = classifyFetchError(error);
        pageIssues.push({
          url: next.url,
          pageType: "unknown",
          severity: fetchIssue.severity,
          category: "technical",
          code: fetchIssue.code,
          message: fetchIssue.message,
          recommendation: fetchIssue.recommendation,
          evidence: fetchIssue.evidence
        });
      } finally {
        if (config.crawlDelayMs > 0) {
          await sleepBetweenRequests(config.crawlDelayMs);
        }
      }
    });

    if (queue.size + queue.pending >= config.concurrency) {
      await queue.onSizeLessThan(config.concurrency);
    }
  }

  await queue.onIdle();
  return {
    pages,
    issues: analyzeSite(analysisPages, pageIssues, linkGraph),
    imageInventoryUsages,
    linkGraph,
    probeDiscoveryMap,
    collectionProbeSummaries,
    telemetry: {
      totalRequested,
      skippedNonHtmlCount,
      apiSeededProducts,
      apiSeededCollections,
      probeDiscoveredProducts,
      probeCollectionsAttempted,
      probeCollectionsExhausted,
      probeCollectionsFailed,
      probeTotalPagesFetched,
      sitemapOnlyProducts,
      retries: getFetchTelemetry()
    }
  };
}

function buildCollectionProbeSummary(
  collectionUrl: string,
  probeResult: Awaited<ReturnType<typeof discoverShopifyCollectionPagination>>
): CollectionProbeSummary {
  return {
    handle: extractCollectionHandle(collectionUrl),
    url: collectionUrl,
    attempted: probeResult.attempted,
    exhausted: probeResult.exhausted,
    failed: probeResult.failed,
    probe_pages_fetched: probeResult.pagesFetched,
    products_found: probeResult.productsFound,
    discovered_products: probeResult.discoveredProducts,
    stop_reason: probeResult.stopReason,
    pages: probeResult.pages
  };
}

function extractCollectionHandle(collectionUrl: string): string {
  try {
    const parts = new URL(collectionUrl).pathname.split("/").filter(Boolean);
    return parts[0] === "collections" ? parts[1] ?? "" : "";
  } catch {
    return "";
  }
}

function recordLinkGraphEdges(linkGraph: LinkGraph, page: CrawledPage, baseUrl: string): void {
  if (page.status >= 400) return;

  const sourceUrl = normalizeLinkGraphUrl(page.finalUrl);
  if (!sourceUrl) return;

  const destinations = new Set<string>();

  for (const link of page.links) {
    if (!link.internal) continue;

    const destinationUrl = normalizeLinkGraphUrl(link.href);
    if (!destinationUrl || isAssetUrl(destinationUrl, baseUrl)) continue;
    if (sourceUrl === destinationUrl) continue;

    destinations.add(destinationUrl);
  }

  linkGraph.set(sourceUrl, destinations);
}

function normalizeLinkGraphUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}

function isAssetUrl(url: string, baseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return true;
  }

  const lowerPath = parsed.pathname.toLowerCase();
  return config.crawl.excludedExtensions.some((extension) => lowerPath.endsWith(extension));
}

interface ApiSeedResult {
  apiRequests: number;
  seededUrls: number;
}

async function seedAllProductsFromApi(baseUrl: string, manager: UrlManager): Promise<ApiSeedResult> {
  const productLimit = 250;
  let apiRequests = 0;
  let seededProducts = 0;

  for (let pageNumber = 1; ; pageNumber += 1) {
    const apiUrl = buildProductsApiUrl(baseUrl, productLimit, pageNumber);
    let products: Array<{ handle?: unknown }>;

    try {
      apiRequests += 1;
      const fetched = await fetchPage(apiUrl);
      if (fetched.status < 200 || fetched.status >= 300) break;

      products = parseProductsJson(fetched.html);
    } catch {
      break;
    }

    if (products.length === 0) break;

    for (const product of products) {
      if (typeof product.handle !== "string" || product.handle.trim() === "") continue;
      const productUrl = new URL(`/products/${product.handle.trim()}`, baseUrl).toString();
      if (manager.add(productUrl, 0, "api_probe")) {
        seededProducts += 1;
      }
    }

    if (products.length < productLimit) break;
    await delay(1000 + Math.floor(Math.random() * 1000));
  }

  console.log(`Seeded ${seededProducts} product URLs from Shopify products.json.`);
  return {
    apiRequests,
    seededUrls: seededProducts
  };
}

async function seedAllCollectionsFromApi(baseUrl: string, manager: UrlManager): Promise<ApiSeedResult> {
  const collectionLimit = 250;
  let apiRequests = 0;
  let seededCollections = 0;

  for (let pageNumber = 1; ; pageNumber += 1) {
    const apiUrl = buildCollectionsApiUrl(baseUrl, collectionLimit, pageNumber);
    let collections: Array<{ handle?: unknown }>;

    try {
      apiRequests += 1;
      const fetched = await fetchPage(apiUrl);
      if (fetched.status < 200 || fetched.status >= 300) break;

      collections = parseCollectionsJson(fetched.html);
    } catch {
      break;
    }

    if (collections.length === 0) break;

    for (const collection of collections) {
      if (typeof collection.handle !== "string" || collection.handle.trim() === "") continue;
      const collectionUrl = new URL(`/collections/${collection.handle.trim()}`, baseUrl).toString();
      if (manager.add(collectionUrl, 0, "api_probe")) {
        seededCollections += 1;
      }
    }

    if (collections.length < collectionLimit) break;
    await delay(1000 + Math.floor(Math.random() * 1000));
  }

  console.log(`Seeded ${seededCollections} collection URLs from Shopify collections.json.`);
  return {
    apiRequests,
    seededUrls: seededCollections
  };
}

async function seedUnlistedProductsFromSitemap(baseUrl: string, manager: UrlManager): Promise<ApiSeedResult> {
  let apiRequests = 0;
  let seededProducts = 0;

  try {
    apiRequests += 1;
    const sitemapIndex = await fetchPage(buildSitemapIndexUrl(baseUrl));
    if (sitemapIndex.status < 200 || sitemapIndex.status >= 300) {
      console.log("Seeded 0 sitemap-only product URLs from Shopify sitemap.");
      return { apiRequests, seededUrls: seededProducts };
    }

    const productSitemapUrls = extractProductSitemapUrls(sitemapIndex.html, sitemapIndex.finalUrl);
    const sitemapUrls = productSitemapUrls.length > 0 ? productSitemapUrls : [sitemapIndex.finalUrl];

    for (const sitemapUrl of sitemapUrls) {
      apiRequests += 1;
      const productSitemap = await fetchPage(sitemapUrl);
      if (productSitemap.status < 200 || productSitemap.status >= 300) continue;

      for (const productUrl of extractProductUrlsFromSitemap(productSitemap.html, productSitemap.finalUrl)) {
        if (manager.add(productUrl, 0, "sitemap_unlisted")) {
          seededProducts += 1;
        }
      }
    }
  } catch {
    // Sitemap discovery is best-effort in discover mode.
  }

  console.log(`Seeded ${seededProducts} sitemap-only product URLs from Shopify sitemap.`);
  return {
    apiRequests,
    seededUrls: seededProducts
  };
}

function buildProductsApiUrl(baseUrl: string, limit: number, pageNumber: number): string {
  const origin = new URL(baseUrl).origin;
  const url = new URL("/products.json", origin);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function buildCollectionsApiUrl(baseUrl: string, limit: number, pageNumber: number): string {
  const origin = new URL(baseUrl).origin;
  const url = new URL("/collections.json", origin);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function buildSitemapIndexUrl(baseUrl: string): string {
  const origin = new URL(baseUrl).origin;
  return new URL("/sitemap.xml", origin).toString();
}

function parseProductsJson(rawJson: string): Array<{ handle?: unknown }> {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object" || !("products" in parsed)) return [];

  const products = (parsed as { products?: unknown }).products;
  return Array.isArray(products) ? products as Array<{ handle?: unknown }> : [];
}

function parseCollectionsJson(rawJson: string): Array<{ handle?: unknown }> {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object" || !("collections" in parsed)) return [];

  const collections = (parsed as { collections?: unknown }).collections;
  return Array.isArray(collections) ? collections as Array<{ handle?: unknown }> : [];
}

function extractProductSitemapUrls(xml: string, baseUrl: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("sitemap > loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter((url) => /sitemap_products/i.test(url))
    .map((url) => normalizeSitemapSeedUrl(url, baseUrl));
}

function extractProductUrlsFromSitemap(xml: string, baseUrl: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set<string>();

  $("url > loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .forEach((url) => {
      const normalized = normalizeProductSitemapUrl(url, baseUrl);
      if (normalized) {
        seen.add(normalized);
      }
    });

  return [...seen];
}

function normalizeSitemapSeedUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeProductSitemapUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "products" || !parts[1]) return "";

    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = `/products/${parts[1]}`;
    return parsed.toString();
  } catch {
    return "";
  }
}

function buildImageInventoryUsages(page: CrawledPage): ImageInventoryUsage[] {
  return page.images.map((image) => ({
    imageUrl: image.src,
    rawSrc: truncate(image.rawSrc, 500),
    alt: truncate(image.alt, 300),
    pageUrl: page.finalUrl,
    pageType: page.pageType,
    width: image.width || "",
    height: image.height || "",
    lazy: image.lazy,
    fetchPriority: image.fetchPriority || ""
  }));
}

function compactPageForAnalysis(page: CrawledPage): CrawledPage {
  return {
    ...page,
    textSample: "",
    links: page.links
      .filter((link) => link.internal)
      .map((link) => ({
        href: link.href,
        rawHref: "",
        text: truncate(link.text, 90),
        rel: [],
        internal: true,
        status: link.status
    })),
    images: []
  };
}

function compactPageForStorage(page: CrawledPage): CrawledPage {
  return {
    ...page,
    textSample: truncate(page.textSample, config.storage.maxStoredTextSampleChars),
    links: page.links.slice(0, config.storage.maxStoredLinksPerPage),
    images: page.images.slice(0, config.storage.maxStoredImagesPerPage)
  };
}
