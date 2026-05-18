import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import * as XLSX from "xlsx";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import type { ActionPlanItem, SiteProfile } from "../types/report.js";
import type { ContentCannibalizationReportRow } from "../reports/contentCannibalizationReport.js";
import type { IndexabilityReportRow } from "../reports/indexabilityReport.js";
import type { PageSpeedInsightsRow } from "../reports/pageSpeedInsightsReport.js";
import type { RedirectReportRow } from "../reports/redirectReport.js";
import type { RichResultEligibilityRow } from "../reports/richResultEligibilityReport.js";
import type { SchemaInventoryRow, SchemaSummaryRow } from "../reports/schemaInventory.js";

export async function exportExcel(
  pages: CrawledPage[],
  issues: SeoIssue[],
  actionPlan: ActionPlanItem[],
  profile: SiteProfile,
  schemaInventory: SchemaInventoryRow[] = [],
  schemaSummary: SchemaSummaryRow[] = [],
  indexabilityReport: IndexabilityReportRow[] = [],
  pageSpeedReport: PageSpeedInsightsRow[] = [],
  richResultEligibilityReport: RichResultEligibilityRow[] = [],
  redirectReport: RedirectReportRow[] = [],
  contentCannibalizationReport: ContentCannibalizationReportRow[] = [],
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
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(richResultEligibilityReport), "Rich Results");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(schemaInventory), "Schema Inventory");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(schemaSummary), "Schema Summary");
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
    xRobotsTag: page.http?.xRobotsTag ?? "",
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
    largeImageUrlCount: page.speed.largeImageUrlCount,
    primaryImageFetchPriority: page.speed.primaryImageFetchPriority,
    primaryImageLazy: page.speed.primaryImageLazy,
    linkCount: page.links.length,
    schemaTypes: page.schemas.map((schema) => schema.type).join("|"),
    isShopify: page.shopify.isShopify,
    detectedApps: page.shopify.detectedApps.join("|"),
    issueCodes: page.issues.join("|")
  }));
}
