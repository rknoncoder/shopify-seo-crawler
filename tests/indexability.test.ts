import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditIndexability } from "../src/audits/indexabilityAudit.js";
import { parseRobotsDirectives, summarizeIndexability } from "../src/utils/indexability.js";
import type { CrawledPage } from "../src/types/page.js";

describe("indexability", () => {
  it("parses user-agent-prefixed X-Robots-Tag directives", () => {
    const directives = parseRobotsDirectives("googlebot: noindex, otherbot: nofollow");

    assert.equal(directives.noindex, true);
    assert.equal(directives.nofollow, true);
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
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      twitterTitle: "",
      twitterDescription: ""
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
    issues: []
  };
}
