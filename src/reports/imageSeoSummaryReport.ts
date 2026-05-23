import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import type { ImageInventoryRow } from "./imageInventoryReport.js";

export interface ImageSeoSummaryReport {
  generatedAt: string;
  totalPages: number;
  pagesWithImages: number;
  totalImagesStored: number;
  totalImageUsages: number;
  uniqueImageRows: number;
  missingAltImages: number;
  pagesWithMissingAlt: number;
  duplicateAltIssuePages: number;
  missingDimensionImages: number;
  pagesWithMissingDimensions: number;
  lazyLoadingIssuePages: number;
  primaryImageLazyPages: number;
  largeImageUrlCount: number;
  pagesWithLargeImageUrls: number;
  imageIssueCounts: Record<string, number>;
  topMissingAltPages: ImageSeoPageSample[];
  note: string;
}

export interface ImageSeoSummaryCsvRow {
  generatedAt: string;
  totalPages: number;
  pagesWithImages: number;
  totalImagesStored: number;
  totalImageUsages: number;
  uniqueImageRows: number;
  missingAltImages: number;
  pagesWithMissingAlt: number;
  duplicateAltIssuePages: number;
  missingDimensionImages: number;
  pagesWithMissingDimensions: number;
  lazyLoadingIssuePages: number;
  primaryImageLazyPages: number;
  largeImageUrlCount: number;
  pagesWithLargeImageUrls: number;
  topMissingAltPages: string;
  note: string;
}

export interface ImageSeoPageSample {
  url: string;
  pageType: string;
  missingAltImages: number;
  sampleImages: string[];
}

const missingAltCode = "missing_image_alt";

export function buildImageSeoSummaryReport(
  pages: CrawledPage[],
  issues: SeoIssue[],
  imageInventoryReport: ImageInventoryRow[] = []
): ImageSeoSummaryReport {
  const missingAltByUrl = new Map<string, { count: number; samples: string[] }>();
  for (const issue of issues.filter((item) => item.code === missingAltCode)) {
    missingAltByUrl.set(issue.url, {
      count: extractCount(issue.message),
      samples: splitEvidence(issue.evidence)
    });
  }

  const missingDimensionByUrl = new Map(
    issues
      .filter((issue) => issue.code === "image_missing_dimensions")
      .map((issue) => [issue.url, extractCount(issue.message)])
  );
  const imageIssueCounts = countImageIssues(issues);

  return {
    generatedAt: new Date().toISOString(),
    totalPages: pages.length,
    pagesWithImages: pages.filter((page) => page.images.length > 0).length,
    totalImagesStored: pages.reduce((sum, page) => sum + page.images.length, 0),
    totalImageUsages: imageInventoryReport.length > 0
      ? imageInventoryReport.reduce((sum, row) => sum + row.usedCount, 0)
      : pages.reduce((sum, page) => sum + page.images.length, 0),
    uniqueImageRows: imageInventoryReport.length,
    missingAltImages: [...missingAltByUrl.values()].reduce((sum, item) => sum + item.count, 0),
    pagesWithMissingAlt: missingAltByUrl.size,
    duplicateAltIssuePages: countIssuePages(issues, "image_alt_duplicate_on_page"),
    missingDimensionImages: [...missingDimensionByUrl.values()].reduce((sum, count) => sum + count, 0),
    pagesWithMissingDimensions: missingDimensionByUrl.size,
    lazyLoadingIssuePages: countIssuePages(issues, "lazy_loading_missing"),
    primaryImageLazyPages: countIssuePages(issues, "primary_image_lazy_loaded"),
    largeImageUrlCount: pages.reduce((sum, page) => sum + page.speed.largeImageUrlCount, 0),
    pagesWithLargeImageUrls: pages.filter((page) => page.speed.largeImageUrlCount > 0).length,
    imageIssueCounts,
    topMissingAltPages: buildTopMissingAltPages(pages, missingAltByUrl),
    note: "Image totals use audit issue counts for missing alt and stored page-image arrays for aggregate image inventory. In memory-safe mode, stored image arrays may be capped, but missing-alt issue counts are calculated before storage compaction."
  };
}

export function buildImageSeoSummaryCsvRows(report: ImageSeoSummaryReport): ImageSeoSummaryCsvRow[] {
  return [{
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
    topMissingAltPages: report.topMissingAltPages
      .map((page) => `${page.url} (${page.missingAltImages})`)
      .join("|"),
    note: report.note
  }];
}

function buildTopMissingAltPages(
  pages: CrawledPage[],
  missingAltByUrl: Map<string, { count: number; samples: string[] }>
): ImageSeoPageSample[] {
  const pageTypeByUrl = new Map(pages.map((page) => [page.finalUrl, page.pageType]));
  return [...missingAltByUrl.entries()]
    .map(([url, item]) => ({
      url,
      pageType: pageTypeByUrl.get(url) || "unknown",
      missingAltImages: item.count,
      sampleImages: item.samples
    }))
    .sort((a, b) => b.missingAltImages - a.missingAltImages || a.url.localeCompare(b.url))
    .slice(0, 25);
}

function countImageIssues(issues: SeoIssue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues.filter((item) => item.category === "images" || item.category === "page_speed")) {
    if (!isImageSeoIssue(issue)) continue;
    counts[issue.code] = (counts[issue.code] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function isImageSeoIssue(issue: SeoIssue): boolean {
  return issue.category === "images" ||
    [
      "image_count_high",
      "large_image_url_width",
      "primary_image_lazy_loaded",
      "lazy_loading_missing"
    ].includes(issue.code);
}

function countIssuePages(issues: SeoIssue[], code: string): number {
  return new Set(issues.filter((issue) => issue.code === code).map((issue) => issue.url)).size;
}

function extractCount(message: string): number {
  const match = message.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function splitEvidence(value = ""): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}
