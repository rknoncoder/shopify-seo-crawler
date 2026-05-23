import { detectSitemapIndexabilityIssues } from "../analyzer/sitemapIndexabilityAnalyzer.js";
import { buildSiteProfile } from "../classifier/siteClassifier.js";
import { buildActionPlan, countIssuesByCode } from "../reports/actionPlan.js";
import { buildContentCannibalizationReport } from "../reports/contentCannibalizationReport.js";
import { buildCrawlStatsReport } from "../reports/crawlStatsReport.js";
import { buildImageInventoryReport } from "../reports/imageInventoryReport.js";
import { buildImageSeoSummaryReport } from "../reports/imageSeoSummaryReport.js";
import { buildIndexabilityReport } from "../reports/indexabilityReport.js";
import { buildPageSpeedInsightsReport, type PageSpeedInsightsOptions } from "../reports/pageSpeedInsightsReport.js";
import { buildRedirectReport } from "../reports/redirectReport.js";
import { buildRichResultEligibilityReport } from "../reports/richResultEligibilityReport.js";
import { buildSchemaInventory, buildSchemaSummary } from "../reports/schemaInventory.js";
import type { CrawlResult } from "../types/crawl.js";

export interface BuildReportBundleOptions {
  targetUrl: string;
  result: CrawlResult;
  finalUrls: string[];
  pageSpeedOptions: PageSpeedInsightsOptions;
}

export interface ReportBundle {
  issues: ReturnType<typeof detectSitemapIndexabilityIssues>;
  actionPlan: ReturnType<typeof buildActionPlan>;
  profile: ReturnType<typeof buildSiteProfile>;
  schemaInventory: ReturnType<typeof buildSchemaInventory>;
  schemaSummary: ReturnType<typeof buildSchemaSummary>;
  contentCannibalizationReport: ReturnType<typeof buildContentCannibalizationReport>;
  indexabilityReport: ReturnType<typeof buildIndexabilityReport>;
  redirectReport: ReturnType<typeof buildRedirectReport>;
  richResultEligibilityReport: ReturnType<typeof buildRichResultEligibilityReport>;
  pageSpeedReport: Awaited<ReturnType<typeof buildPageSpeedInsightsReport>>;
  crawlStatsReport: ReturnType<typeof buildCrawlStatsReport>;
  imageInventoryReport: ReturnType<typeof buildImageInventoryReport>;
  imageSeoSummaryReport: ReturnType<typeof buildImageSeoSummaryReport>;
}

export async function buildReportBundle(options: BuildReportBundleOptions): Promise<ReportBundle> {
  const { targetUrl, result, finalUrls, pageSpeedOptions } = options;
  const sitemapIndexabilityIssues = detectSitemapIndexabilityIssues(result.pages, finalUrls);
  const issues = [...result.issues, ...sitemapIndexabilityIssues];
  const crawlStatsReport = buildCrawlStatsReport(result.pages, result.issues, result.telemetry);
  const actionPlan = buildActionPlan(issues);
  const profile = buildSiteProfile(targetUrl, result.pages, countIssuesByCode(issues));
  const schemaInventory = buildSchemaInventory(result.pages);
  const schemaSummary = buildSchemaSummary(result.pages);
  const contentCannibalizationReport = buildContentCannibalizationReport(result.pages);
  const indexabilityReport = buildIndexabilityReport(result.pages, finalUrls);
  const redirectReport = buildRedirectReport(result.pages);
  const richResultEligibilityReport = buildRichResultEligibilityReport(result.pages, issues);
  const imageInventoryReport = buildImageInventoryReport(result.imageInventoryUsages);
  const imageSeoSummaryReport = buildImageSeoSummaryReport(result.pages, issues, imageInventoryReport);
  const pageSpeedUrls = result.pages.filter((page) => page.status === 200).map((page) => page.finalUrl);
  const pageSpeedReport = await buildPageSpeedInsightsReport(pageSpeedUrls, pageSpeedOptions);

  return {
    issues,
    actionPlan,
    profile,
    schemaInventory,
    schemaSummary,
    contentCannibalizationReport,
    indexabilityReport,
    redirectReport,
    richResultEligibilityReport,
    pageSpeedReport,
    crawlStatsReport,
    imageInventoryReport,
    imageSeoSummaryReport
  };
}
