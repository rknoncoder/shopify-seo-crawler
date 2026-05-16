import type { CrawlTelemetry } from "../types/crawl.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

interface LoadTimeSummary {
  avg: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

interface StatusCodeCounts {
  families: {
    "2xx": number;
    "3xx": number;
    "4xx": number;
    "5xx": number;
    other: number;
  };
  exact: Record<string, number>;
}

export interface CrawlStatsReport {
  generatedAt: string;
  totalRequested: number;
  totalCrawled: number;
  statusCodeCounts: StatusCodeCounts;
  fetchFailedCount: number;
  skippedNonHtmlCount: number;
  redirectedCount: number;
  retryCounters: CrawlTelemetry["retries"];
  loadTimeMs: LoadTimeSummary;
}

export interface CrawlStatsCsvRow {
  generatedAt: string;
  totalRequested: number;
  totalCrawled: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  statusOther: number;
  exactStatusCounts: string;
  fetchFailedCount: number;
  skippedNonHtmlCount: number;
  redirectedCount: number;
  totalRetries: number;
  statusRetries: number;
  errorRetries: number;
  retryStatusCounts: string;
  avgLoadTimeMs: number | null;
  p50LoadTimeMs: number | null;
  p95LoadTimeMs: number | null;
  maxLoadTimeMs: number | null;
}

export function buildCrawlStatsReport(
  pages: CrawledPage[],
  issues: SeoIssue[],
  telemetry: CrawlTelemetry
): CrawlStatsReport {
  return {
    generatedAt: new Date().toISOString(),
    totalRequested: telemetry.totalRequested,
    totalCrawled: pages.length,
    statusCodeCounts: countStatusCodes(pages),
    fetchFailedCount: issues.filter((issue) => issue.code === "fetch_failed").length,
    skippedNonHtmlCount: telemetry.skippedNonHtmlCount,
    redirectedCount: pages.filter((page) => page.redirected).length,
    retryCounters: telemetry.retries,
    loadTimeMs: summarizeLoadTimes(pages)
  };
}

export function buildCrawlStatsCsvRows(report: CrawlStatsReport): CrawlStatsCsvRow[] {
  return [{
    generatedAt: report.generatedAt,
    totalRequested: report.totalRequested,
    totalCrawled: report.totalCrawled,
    status2xx: report.statusCodeCounts.families["2xx"],
    status3xx: report.statusCodeCounts.families["3xx"],
    status4xx: report.statusCodeCounts.families["4xx"],
    status5xx: report.statusCodeCounts.families["5xx"],
    statusOther: report.statusCodeCounts.families.other,
    exactStatusCounts: JSON.stringify(report.statusCodeCounts.exact),
    fetchFailedCount: report.fetchFailedCount,
    skippedNonHtmlCount: report.skippedNonHtmlCount,
    redirectedCount: report.redirectedCount,
    totalRetries: report.retryCounters.totalRetries,
    statusRetries: report.retryCounters.statusRetries,
    errorRetries: report.retryCounters.errorRetries,
    retryStatusCounts: JSON.stringify(report.retryCounters.retryStatusCounts),
    avgLoadTimeMs: report.loadTimeMs.avg,
    p50LoadTimeMs: report.loadTimeMs.p50,
    p95LoadTimeMs: report.loadTimeMs.p95,
    maxLoadTimeMs: report.loadTimeMs.max
  }];
}

function countStatusCodes(pages: CrawledPage[]): StatusCodeCounts {
  const families: StatusCodeCounts["families"] = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
    other: 0
  };
  const exact: Record<string, number> = {};

  for (const page of pages) {
    const status = page.status;
    exact[status] = (exact[status] || 0) + 1;

    if (status >= 200 && status < 300) {
      families["2xx"] += 1;
    } else if (status >= 300 && status < 400) {
      families["3xx"] += 1;
    } else if (status >= 400 && status < 500) {
      families["4xx"] += 1;
    } else if (status >= 500 && status < 600) {
      families["5xx"] += 1;
    } else {
      families.other += 1;
    }
  }

  return { families, exact };
}

function summarizeLoadTimes(pages: CrawledPage[]): LoadTimeSummary {
  const values = pages
    .map((page) => page.loadTimeMs)
    .filter((loadTime) => Number.isFinite(loadTime))
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return { avg: null, p50: null, p95: null, max: null };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    avg: Math.round(total / values.length),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values[values.length - 1]
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  );
  return sortedValues[index];
}
