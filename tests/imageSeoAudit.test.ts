import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditImageSeo } from "../src/audits/imageSeoAudit.js";
import type { CrawledPage, ImageInfo } from "../src/types/page.js";

describe("image SEO audit", () => {
  it("adds a Shopify-specific message for product-title fallback duplicate alt text", () => {
    const page = {
      finalUrl: "https://example.com/products/joker-vest",
      pageType: "product",
      meta: {
        title: "Men Printed Tank Top Joker Vest"
      },
      headings: {
        h1: ["Men Printed Tank Top Joker Vest"]
      },
      images: [
        image("https://example.com/cdn/shop/files/joker-front.jpg"),
        image("https://example.com/cdn/shop/files/joker-back.jpg"),
        image("https://example.com/cdn/shop/files/joker-side.jpg")
      ]
    } as CrawledPage;

    const codes = auditImageSeo(page).map((issue) => issue.code);

    assert.equal(codes.includes("image_alt_duplicate_on_page"), true);
    assert.equal(codes.includes("shopify_variant_auto_alt_duplicate"), true);
  });
});

function image(src: string): ImageInfo {
  return {
    src,
    rawSrc: src,
    alt: "Men Printed Tank Top Joker Vest",
    width: "1000",
    height: "1000",
    lazy: true
  };
}
