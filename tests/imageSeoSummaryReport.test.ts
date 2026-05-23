import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImageSeoSummaryCsvRows, buildImageSeoSummaryReport } from "../src/reports/imageSeoSummaryReport.js";
import type { SeoIssue } from "../src/types/issue.js";
import type { CrawledPage } from "../src/types/page.js";

describe("image SEO summary report", () => {
  it("summarizes site-wide image SEO counts from pages and issues", () => {
    const pages = [
      page("https://example.com/a", "product", 3, 2),
      page("https://example.com/b", "collection", 2, 0)
    ];
    const issues: SeoIssue[] = [
      issue("https://example.com/a", "images", "missing_image_alt", "2 images are missing alt text", "https://example.com/a-1.jpg | https://example.com/a-2.jpg"),
      issue("https://example.com/a", "images", "image_missing_dimensions", "3 images are missing width or height attributes", ""),
      issue("https://example.com/b", "images", "image_alt_duplicate_on_page", "1 duplicate image alt text value(s) found on the page.", ""),
      issue("https://example.com/b", "page_speed", "primary_image_lazy_loaded", "Primary image appears to be lazy-loaded.", "")
    ];

    const report = buildImageSeoSummaryReport(pages, issues);
    const csvRows = buildImageSeoSummaryCsvRows(report);

    assert.equal(report.totalPages, 2);
    assert.equal(report.totalImagesStored, 5);
    assert.equal(report.missingAltImages, 2);
    assert.equal(report.pagesWithMissingAlt, 1);
    assert.equal(report.missingDimensionImages, 3);
    assert.equal(report.duplicateAltIssuePages, 1);
    assert.equal(report.primaryImageLazyPages, 1);
    assert.deepEqual(report.topMissingAltPages[0]?.sampleImages, [
      "https://example.com/a-1.jpg",
      "https://example.com/a-2.jpg"
    ]);
    assert.equal(csvRows[0]?.missingAltImages, 2);
  });
});

function page(url: string, pageType: string, imageCount: number, largeImageUrlCount: number): CrawledPage {
  return {
    finalUrl: url,
    pageType,
    images: Array.from({ length: imageCount }, (_, index) => ({
      src: `${url}-${index}.jpg`,
      rawSrc: "",
      alt: "sample",
      lazy: true
    })),
    speed: {
      largeImageUrlCount
    }
  } as CrawledPage;
}

function issue(url: string, category: SeoIssue["category"], code: string, message: string, evidence: string): SeoIssue {
  return {
    url,
    pageType: "product",
    severity: "low",
    category,
    code,
    message,
    recommendation: "",
    evidence
  };
}
