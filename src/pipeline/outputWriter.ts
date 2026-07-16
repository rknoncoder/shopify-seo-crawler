import { rm } from "node:fs/promises";
import { buildCrawlStatsCsvRows } from "../reports/crawlStatsReport.js";
import { buildImageSeoSummaryCsvRows } from "../reports/imageSeoSummaryReport.js";
import type { UnreachableProductReportRow } from "../reports/unreachableProductsReport.js";
import { exportExcel } from "../storage/exportExcel.js";
import { saveCsv } from "../storage/saveCsv.js";
import { saveIssuesCsv } from "../storage/saveIssuesCsv.js";
import { saveIssuesJson } from "../storage/saveIssuesJson.js";
import { saveJson } from "../storage/saveJson.js";
import { saveSiteProfileCsv } from "../storage/saveSiteProfileCsv.js";
import { saveSiteProfileJson } from "../storage/saveSiteProfileJson.js";
import type { CrawlResult } from "../types/crawl.js";
import type { CrawledPage } from "../types/page.js";
import { isMissingRequiredAlt } from "../utils/imageSeo.js";
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
  await saveJson("data/reports/pagespeed-report.json", reports.pageSpeedReport);
  await saveCsv("data/reports/pagespeed-report.csv", reports.pageSpeedReport);
  await saveJson("data/reports/image-inventory.json", reports.imageInventoryReport);
  await saveCsv("data/reports/image-inventory.csv", reports.imageInventoryReport);
  await saveJson("data/reports/image-seo-summary.json", reports.imageSeoSummaryReport);
  await saveCsv("data/reports/image-seo-summary.csv", buildImageSeoSummaryCsvRows(reports.imageSeoSummaryReport));
  await saveJson("data/reports/link-graph.json", reports.linkGraphReport);
  await saveCsv("data/reports/link-graph.csv", reports.linkGraphCsvRows);
  await saveJson("data/reports/link-graph-summary.json", reports.linkGraphSummaryReport);
  await saveCsv("data/reports/unreachable-products-report.csv", reports.unreachableProductsReport, unreachableProductsHeaders);
  await deleteDisabledSchemaReports();
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
        reports.indexabilityReport,
        reports.pageSpeedReport,
        reports.redirectReport,
        reports.contentCannibalizationReport,
        reports.imageInventoryReport,
        reports.imageSeoSummaryReport,
        reports.crawlStatsReport,
        result.collectionProbeSummaries
      )
    : "";
}

const unreachableProductsHeaders: Array<keyof UnreachableProductReportRow> = [
  "url",
  "handle",
  "discovery_source",
  "inbound_count",
  "pagerank_score",
  "collection_memberships",
  "collection_is_crawled",
  "bucket",
  "collections_count"
];

export function flattenPage(page: CrawledPage): Record<string, unknown> {
  const indexability = summarizeIndexability(page);

  return {
    url: page.finalUrl,
    requestedUrl: page.url,
    discoverySource: page.discoverySource ?? "",
    redirected: page.redirected,
    redirectCount: page.redirectCount,
    status: page.status,
    pageType: page.pageType,
    title: page.meta.title,
    description: page.meta.description,
    canonical: page.meta.canonical,
    robots: page.meta.robots,
    htmlLang: page.meta.htmlLang,
    charset: page.meta.charset,
    charsetWithinFirst1024: page.meta.charsetWithinFirst1024,
    viewport: page.meta.viewport,
    xRobotsTag: page.http?.xRobotsTag ?? "",
    ogType: page.meta.ogType,
    ogUrl: page.meta.ogUrl,
    ogImage: page.meta.ogImage,
    ogPriceAmount: page.meta.ogPriceAmount,
    ogPriceCurrency: page.meta.ogPriceCurrency,
    ogAvailability: page.meta.ogAvailability,
    twitterCard: page.meta.twitterCard,
    twitterImage: page.meta.twitterImage,
    alternateCount: page.meta.alternates.length,
    hreflangValues: page.meta.hreflangLanguages.join("|"),
    alternateHrefs: page.meta.alternates.map((alternate) => alternate.href).filter(Boolean).join("|"),
    metadataHasNoIndex: page.metadataValidation.hasNoIndex,
    metadataCanonicalValid: page.metadataValidation.isCanonicalValid,
    metadataHasOpenGraphProductData: page.metadataValidation.hasOpenGraphProductData,
    metadataOgPriceMismatch: page.metadataValidation.ogPriceMismatch,
    metadataHasViewportIssue: page.metadataValidation.hasViewportIssue,
    metadataHreflangCount: page.metadataValidation.hreflangCount,
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
    missingAltImages: page.images.filter(isMissingRequiredAlt).length,
    links: page.links.length,
    isShopify: page.shopify.isShopify,
    detectedApps: page.shopify.detectedApps.join("|"),
    issues: page.issues.join("|")
  };
}

async function deleteDisabledSchemaReports(): Promise<void> {
  await Promise.all([
    "data/reports/schema-inventory.json",
    "data/reports/schema-inventory.csv",
    "data/reports/schema-summary.json",
    "data/reports/schema-summary.csv",
    "data/reports/rich-result-eligibility.json",
    "data/reports/rich-result-eligibility.csv"
  ].map((path) => rm(path, { force: true })));
}
