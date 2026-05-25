import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as cheerio from "cheerio";
import { analyzeMetadata, validateMetadataCanonical } from "../src/analyzer/metadata.js";
import { auditMetadataValidation } from "../src/audits/metadataAudit.js";
import { extractMeta } from "../src/parser/metaExtractor.js";
import type { CrawledPage } from "../src/types/page.js";

describe("metadata analyzer", () => {
  it("builds a compact validation summary from advanced SEO metadata", () => {
    const finalUrl = "https://example.com/products/vest";
    const html = `
      <html lang="en-IN">
        <head>
          <meta charset="utf-8">
          <meta name="robots" content="index, follow, max-image-preview:large">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="canonical" href="${finalUrl}">
          <link rel="alternate" hreflang="en-IN" href="${finalUrl}">
          <meta property="og:title" content="Men Printed Vest">
          <meta property="og:description" content="Shop printed vest online">
          <meta property="og:type" content="product">
          <meta property="og:image" content="https://cdn.shopify.com/s/files/1/0000/vest.jpg">
          <meta property="og:price:amount" content="299.00">
          <meta property="og:price:currency" content="INR">
          <meta property="og:availability" content="in stock">
        </head>
        <body>Now INR 299</body>
      </html>
    `;
    const $ = cheerio.load(html);
    const meta = extractMeta($, html);

    const summary = analyzeMetadata({
      finalUrl,
      pageType: "product",
      meta,
      textSample: "Now INR 299"
    });

    assert.deepEqual(summary, {
      hasNoIndex: false,
      isCanonicalValid: true,
      hasOpenGraphProductData: true,
      ogPriceMismatch: false,
      hasViewportIssue: false,
      hreflangCount: 1
    });
  });

  it("flags price mismatches using compact OG and visible text values", () => {
    const finalUrl = "https://example.com/products/vest";
    const html = `
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="canonical" href="${finalUrl}">
          <meta property="og:image" content="https://cdn.shopify.com/s/files/1/0000/vest.jpg">
          <meta property="og:price:amount" content="599.00">
          <meta property="og:price:currency" content="INR">
        </head>
        <body>Now INR 299</body>
      </html>
    `;
    const $ = cheerio.load(html);
    const meta = extractMeta($, html);
    const metadataValidation = analyzeMetadata({
      finalUrl,
      pageType: "product",
      meta,
      textSample: "Now INR 299"
    });

    const issues = auditMetadataValidation({
      finalUrl,
      status: 200,
      pageType: "product",
      meta,
      textSample: "Now INR 299",
      metadataValidation
    } as CrawledPage);

    assert.equal(metadataValidation.ogPriceMismatch, true);
    assert.equal(issues.some((issue) => issue.code === "metadata_price_mismatch"), true);
  });

  it("treats Shopify collection-product duplicate canonicals as valid", () => {
    const validation = validateMetadataCanonical(
      "https://example.com/products/vest",
      "https://example.com/collections/summer/products/vest?utm_source=newsletter"
    );

    assert.equal(validation.isValid, true);
  });
});
