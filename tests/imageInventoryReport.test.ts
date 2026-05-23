import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImageInventoryReport } from "../src/reports/imageInventoryReport.js";
import type { ImageInventoryUsage } from "../src/types/image.js";

describe("image inventory report", () => {
  it("groups image URLs and alt text with Screaming-Frog-style used counts", () => {
    const report = buildImageInventoryReport([
      usage("https://example.com/a.jpg", "", "https://example.com/page-1"),
      usage("https://example.com/a.jpg", "", "https://example.com/page-1"),
      usage("https://example.com/a.jpg", "Hero shirt", "https://example.com/page-2"),
      usage("https://example.com/b.jpg", "Product back view", "https://example.com/page-2", true)
    ]);

    assert.equal(report[0]?.imageUrl, "https://example.com/a.jpg");
    assert.equal(report[0]?.alt, "");
    assert.equal(report[0]?.missingAlt, true);
    assert.equal(report[0]?.usedCount, 2);
    assert.equal(report[0]?.pagesUsed, 1);

    const withAlt = report.find((row) => row.imageUrl === "https://example.com/a.jpg" && row.alt === "Hero shirt");
    assert.equal(withAlt?.usedCount, 1);
    assert.equal(withAlt?.samplePages, "https://example.com/page-2");
  });
});

function usage(imageUrl: string, alt: string, pageUrl: string, lazy = false): ImageInventoryUsage {
  return {
    imageUrl,
    rawSrc: imageUrl,
    alt,
    pageUrl,
    pageType: "product",
    width: "100",
    height: "100",
    lazy,
    fetchPriority: ""
  };
}
