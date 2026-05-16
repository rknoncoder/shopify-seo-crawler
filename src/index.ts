import config from "./config/config.js";
import { getBooleanOverride, getCrawlMode, getNumericOverride, getSitemapUrls, getStringOverride, getTargetUrlConfig } from "./config/runtimeConfig.js";
import { buildSiteProfile } from "./classifier/siteClassifier.js";
import { detectSitemapIndexabilityIssues } from "./analyzer/sitemapIndexabilityAnalyzer.js";
import { startCrawler } from "./crawler/crawler.js";
import {
  classifySitemapByUrlName,
  detectSitemapUrls,
  inspectSitemapIndex,
  parseSitemap,
  type SitemapDetectionResult
} from "./crawler/sitemapDetector.js";
import { buildActionPlan, countIssuesByCode } from "./reports/actionPlan.js";
import { buildContentCannibalizationReport } from "./reports/contentCannibalizationReport.js";
import { buildIndexabilityReport } from "./reports/indexabilityReport.js";
import { buildPageSpeedInsightsReport, type PageSpeedInsightsOptions, type PageSpeedStrategy } from "./reports/pageSpeedInsightsReport.js";
import { buildRedirectReport } from "./reports/redirectReport.js";
import { buildRichResultEligibilityReport } from "./reports/richResultEligibilityReport.js";
import { buildSchemaInventory, buildSchemaSummary } from "./reports/schemaInventory.js";
import { summarizeIndexability } from "./utils/indexability.js";
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

  const crawledFromSitemap = crawlMode !== "single" && urls.length > 0;
  const finalUrls = urls.length > 0 ? urls : [targetUrl];
  console.log(`Final URLs selected: ${finalUrls.length}`);

  const result = await startCrawler(finalUrls, { followLinks: !crawledFromSitemap });
  const sitemapIndexabilityIssues = detectSitemapIndexabilityIssues(result.pages, finalUrls);
  const issues = [...result.issues, ...sitemapIndexabilityIssues];
  const actionPlan = buildActionPlan(issues);
  const profile = buildSiteProfile(targetUrl, result.pages, countIssuesByCode(issues));
  const schemaInventory = buildSchemaInventory(result.pages);
  const schemaSummary = buildSchemaSummary(result.pages);
  const contentCannibalizationReport = buildContentCannibalizationReport(result.pages);
  const indexabilityReport = buildIndexabilityReport(result.pages, finalUrls);
  const redirectReport = buildRedirectReport(result.pages);
  const richResultEligibilityReport = buildRichResultEligibilityReport(result.pages, issues);
  const pageSpeedOptions = getPageSpeedInsightsOptions();
  const pageSpeedUrls = result.pages.filter((page) => page.status === 200).map((page) => page.finalUrl);
  const pageSpeedReport = await buildPageSpeedInsightsReport(pageSpeedUrls, pageSpeedOptions);
  const excelOptions = getExcelExportOptions(result.pages.length);

  await saveJson("data/raw/output.json", result.pages);
  await saveCsv("data/reports/pages.csv", result.pages.map(flattenPage));
  await saveJson("data/reports/indexability-report.json", indexabilityReport);
  await saveCsv("data/reports/indexability-report.csv", indexabilityReport);
  await saveJson("data/reports/content-cannibalization-report.json", contentCannibalizationReport);
  await saveCsv("data/reports/content-cannibalization-report.csv", contentCannibalizationReport);
  await saveJson("data/reports/redirect-report.json", redirectReport);
  await saveCsv("data/reports/redirect-report.csv", redirectReport);
  await saveJson("data/reports/rich-result-eligibility.json", richResultEligibilityReport);
  await saveCsv("data/reports/rich-result-eligibility.csv", richResultEligibilityReport);
  await saveJson("data/reports/pagespeed-report.json", pageSpeedReport);
  await saveCsv("data/reports/pagespeed-report.csv", pageSpeedReport);
  await saveJson("data/reports/schema-inventory.json", schemaInventory);
  await saveCsv("data/reports/schema-inventory.csv", schemaInventory);
  await saveJson("data/reports/schema-summary.json", schemaSummary);
  await saveCsv("data/reports/schema-summary.csv", schemaSummary);
  await saveIssuesJson(issues);
  await saveIssuesCsv(issues);
  await saveJson("data/reports/action-plan.json", actionPlan);
  await saveCsv("data/reports/action-plan.csv", actionPlan.map((item) => ({ ...item, sampleUrls: item.sampleUrls.join("|") })));
  await saveSiteProfileJson(profile);
  await saveSiteProfileCsv(profile);
  const excelPath = excelOptions.enabled
    ? await exportExcel(result.pages, issues, actionPlan, profile, schemaInventory, schemaSummary, indexabilityReport, pageSpeedReport, richResultEligibilityReport, redirectReport, contentCannibalizationReport)
    : "";

  console.log(`Crawled pages: ${result.pages.length}`);
  console.log(`Issues found: ${issues.length}`);
  if (pageSpeedOptions.enabled) {
    console.log(`PageSpeed Insights URLs tested: ${pageSpeedReport.length}`);
  }
  if (excelPath) {
    console.log(`Excel export completed: ${excelPath}`);
  } else {
    console.log(`Excel export skipped: ${excelOptions.reason}`);
  }
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

  if (getBooleanOverride("--memory-safe", "SHOPIFY_CRAWLER_MEMORY_SAFE")) {
    config.storage.maxStoredLinksPerPage = 60;
    config.storage.maxStoredImagesPerPage = 20;
    config.storage.maxStoredTextSampleChars = 1000;
  }

  config.storage.maxStoredLinksPerPage = getNumericOverride("--max-stored-links", "SHOPIFY_CRAWLER_MAX_STORED_LINKS") ?? config.storage.maxStoredLinksPerPage;
  config.storage.maxStoredImagesPerPage = getNumericOverride("--max-stored-images", "SHOPIFY_CRAWLER_MAX_STORED_IMAGES") ?? config.storage.maxStoredImagesPerPage;
  config.storage.maxStoredTextSampleChars = getNumericOverride("--max-stored-text", "SHOPIFY_CRAWLER_MAX_STORED_TEXT") ?? config.storage.maxStoredTextSampleChars;
}

