import * as cheerio from "cheerio";
import { analyzeMetadata } from "../analyzer/metadata.js";
import type { FetchResult } from "../types/crawl.js";
import type { CrawledPage, DiscoverySource } from "../types/page.js";
import { extractContentSummary } from "./contentExtractor.js";
import { extractHeadings } from "./headingExtractor.js";
import { extractImages } from "./imageExtractor.js";
import { extractLinks } from "./linkExtractor.js";
import { extractMeta } from "./metaExtractor.js";
import { extractSpeedSignals } from "./speedExtractor.js";
import { detectShopify } from "./shopifyDetector.js";

export function parseHtml(fetchResult: FetchResult, depth: number, discoverySource?: DiscoverySource): CrawledPage {
  const $ = cheerio.load(fetchResult.html);
  const shopify = detectShopify($, fetchResult.finalUrl);
  const content = extractContentSummary($);
  const images = extractImages($, fetchResult.finalUrl);
  const meta = extractMeta($, fetchResult.html);
  const metadataValidation = analyzeMetadata({
    finalUrl: fetchResult.finalUrl,
    pageType: shopify.pageType,
    meta,
    textSample: content.textSample,
    xRobotsTag: fetchResult.http?.xRobotsTag
  });

  return {
    url: fetchResult.url,
    finalUrl: fetchResult.finalUrl,
    discoverySource,
    redirected: fetchResult.redirected,
    redirectCount: fetchResult.redirectCount,
    status: fetchResult.status,
    depth,
    contentType: fetchResult.contentType,
    http: fetchResult.http,
    fetchedAt: new Date().toISOString(),
    loadTimeMs: fetchResult.loadTimeMs,
    pageType: shopify.pageType,
    meta,
    headings: extractHeadings($),
    wordCount: content.wordCount,
    textSample: content.textSample,
    textHash: content.textHash,
    images,
    links: extractLinks($, fetchResult.finalUrl),
    shopify,
    speed: extractSpeedSignals($, fetchResult.html, fetchResult.finalUrl, images),
    metadataValidation,
    issues: []
  };
}
