import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUnreachableProductsReport } from "../src/reports/unreachableProductsReport.js";
import type { SeoIssue } from "../src/types/issue.js";
import type { CrawledPage, DiscoverySource } from "../src/types/page.js";

describe("unreachable products report", () => {
  it("lists no-html-inbound product pages with discovery source, memberships, and graph metrics", async () => {
    const rows = await buildUnreachableProductsReport(
      [
        page("https://example.com/products/api-only", "api_probe"),
        page("https://example.com/products/sitemap-only", "sitemap_unlisted"),
        page("https://example.com/collections/rugs", undefined, "collection"),
        page("https://example.com/collections/api-only", "api_probe", "collection")
      ],
      [
        issue("https://example.com/products/api-only", "api_seed"),
        issue("https://example.com/products/sitemap-only", "sitemap_only"),
        issue("https://example.com/collections/api-only", "api_seed")
      ],
      [
        summary("https://example.com/products/api-only", 0, 0.12, []),
        summary("https://example.com/products/sitemap-only", 1, 0.04, ["https://example.com/collections/rugs"])
      ],
      {
        baseUrl: "https://example.com",
        probeDiscoveryMap: new Map([
          ["api-only", new Set(["rugs", "hidden-collection"])]
        ])
      }
    );

    assert.deepEqual(rows, [
      {
        url: "https://example.com/products/api-only",
        handle: "api-only",
        discovery_source: "api_seed",
        inbound_count: 0,
        pagerank_score: 0.12,
        collection_memberships: "hidden-collection|rugs",
        collection_is_crawled: "hidden-collection:false|rugs:true",
        bucket: "B_collection_crawled_not_linked",
        collections_count: 2
      },
      {
        url: "https://example.com/products/sitemap-only",
        handle: "sitemap-only",
        discovery_source: "sitemap_only",
        inbound_count: 1,
        pagerank_score: 0.04,
        collection_memberships: "no_collection",
        collection_is_crawled: "",
        bucket: "A_no_collection",
        collections_count: 0
      }
    ]);
  });

  it("marks products found only in uncrawled collection probes separately", async () => {
    const [row] = await buildUnreachableProductsReport(
      [page("https://example.com/products/api-only", "api_probe")],
      [issue("https://example.com/products/api-only", "api_seed")],
      [summary("https://example.com/products/api-only", 0, 0.12, [])],
      {
        baseUrl: "https://example.com",
        probeDiscoveryMap: new Map([
          ["api-only", new Set(["hidden-collection"])]
        ])
      }
    );

    assert.equal(row.collection_memberships, "hidden-collection");
    assert.equal(row.collection_is_crawled, "hidden-collection:false");
    assert.equal(row.bucket, "C_collection_not_crawled");
    assert.equal(row.collections_count, 1);
  });
});

function page(finalUrl: string, discoverySource?: DiscoverySource, pageType = "product"): CrawledPage {
  return {
    finalUrl,
    status: 200,
    pageType,
    discoverySource
  } as CrawledPage;
}

function issue(url: string, reachable_via: string): SeoIssue {
  return {
    url,
    code: "no_html_inbound_link",
    reachable_via
  } as SeoIssue;
}

function summary(url: string, inboundCount: number, pageRankScore: number, inboundSources: string[]) {
  return {
    url,
    type: "product" as const,
    inbound_count: inboundCount,
    outbound_count: 0,
    inbound_sources: inboundSources,
    depth_from_home: null,
    is_orphan: inboundCount === 0,
    is_hub: false,
    is_sink: true,
    is_utility: false,
    pagerank_score: pageRankScore,
    seo_pagerank_score: pageRankScore
  };
}