function getPageSpeedInsightsOptions(): PageSpeedInsightsOptions {
  const rawStrategy = (getStringOverride("--pagespeed-strategy", "SHOPIFY_CRAWLER_PAGESPEED_STRATEGY") || "mobile").toLowerCase();
  const strategy: PageSpeedStrategy = rawStrategy === "desktop" ? "desktop" : "mobile";

  return {
    enabled: getBooleanOverride("--pagespeed", "SHOPIFY_CRAWLER_PAGESPEED"),
    limit: getNumericOverride("--pagespeed-limit", "SHOPIFY_CRAWLER_PAGESPEED_LIMIT") ?? 10,
    strategy,
    apiKey: getStringOverride("--pagespeed-key", "PAGESPEED_API_KEY") || process.env.SHOPIFY_CRAWLER_PAGESPEED_KEY
  };
}

function getExcelExportOptions(pageCount: number): { enabled: boolean; reason: string } {
  if (getBooleanOverride("--no-excel", "SHOPIFY_CRAWLER_NO_EXCEL")) {
    return { enabled: false, reason: "--no-excel was set." };
  }

  if (getBooleanOverride("--memory-safe", "SHOPIFY_CRAWLER_MEMORY_SAFE")) {
    return { enabled: false, reason: "memory-safe mode skips Excel; CSV/JSON reports were still written." };
  }

  if (getBooleanOverride("--excel", "SHOPIFY_CRAWLER_EXCEL")) {
    return { enabled: true, reason: "--excel was set." };
  }

  const maxExcelPages = getNumericOverride("--excel-max-pages", "SHOPIFY_CRAWLER_EXCEL_MAX_PAGES") ?? 1500;
  if (pageCount > maxExcelPages) {
    return {
      enabled: false,
      reason: `page count ${pageCount} is above Excel auto limit ${maxExcelPages}; use --excel to force it.`
    };
  }

  return { enabled: true, reason: "within Excel auto limit." };
}

function flattenPage(page: Awaited<ReturnType<typeof startCrawler>>["pages"][number]): Record<string, unknown> {
  const indexability = summarizeIndexability(page);

  return {
    url: page.finalUrl,
    requestedUrl: page.url,
    redirected: page.redirected,
    redirectCount: page.redirectCount,
    status: page.status,
    pageType: page.pageType,
    title: page.meta.title,
    description: page.meta.description,
    canonical: page.meta.canonical,
    robots: page.meta.robots,
    indexable: indexability.indexable,
    indexabilityStatus: indexability.status,
    canonicalTarget: indexability.canonicalTarget,
    canonicalSelfReferencing: indexability.canonicalSelfReferencing,
    h1: page.headings.h1.join("|"),
    h1Count: page.headings.h1.length,
    wordCount: page.wordCount,
    htmlSizeKb: page.speed.htmlSizeKb,
    domElementCount: page.speed.domElementCount,
    scriptCount: page.speed.scriptCount,
    externalScriptCount: page.speed.externalScriptCount,
    thirdPartyScriptCount: page.speed.thirdPartyScriptCount,
    shopifyAppScriptCount: page.speed.shopifyAppScriptCount,
    stylesheetCount: page.speed.stylesheetCount,
    renderBlockingStylesheetCount: page.speed.renderBlockingStylesheetCount,
    largeImageUrlCount: page.speed.largeImageUrlCount,
    primaryImageFetchPriority: page.speed.primaryImageFetchPriority,
    primaryImageLazy: page.speed.primaryImageLazy,
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
