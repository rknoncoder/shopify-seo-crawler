import { buildCrawlStatsCsvRows } from "../reports/crawlStatsReport.js";
import { exportExcel } from "../storage/exportExcel.js";
import { saveCsv } from "../storage/saveCsv.js";
import { saveIssuesCsv } from "../storage/saveIssuesCsv.js";
import { saveIssuesJson } from "../storage/saveIssuesJson.js";
import { saveJson } from "../storage/saveJson.js";
import { saveSiteProfileCsv } from "../storage/saveSiteProfileCsv.js";
import { saveSiteProfileJson } from "../storage/saveSiteProfileJson.js";
import type { CrawlResult } from "../types/crawl.js";
import type { CrawledPage } from "../types/page.js";
import { summarizeIndexability } from "../utils/indexability.js";
import type { ExcelExportOptions } from "./configureRun.js";
import type { ReportBundle } from "./reportBuilder.js";
import type { SitemapInventory } from "./sitemapInventory.js";

export async function writeSitemapInventory(sitemapInventory: SitemapInventory): Promise<void> {
  await saveJson("data/raw/sitemaps.json", sitemapInventory);
}

export async function writeCrawlOutputs(
  result: CrawlResult,
  reports: ReportBundle,
  excelOptions: ExcelExportOptions
): Promise<string> {
  await saveJson("data/raw/output.json", result.pages);
  await saveCsv("data/reports/pages.csv", result.pages.map(flattenPage));
  await saveJson("data/reports/crawl-stats.json", reports.crawlStatsReport);
  await saveCsv("data/reports/crawl-stats.csv", buildCrawlStatsCsvRows(reports.crawlStatsReport));
  await saveJson("data/reports/indexability-report.json", reports.indexabilityReport);
  await saveCsv("data/reports/indexability-report.csv", reports.indexabilityReport);
  await saveJson("data/reports/content-cannibalization-report.json", reports.contentCannibalizationReport);
  await saveCsv("data/reports/content-cannibalization-report.csv", reports.contentCannibalizationReport);
  await saveJson("data/reports/redirect-report.json", reports.redirectReport);
  await saveCsv("data/reports/redirect-report.csv", reports.redirectReport);
  await saveJson("data/reports/rich-result-eligibility.json", reports.richResultEligibilityReport);
  await saveCsv("data/reports/rich-result-eligibility.csv", reports.richResultEligibilityReport);
  await saveJson("data/reports/pagespeed-report.json", reports.pageSpeedReport);
  await saveCsv("data/reports/pagespeed-report.csv", reports.pageSpeedReport);
  await saveJson("data/reports/schema-inventory.json", reports.schemaInventory);
  await saveCsv("data/reports/schema-inventory.csv", reports.schemaInventory);
  await saveJson("data/reports/schema-summary.json", reports.schemaSummary);
  await saveCsv("data/reports/schema-summary.csv", reports.schemaSummary);
  await saveIssuesJson(reports.issues);
  await saveIssuesCsv(reports.issues);
  await saveJson("data/reports/action-plan.json", reports.actionPlan);
  await saveCsv("data/reports/action-plan.csv", reports.actionPlan.map((item) => ({ ...item, sampleUrls: item.sampleUrls.join("|") })));
  await saveSiteProfileJson(reports.profile);
  await saveSiteProfileCsv(reports.profile);

  return excelOptions.enabled
    ? exportExcel(
        result.pages,
        reports.issues,
        reports.actionPlan,
        reports.profile,
        reports.schemaInventory,
        reports.schemaSummary,
        reports.indexabilityReport,
        reports.pageSpeedReport,
        reports.richResultEligibilityReport,
        reports.redirectReport,
        reports.contentCannibalizationReport
      )
    : "";
}

function flattenPage(page: CrawledPage): Record<string, unknown> {
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
    xRobotsTag: page.http?.xRobotsTag ?? "",
    indexable: indexability.indexable,
    indexabilityStatus: indexability.status,
    canonicalTarget: indexability.canonicalTarget,
    canonicalSelfReferencing: indexability.canonicalSelfReferencing,
    h1: page.headings.h1.join("|"),
    h1Count: page.headings.h1.length,
    wordCount: page.wordCount,
    responseSizeBytes: page.http?.responseSizeBytes ?? 0,
    lastModified: page.http?.lastModified ?? "",
    etag: page.http?.etag ?? "",
    cacheControl: page.http?.cacheControl ?? "",
    server: page.http?.server ?? "",
    cfCacheStatus: page.http?.cfCacheStatus ?? "",
    cdnCacheStatus: page.http?.cdnCacheStatus ?? "",
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
