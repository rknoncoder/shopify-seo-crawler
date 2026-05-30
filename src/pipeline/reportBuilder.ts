import { detectSitemapIndexabilityIssues } from "../analyzer/sitemapIndexabilityAnalyzer.js";
import { detectOrphanedCollectionIssues } from "../analyzer/orphanedCollectionAnalyzer.js";
import { buildSiteProfile } from "../classifier/siteClassifier.js";
import { buildActionPlan, countIssuesByCode } from "../reports/actionPlan.js";
import { buildContentCannibalizationReport } from "../reports/contentCannibalizationReport.js";
import { buildCrawlStatsReport } from "../reports/crawlStatsReport.js";
import { buildImageInventoryReport } from "../reports/imageInventoryReport.js";
import { buildImageSeoSummaryReport } from "../reports/imageSeoSummaryReport.js";
import { buildIndexabilityReport } from "../reports/indexabilityReport.js";
import { buildLinkGraphCsvRows, buildLinkGraphReport, buildLinkGraphSummaryReport } from "../reports/linkGraphReport.js";
import { buildPageSpeedInsightsReport, type PageSpeedInsightsOptions } from "../reports/pageSpeedInsightsReport.js";
import { buildRedirectReport } from "../reports/redirectReport.js";
import { buildUnreachableProductsReport } from "../reports/unreachableProductsReport.js";
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
  contentCannibalizationReport: ReturnType<typeof buildContentCannibalizationReport>;
  indexabilityReport: ReturnType<typeof buildIndexabilityReport>;
  redirectReport: ReturnType<typeof buildRedirectReport>;
  pageSpeedReport: Awaited<ReturnType<typeof buildPageSpeedInsightsReport>>;
  crawlStatsReport: ReturnType<typeof buildCrawlStatsReport>;
  imageInventoryReport: ReturnType<typeof buildImageInventoryReport>;
  imageSeoSummaryReport: ReturnType<typeof buildImageSeoSummaryReport>;
  linkGraphReport: ReturnType<typeof buildLinkGraphReport>;
  linkGraphCsvRows: ReturnType<typeof buildLinkGraphCsvRows>;
  linkGraphSummaryReport: ReturnType<typeof buildLinkGraphSummaryReport>;
  unreachableProductsReport: Awaited<ReturnType<typeof buildUnreachableProductsReport>>;
}

export async function buildReportBundle(options: BuildReportBundleOptions): Promise<ReportBundle> {
  const { targetUrl, result, finalUrls, pageSpeedOptions } = options;
  const sitemapIndexabilityIssues = detectSitemapIndexabilityIssues(result.pages, finalUrls);
  const linkGraphReport = buildLinkGraphReport(result.linkGraph, result.pages);
  const linkGraphCsvRows = buildLinkGraphCsvRows(linkGraphReport);
  const linkGraphSummaryReport = buildLinkGraphSummaryReport(result.linkGraph, result.pages);
  const orphanedCollectionIssues = detectOrphanedCollectionIssues(result.pages, linkGraphSummaryReport);
  const issues = [...result.issues, ...sitemapIndexabilityIssues, ...orphanedCollectionIssues];
  const actionPlan = buildActionPlan(issues);
  const profile = buildSiteProfile(targetUrl, result.pages, countIssuesByCode(issues));
  const contentCannibalizationReport = buildContentCannibalizationReport(result.pages);
  const indexabilityReport = buildIndexabilityReport(result.pages, finalUrls);
  const redirectReport = buildRedirectReport(result.pages);
  const imageInventoryReport = buildImageInventoryReport(result.imageInventoryUsages);
  const imageSeoSummaryReport = buildImageSeoSummaryReport(
    result.pages,
    issues,
    imageInventoryReport,
    result.imageInventoryUsages
  );
  const crawlStatsReport = buildCrawlStatsReport(result.pages, issues, result.telemetry, linkGraphSummaryReport);
  const unreachableProductsReport = await buildUnreachableProductsReport(result.pages, issues, linkGraphSummaryReport, {
    baseUrl: targetUrl
  });
  const pageSpeedUrls = result.pages.filter((page) => page.status === 200).map((page) => page.finalUrl);
  const pageSpeedReport = await buildPageSpeedInsightsReport(pageSpeedUrls, pageSpeedOptions);

  return {
    issues,
    actionPlan,
    profile,
    contentCannibalizationReport,
    indexabilityReport,
    redirectReport,
    pageSpeedReport,
    crawlStatsReport,
    imageInventoryReport,
    imageSeoSummaryReport,
    linkGraphReport,
    linkGraphCsvRows,
    linkGraphSummaryReport,
    unreachableProductsReport
  };
}
