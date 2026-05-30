import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectBrokenCollectionLinks } from "../src/analyzer/brokenCollectionLinkAnalyzer.js";
import type { LinkGraph } from "../src/types/crawl.js";
import type { CrawledPage } from "../src/types/page.js";

describe("broken collection link analyzer", () => {
  it("reports 404 collection URLs with inbound sources from the link graph", () => {
    const pages = [
      page("https://example.com/", 200, "home"),
      page("https://example.com/collections/deleted", 404, "collection")
    ];
    const graph: LinkGraph = new Map([
      ["https://example.com/", new Set(["https://example.com/collections/deleted"])],
      ["https://example.com/pages/about", new Set(["https://example.com/collections/deleted"])]
    ]);

    const issues = detectBrokenCollectionLinks(pages, graph);

    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "broken_collection_link");
    assert.equal(issues[0].url, "https://example.com/collections/deleted");
    assert.deepEqual(issues[0].inbound_sources, [
      "https://example.com/",
      "https://example.com/pages/about"
    ]);
    assert.match(issues[0].recommendation, /Remove or redirect this collection URL/);
  });

  it("adds Shopify vendor page guidance for broken collections/vendors links", () => {
    const issues = detectBrokenCollectionLinks(
      [page("https://example.com/collections/vendors", 404, "collection")],
      new Map([["https://example.com/", new Set(["https://example.com/collections/vendors"])]])
    );

    assert.equal(issues.length, 1);
    assert.match(issues[0].recommendation, /Shopify vendor listing page/);
    assert.match(issues[0].recommendation, /Online Store -> Navigation/);
  });

  it("does not report non-collection 404s", () => {
    const issues = detectBrokenCollectionLinks(
      [page("https://example.com/products/deleted", 404, "product")],
      new Map([["https://example.com/", new Set(["https://example.com/products/deleted"])]])
    );

    assert.equal(issues.length, 0);
  });
});

function page(finalUrl: string, status: number, pageType: string): CrawledPage {
  return { finalUrl, status, pageType } as CrawledPage;
}
