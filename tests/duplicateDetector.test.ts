import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDuplicates } from "../src/analyzer/duplicateDetector.js";
import type { CrawledPage } from "../src/types/page.js";

describe("duplicate detection", () => {
  it("groups duplicate titles, meta descriptions, and content hashes", () => {
    const issues = detectDuplicates([
      page("https://example.com/products/a", {
        title: "Shared Product Title",
        description: "Unique description A",
        textHash: "hash-a"
      }),
      page("https://example.com/products/b", {
        title: "Shared Product Title",
        description: "Unique description B",
        textHash: "hash-b"
      }),
      page("https://example.com/products/c", {
        title: "Unique Product C",
        description: "Shared meta description",
        textHash: "hash-c"
      }),
      page("https://example.com/products/d", {
        title: "Unique Product D",
        description: "Shared meta description",
        textHash: "shared-content-hash"
      }),
      page("https://example.com/products/e", {
        title: "Unique Product E",
        description: "Unique description E",
        textHash: "shared-content-hash"
      }),
      page("https://example.com/products/blank", {
        title: "",
        description: "",
        textHash: ""
      })
    ]);

    const titleIssues = issues.filter((issue) => issue.code === "duplicate_title");
    const descriptionIssues = issues.filter((issue) => issue.code === "duplicate_meta_description");
    const contentIssues = issues.filter((issue) => issue.code === "duplicate_content");

    assert.equal(titleIssues.length, 2);
    assert.deepEqual(titleIssues.map((issue) => issue.url).sort(), [
      "https://example.com/products/a",
      "https://example.com/products/b"
    ]);
    assert.ok(titleIssues.every((issue) => issue.severity === "medium" && issue.category === "metadata"));
    assert.ok(titleIssues.every((issue) => issue.evidence === "Shared Product Title"));

    assert.equal(descriptionIssues.length, 2);
    assert.deepEqual(descriptionIssues.map((issue) => issue.url).sort(), [
      "https://example.com/products/c",
      "https://example.com/products/d"
    ]);
    assert.ok(descriptionIssues.every((issue) => issue.severity === "medium" && issue.category === "metadata"));
    assert.ok(descriptionIssues.every((issue) => issue.evidence === "Shared meta description"));

    assert.equal(contentIssues.length, 2);
    assert.deepEqual(contentIssues.map((issue) => issue.url).sort(), [
      "https://example.com/products/d",
      "https://example.com/products/e"
    ]);
    assert.ok(contentIssues.every((issue) => issue.severity === "high" && issue.category === "content"));
    assert.ok(contentIssues.every((issue) => issue.evidence === "shared-content-hash"));
  });
});

function page(
  url: string,
  overrides: {
    title: string;
    description: string;
    textHash: string;
  }
): CrawledPage {
  return {
    url,
    finalUrl: url,
    redirected: false,
    redirectCount: 0,
    status: 200,
    depth: 0,
    contentType: "text/html",
    http: {
      xRobotsTag: "",
      contentType: "text/html",
      lastModified: "",
      etag: "",
      cacheControl: "",
      server: "",
      cfCacheStatus: "",
      cdnCacheStatus: "",
      contentLength: "",
      responseSizeBytes: 0
    },
    fetchedAt: "2026-05-16T00:00:00.000Z",
    loadTimeMs: 10,
    pageType: "product",
    meta: {
      title: overrides.title,
      description: overrides.description,
      canonical: url,
      robots: "",
      alternates: [],
      ogTitle: "",
      ogDescription: "",
      ogType: "",
      ogUrl: "",
      ogImage: "",
      ogImageWidth: "",
      ogImageHeight: "",
      twitterCard: "",
      twitterTitle: "",
      twitterDescription: "",
      twitterImage: ""
    },
    headings: {
      h1: [],
      h2: [],
      h3: []
    },
    wordCount: 0,
    textSample: "",
    textHash: overrides.textHash,
    images: [],
    links: [],
    schemas: [],
    shopify: {
      isShopify: true,
      detectedApps: [],
      pageType: "product"
    },
    speed: {
      htmlSizeKb: 0,
      domElementCount: 0,
      scriptCount: 0,
      externalScriptCount: 0,
      thirdPartyScriptCount: 0,
      shopifyAppScriptCount: 0,
      stylesheetCount: 0,
      renderBlockingStylesheetCount: 0,
      imageCount: 0,
      largeImageUrlCount: 0,
      preloadedImageCount: 0,
      primaryImageFetchPriority: "",
      primaryImageLazy: false,
      thirdPartyScriptHosts: [],
      shopifyAppScriptHosts: []
    },
    issues: []
  };
}
