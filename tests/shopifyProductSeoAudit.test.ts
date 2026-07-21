import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditShopifyProductSeo } from "../src/audits/shopifyProductSeoAudit.js";
import type { CrawledPage, PageMeta } from "../src/types/page.js";

describe("Shopify product SEO audit", () => {
  it("does not flag hidden sold-out UI text when the page has clear in-stock text", () => {
    const issues = auditShopifyProductSeo(productPage({
      textSample: "Add to cart - Rs. 299.00 Sold Out - Notify me when it's available Hurry, only 4 items left in stock!"
    }));

    assert.equal(issues.some((issue) => issue.code === "product_sold_out_indexable"), false);
  });

  it("flags an indexable product with only sold-out availability signals", () => {
    const issues = auditShopifyProductSeo(productPage({
      textSample: "Sold Out - Notify me when it's available"
    }));
    const soldOutIssue = issues.find((issue) => issue.code === "product_sold_out_indexable");

    assert.equal(soldOutIssue?.severity, "medium");
    assert.match(soldOutIssue?.evidence || "", /Sold Out/i);
  });

  it("does not flag sold-out text when Open Graph availability says in stock", () => {
    const issues = auditShopifyProductSeo(productPage({
      meta: { ogAvailability: "in stock" },
      textSample: "Sold Out - Notify me when it's available"
    }));

    assert.equal(issues.some((issue) => issue.code === "product_sold_out_indexable"), false);
  });
});

function productPage(overrides: {
  meta?: Partial<PageMeta>;
  textSample?: string;
} = {}): CrawledPage {
  const finalUrl = "https://example.com/products/sample";

  return {
    finalUrl,
    status: 200,
    pageType: "product",
    wordCount: 300,
    textSample: overrides.textSample || "",
    meta: {
      title: "Sample Product",
      description: "Sample product description",
      canonical: finalUrl,
      robots: "",
      ogAvailability: "",
      ...overrides.meta
    },
    http: {
      xRobotsTag: ""
    },
    headings: {
      h1: ["Sample Product"],
      h2: [],
      h3: []
    },
    links: [],
    images: [
      { src: "https://example.com/a.jpg", rawSrc: "", alt: "Sample front", lazy: false },
      { src: "https://example.com/b.jpg", rawSrc: "", alt: "Sample back", lazy: true },
      { src: "https://example.com/c.jpg", rawSrc: "", alt: "Sample detail", lazy: true }
    ],
    shopify: {
      detectedApps: []
    }
  } as CrawledPage;
}
