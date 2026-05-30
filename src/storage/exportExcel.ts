import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import * as XLSX from "xlsx";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import type { ActionPlanItem, SiteProfile } from "../types/report.js";
import type { ContentCannibalizationReportRow } from "../reports/contentCannibalizationReport.js";
import type { ImageInventoryRow } from "../reports/imageInventoryReport.js";
import type { ImageSeoSummaryReport } from "../reports/imageSeoSummaryReport.js";
import type { IndexabilityReportRow } from "../reports/indexabilityReport.js";
import type { PageSpeedInsightsRow } from "../reports/pageSpeedInsightsReport.js";
import type { RedirectReportRow } from "../reports/redirectReport.js";
import { isMissingRequiredAlt } from "../utils/imageSeo.js";

export async function exportExcel(
  pages: CrawledPage[],
  issues: SeoIssue[],
  actionPlan: ActionPlanItem[],
  profile: SiteProfile,
  indexabilityReport: IndexabilityReportRow[] = [],
  pageSpeedReport: PageSpeedInsightsRow[] = [],
  redirectReport: RedirectReportRow[] = [],
  contentCannibalizationReport: ContentCannibalizationReportRow[] = [],
  imageInventoryReport: ImageInventoryRow[] = [],
  imageSeoSummaryReport?: ImageSeoSummaryReport,
  path = "data/reports/shopify-seo-report.xlsx"
): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([profile]), "Site Profile");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(flattenPages(pages)), "Pages");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(issues), "Issues");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(actionPlan), "Action Plan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(contentCannibalizationReport), "Cannibalization");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(indexabilityReport), "Indexability");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(redirectReport), "Redirects");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pageSpeedReport), "PageSpeed");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(imageInventoryReport), "Images");
  if (imageSeoSummaryReport) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([flattenImageSeoSummary(imageSeoSummaryReport)]), "Image SEO Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(imageSeoSummaryReport.topMissingAltPages), "Missing Alt Samples");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(imageSeoSummaryReport.alt_text_pattern_analysis), "Alt Pattern Analysis");
  }
  XLSX.writeFile(workbook, path);
  return path;
}

function flattenPages(pages: CrawledPage[]): Array<Record<string, unknown>> {
  return pages.map((page) => ({
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
    thirdPartyScriptCount: page.speed.thirdPartyScriptCount,
    shopifyAppScriptCount: page.speed.shopifyAppScriptCount,
    stylesheetCount: page.speed.stylesheetCount,
    renderBlockingStylesheetCount: page.speed.renderBlockingStylesheetCount,
    imageCount: page.images.length,
    missingAltImages: page.images.filter(isMissingRequiredAlt).length,
    largeImageUrlCount: page.speed.largeImageUrlCount,
    primaryImageFetchPriority: page.speed.primaryImageFetchPriority,
    primaryImageLazy: page.speed.primaryImageLazy,
    linkCount: page.links.length,
    isShopify: page.shopify.isShopify,
    detectedApps: page.shopify.detectedApps.join("|"),
    issueCodes: page.issues.join("|")
  }));
}

function flattenImageSeoSummary(report: ImageSeoSummaryReport): Record<string, unknown> {
  return {
    generatedAt: report.generatedAt,
    totalPages: report.totalPages,
    pagesWithImages: report.pagesWithImages,
    totalImagesStored: report.totalImagesStored,
    totalImageUsages: report.totalImageUsages,
    uniqueImageRows: report.uniqueImageRows,
    missingAltImages: report.missingAltImages,
    pagesWithMissingAlt: report.pagesWithMissingAlt,
    duplicateAltIssuePages: report.duplicateAltIssuePages,
    missingDimensionImages: report.missingDimensionImages,
    pagesWithMissingDimensions: report.pagesWithMissingDimensions,
    lazyLoadingIssuePages: report.lazyLoadingIssuePages,
    primaryImageLazyPages: report.primaryImageLazyPages,
    largeImageUrlCount: report.largeImageUrlCount,
    pagesWithLargeImageUrls: report.pagesWithLargeImageUrls,
    imageIssueCounts: Object.entries(report.imageIssueCounts).map(([code, count]) => `${code}:${count}`).join("|"),
    altTextPatternAnalysis: report.alt_text_pattern_analysis
      .map((group) => `${group.pattern}:${group.missing_alt_count}`)
      .join("|"),
    note: report.note
  };
}
