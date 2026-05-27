import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectInternalLinkIssues } from "../src/analyzer/internalLinkAnalyzer.js";
import type { CrawledPage, DiscoverySource, LinkInfo } from "../src/types/page.js";

describe("internal link analyzer", () => {
  it("reports probe-discovered pages without HTML inbound links separately from true orphans", () => {
    const issues = detectInternalLinkIssues([
      page("https://example.com/products/api-only", "product", [], "api_probe"),
      page("https://example.com/products/paginated-only", "product", [], "pagination_probe"),
      page("https://example.com/products/sitemap-only", "product", [], "sitemap_unlisted"),
      page("https://example.com/products/true-orphan", "product", [])
    ]);

    const codesByUrl = new Map(issues.map((issue) => [issue.url, issue.code]));

    assert.equal(codesByUrl.get("https://example.com/products/api-only"), "no_html_inbound_link");
    assert.equal(codesByUrl.get("https://example.com/products/paginated-only"), "no_html_inbound_link");
    assert.equal(codesByUrl.get("https://example.com/products/sitemap-only"), "no_html_inbound_link");
    assert.equal(codesByUrl.get("https://example.com/products/true-orphan"), "orphan_page");
  });

  it("does not report no_html_inbound_link when a probe-discovered page has an HTML inbound link", () => {
    const issues = detectInternalLinkIssues([
      page("https://example.com/collections/shirts", "collection", [
        link("https://example.com/products/api-linked")
      ]),
      page("https://example.com/products/api-linked", "product", [], "api_probe")
    ]);

    const productIssues = issues.filter((issue) => issue.url === "https://example.com/products/api-linked");

    assert.equal(productIssues.some((issue) => issue.code === "no_html_inbound_link"), false);
    assert.equal(productIssues.some((issue) => issue.code === "orphan_page"), false);
  });
});

function page(
  finalUrl: string,
  pageType: string,
  links: LinkInfo[],
  discoverySource?: DiscoverySource
): CrawledPage {
  return {
    finalUrl,
    url: finalUrl,
    status: 200,
    pageType,
    links,
    discoverySource
  } as CrawledPage;
}

function link(href: string): LinkInfo {
  return {
    href,
    rawHref: href,
    text: "",
    rel: [],
    internal: true
  };
}
