import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditBasicSeo } from "../src/audits/basicSeoAudit.js";
import type { CrawledPage } from "../src/types/page.js";

describe("basic SEO audit", () => {
  it("includes sample image URLs in missing alt evidence", () => {
    const issues = auditBasicSeo({
      finalUrl: "https://example.com/collections/t-shirt",
      status: 200,
      pageType: "collection",
      meta: {
        title: "T-Shirts for Men",
        description: "Shop t-shirts for men online with fresh styles and offers.",
        canonical: "https://example.com/collections/t-shirt"
      },
      headings: {
        h1: ["T-Shirts for Men"]
      },
      images: [
        {
          src: "https://example.com/cdn/shop/files/New_Tripr_Logo.png",
          rawSrc: "",
          alt: "",
          lazy: false
        },
        {
          src: "https://example.com/cdn/shop/files/2_39159825.png?height=100",
          rawSrc: "",
          alt: "",
          lazy: true
        }
      ]
    } as CrawledPage);

    const issue = issues.find((item) => item.code === "missing_image_alt");

    assert.equal(issue?.message, "1 images are missing alt text");
    assert.equal(issue?.evidence, "https://example.com/cdn/shop/files/2_39159825.png?height=100");
  });
});
