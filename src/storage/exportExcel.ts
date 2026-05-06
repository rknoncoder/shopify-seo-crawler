import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import * as XLSX from "xlsx";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import type { ActionPlanItem, SiteProfile } from "../types/report.js";
import type { SchemaInventoryRow, SchemaSummaryRow } from "../reports/schemaInventory.js";

export async function exportExcel(
  pages: CrawledPage[],
  issues: SeoIssue[],
  actionPlan: ActionPlanItem[],
  profile: SiteProfile,
  schemaInventory: SchemaInventoryRow[] = [],
  schemaSummary: SchemaSummaryRow[] = [],
  path = "data/reports/shopify-seo-report.xlsx"
): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([profile]), "Site Profile");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(flattenPages(pages)), "Pages");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(issues), "Issues");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(actionPlan), "Action Plan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(schemaInventory), "Schema Inventory");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(schemaSummary), "Schema Summary");
  XLSX.writeFile(workbook, path);
  return path;
}

function flattenPages(pages: CrawledPage[]): Array<Record<string, unknown>> {
  return pages.map((page) => ({
    url: page.finalUrl,
    status: page.status,
    pageType: page.pageType,
    title: page.meta.title,
    description: page.meta.description,
    canonical: page.meta.canonical,
    h1Count: page.headings.h1.length,
    wordCount: page.wordCount,
    imageCount: page.images.length,
    linkCount: page.links.length,
    schemaTypes: page.schemas.map((schema) => schema.type).join("|"),
    isShopify: page.shopify.isShopify,
    detectedApps: page.shopify.detectedApps.join("|"),
    issueCodes: page.issues.join("|")
  }));
}
