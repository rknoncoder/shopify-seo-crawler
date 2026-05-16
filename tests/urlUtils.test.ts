import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import config from "../src/config/config.js";
import { getShopifyProductCanonicalUrl, normalizeSitemapUrl, normalizeUrl } from "../src/utils/urlUtils.js";

describe("URL normalization", () => {
  beforeEach(() => {
    config.crawl.keepQueryStrings = false;
  });

  it("resolves relative URLs and strips hashes, query strings, and trailing slashes", () => {
    const normalized = normalizeUrl("/collections/printed-vest/?variant=123#reviews", "https://triprindia.com/products/sample");

    assert.equal(normalized, "https://triprindia.com/collections/printed-vest");
  });

  it("preserves query strings when crawl config keeps them", () => {
    config.crawl.keepQueryStrings = true;

    const normalized = normalizeUrl("https://triprindia.com/products/vest/?variant=123#reviews");

    assert.equal(normalized, "https://triprindia.com/products/vest?variant=123");
  });

  it("keeps sitemap query ranges while removing hashes", () => {
    const normalized = normalizeSitemapUrl("https://triprindia.com/sitemap_collections_1.xml?from=1&to=2#top");

    assert.equal(normalized, "https://triprindia.com/sitemap_collections_1.xml?from=1&to=2");
  });

  it("normalizes Shopify collection product URLs to clean product canonical URLs", () => {
    const canonical = getShopifyProductCanonicalUrl("https://triprindia.com/collections/printed-vest/products/tripr-mens-printed-vest-1");

    assert.equal(canonical, "https://triprindia.com/products/tripr-mens-printed-vest-1");
  });
});
