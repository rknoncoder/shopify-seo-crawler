import config from "../config/config.js";
import {
  classifySitemapByUrlName,
  detectSitemapUrls,
  inspectSitemapIndex,
  parseSitemap,
  type SitemapDetectionResult
} from "../crawler/sitemapDetector.js";
import type { CrawlMode, SitemapEntry } from "../types/crawl.js";

export interface SitemapInventory {
  source: SitemapDetectionResult["source"];
  status: SitemapDetectionResult["status"];
  detectedSitemapUrls: string[];
  attempts: SitemapDetectionResult["attempts"];
  unavailableReason: string;
  totalSitemapsFound: number;
  totalUrlsFound: number;
  selectedSitemapsForCrawl: number;
  sitemaps: SitemapEntry[];
}

export async function resolveSitemapDetection(
  targetUrl: string,
  crawlMode: CrawlMode,
  manualSitemapUrls: string[]
): Promise<SitemapDetectionResult> {
  if (manualSitemapUrls.length > 0) {
    return {
      sitemapUrls: manualSitemapUrls,
      source: "manual",
      status: "found",
      attempts: [],
      detectedSeoPlugins: [],
      unavailableReason: ""
    };
  }

  if (crawlMode === "single") {
    return {
      sitemapUrls: [],
      source: "none",
      status: "skipped",
      attempts: [],
      detectedSeoPlugins: [],
      unavailableReason: "Single URL crawl requested."
    };
  }

  return detectSitemapUrls(targetUrl);
}

export async function buildSitemapInventory(detectionResult: SitemapDetectionResult): Promise<SitemapInventory> {
  const discovered: SitemapEntry[] = [];

  for (const sitemapUrl of detectionResult.sitemapUrls) {
    const inventory = await inspectSitemapIndex(sitemapUrl);
    if (inventory.type === "index") {
      discovered.push(...inventory.childSitemaps);
    } else {
      discovered.push({
        sitemapUrl,
        type: inventory.type,
        sitemapType: classifySitemapByUrlName(sitemapUrl),
        urlCount: inventory.urlCount
      });
    }
  }

  const selected = selectSitemapsForCrawl(discovered);
  const selectedUrls = new Set(selected.map((sitemap) => sitemap.sitemapUrl));
  const sitemaps = discovered.map((sitemap) => ({
    ...sitemap,
    selectedForCrawl: selectedUrls.has(sitemap.sitemapUrl)
  }));

  return {
    source: detectionResult.source,
    status: detectionResult.status,
    detectedSitemapUrls: detectionResult.sitemapUrls,
    attempts: detectionResult.attempts,
    unavailableReason: detectionResult.unavailableReason,
    totalSitemapsFound: discovered.length,
    totalUrlsFound: discovered.reduce((sum, sitemap) => sum + sitemap.urlCount, 0),
    selectedSitemapsForCrawl: selected.length,
    sitemaps
  };
}

export async function extractUrlsForCrawl(sitemaps: SitemapEntry[]): Promise<string[]> {
  const crawlUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const sitemap of sitemaps) {
    if (crawlUrls.length >= config.maxPages) break;
    const parsed = await parseSitemap(sitemap.sitemapUrl, { limit: config.maxPages - crawlUrls.length });
    for (const url of parsed.urls) {
      if (crawlUrls.length < config.maxPages && !seenUrls.has(url)) {
        seenUrls.add(url);
        crawlUrls.push(url);
      }
    }
  }

  return crawlUrls;
}

function selectSitemapsForCrawl(sitemaps: SitemapEntry[]): SitemapEntry[] {
  if (config.sitemapSelection.crawlAll) return sitemaps;

  const selected = sitemaps.filter((sitemap) => {
    const target = `${sitemap.sitemapUrl} ${sitemap.sitemapType}`.toLowerCase();
    const included = config.sitemapSelection.includePatterns.length === 0 ||
      config.sitemapSelection.includePatterns.some((pattern) => target.includes(pattern.toLowerCase()));
    const excluded = config.sitemapSelection.excludePatterns.some((pattern) => target.includes(pattern.toLowerCase()));
    return included && !excluded;
  });

  return selected.length > 0 ? selected : sitemaps;
}
