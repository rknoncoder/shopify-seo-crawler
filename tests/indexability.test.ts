import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditIndexability } from "../src/audits/indexabilityAudit.js";
import { parseRobotsDirectives, summarizeIndexability } from "../src/utils/indexability.js";
import type { CrawledPage } from "../src/types/page.js";

describe("indexability", () => {
  it("parses user-agent-prefixed X-Robots-Tag directives", () => {
    const directives = parseRobotsDirectives("googlebot: noindex, otherbot: nofollow, max-snippet:50, max-image-preview:standard, max-video-preview:0, unavailable_after: Wed, 21 Oct 2015 07:28:00 GMT");

    assert.equal(directives.noindex, true);
    assert.equal(directives.nofollow, true);
    assert.equal(directives.maxSnippet, "50");
    assert.equal(directives.maxImagePreview, "standard");
    assert.equal(directives.maxVideoPreview, "0");
    assert.equal(directives.unavailableAfter, "Wed, 21 Oct 2015 07:28:00 GMT");
  });

  it("marks pages as not indexable when X-Robots-Tag contains noindex", () => {
    const page = crawledPage({ xRobotsTag: "noindex, nofollow" });
    const summary = summarizeIndexability(page);
    const issues = auditIndexability(page);

    assert.equal(summary.indexable, false);
    assert.equal(summary.status, "not_indexable_x_robots_tag");
    assert.equal(issues.some((issue) => issue.code === "x_robots_tag_noindex"), true);
    assert.equal(issues.some((issue) => issue.code === "x_robots_tag_nofollow"), true);
  });

  it("keeps HTML meta robots noindex behavior", () => {
    const page = crawledPage({ robots: "noindex" });
    const summary = summarizeIndexability(page);
    const issues = auditIndexability(page);

    assert.equal(summary.indexable, false);
    assert.equal(summary.status, "not_indexable_noindex");
    assert.equal(issues.some((issue) => issue.code === "meta_robots_noindex"), true);
  });

  it("flags richer robots preview directives", () => {
    const page = crawledPage({
      robots: "nosnippet, noarchive, noimageindex, max-snippet:50, max-image-preview:standard, max-video-preview:0, unavailable_after: 1 Jan 2000 00:00:00 GMT"
    });
    const summary = summarizeIndexability(page);
    const issueCodes = auditIndexability(page).map((issue) => issue.code);

    assert.equal(summary.indexable, false);
    assert.equal(summary.status, "not_indexable_unavailable_after");
    assert.equal(issueCodes.includes("meta_robots_nosnippet"), true);
    assert.equal(issueCodes.includes("meta_robots_noarchive"), true);
    assert.equal(issueCodes.includes("meta_robots_noimageindex"), true);
    assert.equal(issueCodes.includes("meta_robots_max_snippet_limited"), true);
    assert.equal(issueCodes.includes("meta_robots_max_image_preview_restricted"), true);
    assert.equal(issueCodes.includes("meta_robots_max_video_preview_limited"), true);
    assert.equal(issueCodes.includes("meta_robots_unavailable_after"), true);
  });
});

function crawledPage(overrides: { robots?: string; xRobotsTag?: string } = {}): CrawledPage {
  const url = "https://example.com/products/test";

  return {
    url,
    finalUrl: url,
    redirected: false,
    redirectCount: 0,
    status: 200,
    depth: 0,
    contentType: "text/html",
    http: {
      xRobotsTag: overrides.xRobotsTag ?? "",
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
    fetchedAt: "2026-05-18T00:00:00.000Z",
    loadTimeMs: 1,
    pageType: "product",
    meta: {
      title: "Test Product",
      description: "Test product description",
      canonical: url,
      robots: overrides.robots ?? "",
      htmlLang: "en",
      charset: "utf-8",
      charsetWithinFirst1024: true,
      viewport: "width=device-width, initial-scale=1",
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
      twitterImage: ""
    },
    headings: {
      h1: ["Test Product"],
      h2: [],
      h3: []
    },
    wordCount: 10,
    textSample: "",
    textHash: "",
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
    metadataValidation: {
      hasNoIndex: Boolean(overrides.robots?.includes("noindex") || overrides.xRobotsTag?.includes("noindex")),
      isCanonicalValid: true,
      hasOpenGraphProductData: false,
      ogPriceMismatch: false,
      hasViewportIssue: false,
      hreflangCount: 0
    },
    issues: []
  };
}
