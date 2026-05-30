import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildShopifyCollectionHtmlProbeUrl,
  buildShopifyCollectionProductsApiUrl,
  shouldBreakProbeForStatus,
  shouldProbeShopifyCollectionPagination
} from "../src/crawler/shopifyCollectionPagination.js";

describe("Shopify collection pagination probe", () => {
  it("starts probing any successful base collection URL without requiring HTML pagination signals", () => {
    assert.equal(
      shouldProbeShopifyCollectionPagination("https://example.com/collections/t-shirts", 200),
      true
    );
  });

  it("skips only non-200, query, pagination, broad all, and non-collection URLs", () => {
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/collections/t-shirts", 404), false);
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/collections/t-shirts?sort_by=best-selling", 200), false);
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/collections/t-shirts?page=2", 200), false);
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/collections/all", 200), false);
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/collections/all/sale", 200), false);
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/collections/summer/products/shirt", 200), false);
    assert.equal(shouldProbeShopifyCollectionPagination("https://example.com/products/shirt", 200), false);
  });

  it("breaks the probe loop only for terminal API response statuses", () => {
    assert.equal(shouldBreakProbeForStatus(200), false);
    assert.equal(shouldBreakProbeForStatus(301), false);
    assert.equal(shouldBreakProbeForStatus(400), false);
    assert.equal(shouldBreakProbeForStatus(403), false);
    assert.equal(shouldBreakProbeForStatus(429), false);
    assert.equal(shouldBreakProbeForStatus(404), true);
    assert.equal(shouldBreakProbeForStatus(500), true);
    assert.equal(shouldBreakProbeForStatus(503), true);
  });

  it("builds Shopify JSON probe URLs before HTML fallback URLs", () => {
    assert.equal(
      buildShopifyCollectionProductsApiUrl("https://example.com/collections/t-shirts", 3),
      "https://example.com/collections/t-shirts/products.json?limit=250&page=3"
    );
    assert.equal(
      buildShopifyCollectionHtmlProbeUrl("https://example.com/collections/t-shirts", 3),
      "https://example.com/collections/t-shirts?limit=250&page=3"
    );
  });
});
