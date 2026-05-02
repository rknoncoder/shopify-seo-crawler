import config from "./config/config.js";
import { getCrawlMode, getNumericOverride, getSitemapUrls, getTargetUrlConfig } from "./config/runtimeConfig.js";
import { buildSiteProfile } from "./classifier/siteClassifier.js";
import { startCrawler } from "./crawler/crawler.js";
import {
  classifySitemapByUrlName,
  detectSitemapUrls,
  inspectSitemapIndex,
  parseSitemap,
  type SitemapDetectionResult
} from "./crawler/sitemapDetector.js";
import { buildActionPlan, countIssuesByCode } from "./reports/actionPlan.js";
import { saveCsv } from "./storage/saveCsv.js";
import { exportExcel } from "./storage/exportExcel.js";
import { saveIssuesCsv } from "./storage/saveIssuesCsv.js";
import { saveIssuesJson } from "./storage/saveIssuesJson.js";
import { saveJson } from "./storage/saveJson.js";
import { saveSiteProfileCsv } from "./storage/saveSiteProfileCsv.js";
import { saveSiteProfileJson } from "./storage/saveSiteProfileJson.js";
import type { SitemapEntry } from "./types/crawl.js";

async function main(): Promise<void> {
  const crawlMode = getCrawlMode(config.crawlMode);
  applyCrawlMode(crawlMode);
  applyNumericOverrides();

  const { targetUrl, source } = getTargetUrlConfig(config.startUrl);
  const manualSitemapUrls = getSitemapUrls();

  console.log(`Target website: ${targetUrl}`);
  console.log(`Crawl source: ${source}`);
  console.log(`Crawl mode: ${crawlMode}`);

  const detectionResult = manualSitemapUrls.length > 0
    ? {
        sitemapUrls: manualSitemapUrls,
        source: "manual",
        status: "found",
        attempts: [],
        detectedSeoPlugins: [],
        unavailableReason: ""
      } satisfies SitemapDetectionResult
    : crawlMode === "single"
      ? {
          sitemapUrls: [],
          source: "none",
          status: "skipped",
          attempts: [],
          detectedSeoPlugins: [],
          unavailableReason: "Single URL crawl requested."
        } satisfies SitemapDetectionResult
      : await detectSitemapUrls(targetUrl);

  const sitemapInventory = await buildSitemapInventory(detectionResult);
  await saveJson("data/raw/sitemaps.json", sitemapInventory);

  const urls = crawlMode === "single"
    ? [targetUrl]
    : await extractUrlsForCrawl(sitemapInventory.sitemaps.filter((sitemap) => sitemap.selectedForCrawl));

  const finalUrls = urls.length > 0 ? urls : [targetUrl];
  console.log(`Final URLs selected: ${finalUrls.length}`);

  const result = await startCrawler(finalUrls);
  const actionPlan = buildActionPlan(result.issues);
  const profile = buildSiteProfile(targetUrl, result.pages, countIssuesByCode(result.issues));

  await saveJson("data/raw/output.json", result.pages);
  await saveCsv("data/reports/pages.csv", result.pages.map(flattenPage));
  await saveIssuesJson(result.issues);
  await saveIssuesCsv(result.issues);
  await saveJson("data/reports/action-plan.json", actionPlan);
  await saveCsv("data/reports/action-plan.csv", actionPlan.map((item) => ({ ...item, sampleUrls: item.sampleUrls.join("|") })));
  await saveSiteProfileJson(profile);
  await saveSiteProfileCsv(profile);
  const excelPath = await exportExcel(result.pages, result.issues, actionPlan, profile);

  console.log(`Crawled pages: ${result.pages.length}`);
  console.log(`Issues found: ${result.issues.length}`);
  console.log(`Excel export completed: ${excelPath}`);
}

async function buildSitemapInventory(detectionResult: SitemapDetectionResult): Promise<{
  source: SitemapDetectionResult["source"];
  status: SitemapDetectionResult["status"];
  detectedSitemapUrls: string[];
  attempts: SitemapDetectionResult["attempts"];
  unavailableReason: string;
  totalSitemapsFound: number;
  totalUrlsFound: number;
  selectedSitemapsForCrawl: number;
  sitemaps: SitemapEntry[];
}> {
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

async function extractUrlsForCrawl(sitemaps: SitemapEntry[]): Promise<string[]> {
  const crawlUrls: string[] = [];

  for (const sitemap of sitemaps) {
    if (crawlUrls.length >= config.maxPages) break;
    const parsed = await parseSitemap(sitemap.sitemapUrl, { limit: config.maxPages - crawlUrls.length });
    for (const url of parsed.urls) {
      if (crawlUrls.length < config.maxPages && !crawlUrls.includes(url)) {
        crawlUrls.push(url);
      }
    }
  }

  return crawlUrls;
}

function applyCrawlMode(crawlMode: typeof config.crawlMode): void {
  const modeConfig = config.crawlModes[crawlMode];
  config.crawlMode = crawlMode;
  config.maxPages = modeConfig.maxPages ?? config.maxPages;
  config.maxDepth = modeConfig.maxDepth ?? config.maxDepth;
  if (modeConfig.excludedPathPatterns) config.crawl.excludedPathPatterns = modeConfig.excludedPathPatterns;
  if (modeConfig.sitemapSelection) config.sitemapSelection = modeConfig.sitemapSelection;
}

function applyNumericOverrides(): void {
  config.maxPages = getNumericOverride("--max-pages", "SHOPIFY_CRAWLER_MAX_PAGES") ?? config.maxPages;
  config.maxDepth = getNumericOverride("--max-depth", "SHOPIFY_CRAWLER_MAX_DEPTH") ?? config.maxDepth;
}

function flattenPage(page: Awaited<ReturnType<typeof startCrawler>>["pages"][number]): Record<string, unknown> {
  return {
    url: page.finalUrl,
    status: page.status,
    pageType: page.pageType,
    title: page.meta.title,
    description: page.meta.description,
    canonical: page.meta.canonical,
    robots: page.meta.robots,
    h1: page.headings.h1.join("|"),
    h1Count: page.headings.h1.length,
    wordCount: page.wordCount,
    images: page.images.length,
    missingAltImages: page.images.filter((image) => !image.alt).length,
    links: page.links.length,
    schemaTypes: page.schemas.map((schema) => schema.type).join("|"),
    isShopify: page.shopify.isShopify,
    detectedApps: page.shopify.detectedApps.join("|"),
    issues: page.issues.join("|")
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
