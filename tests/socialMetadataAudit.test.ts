import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as cheerio from "cheerio";
import { auditSocialMetadata } from "../src/audits/socialMetadataAudit.js";
import { extractMeta } from "../src/parser/metaExtractor.js";
import type { CrawledPage, PageMeta } from "../src/types/page.js";

describe("social metadata audit", () => {
  it("extracts Open Graph and Twitter metadata", () => {
    const $ = cheerio.load(`
      <head>
        <title>Men Printed Vest</title>
        <meta property="og:title" content="Men Printed Vest" />
        <meta property="og:description" content="Shop printed vest online" />
        <meta property="og:type" content="product" />
        <meta property="og:url" content="https://example.com/products/vest" />
        <meta property="og:image" content="https://example.com/vest.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Men Printed Vest" />
        <meta name="twitter:description" content="Shop printed vest online" />
        <meta name="twitter:image" content="https://example.com/vest-twitter.jpg" />
      </head>
    `);

    const meta = extractMeta($);

    assert.equal(meta.ogType, "product");
    assert.equal(meta.ogUrl, "https://example.com/products/vest");
    assert.equal(meta.ogImageWidth, "1200");
    assert.equal(meta.ogImageHeight, "630");
    assert.equal(meta.twitterCard, "summary_large_image");
    assert.equal(meta.twitterImage, "https://example.com/vest-twitter.jpg");
  });

  it("does not flag complete aligned social metadata", () => {
    const issues = auditSocialMetadata(page({
      title: "Men Printed Vest",
      canonical: "https://example.com/products/vest",
      ogTitle: "Men Printed Vest",
      ogDescription: "Shop printed vest online",
      ogUrl: "https://example.com/products/vest",
      ogImage: "https://example.com/vest.jpg",
      ogImageWidth: "1200",
      ogImageHeight: "630",
      twitterCard: "summary_large_image",
      twitterTitle: "Men Printed Vest",
      twitterImage: "https://example.com/vest-twitter.jpg"
    }));

    assert.equal(issues.length, 0);
  });

  it("flags missing and mismatched social metadata", () => {
    const issues = auditSocialMetadata(page({
      title: "Men Printed Vest",
      canonical: "https://example.com/products/vest",
      ogTitle: "Completely Different Social Headline",
      ogUrl: "https://example.com/products/other",
      ogImage: "ftp://example.com/vest.jpg",
      twitterCard: "big-card",
      twitterTitle: "Different Twitter Title",
      twitterImage: "notaurl"
    }));

    const codes = issues.map((issue) => issue.code).sort();

    assert.deepEqual(codes, [
      "og_description_missing",
      "og_image_dimensions_missing",
      "og_image_invalid_url",
      "og_title_mismatch",
      "og_url_mismatch",
      "twitter_card_invalid",
      "twitter_image_invalid_url",
      "twitter_title_og_title_mismatch"
    ].sort());
  });
});

function page(metaOverrides: Partial<PageMeta>): CrawledPage {
  const url = "https://example.com/products/vest";

  return {
    finalUrl: url,
    status: 200,
    pageType: "product",
    meta: {
      title: "",
      description: "",
      canonical: url,
      robots: "",
      htmlLang: "",
      charset: "",
      charsetWithinFirst1024: false,
      viewport: "",
      alternates: [],
      hreflangLanguages: [],
      ogTitle: "",
      ogDescription: "",
      ogType: "",
      ogUrl: "",
      ogImage: "",
      ogImageWidth: "",
      ogImageHeight: "",
      ogPriceAmount: "",
      ogPriceCurrency: "",
      ogAvailability: "",
      twitterCard: "",
      twitterTitle: "",
      twitterDescription: "",
      twitterImage: "",
      ...metaOverrides
    }
  } as CrawledPage;
}
