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
        requestDelayMs: 0,
        fetchCollectionMemberships: async (handle) => {
          if (handle === "api-only") return ["rugs", "hidden-collection"];
          if (handle === "sitemap-only") return [];
          return undefined;
        }
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
        collections_count: 2
      },
      {
        url: "https://example.com/products/sitemap-only",
        handle: "sitemap-only",
        discovery_source: "sitemap_only",
        inbound_count: 1,
        pagerank_score: 0.04,
        collection_memberships: "",
        collection_is_crawled: "",
        collections_count: 0
      }
    ]);
  });

  it("marks membership as not_exposed when product JSON has no collections array", async () => {
    const [row] = await buildUnreachableProductsReport(
      [page("https://example.com/products/api-only", "api_probe")],
      [issue("https://example.com/products/api-only", "api_seed")],
      [summary("https://example.com/products/api-only", 0, 0.12, [])],
      {
        requestDelayMs: 0,
        fetchCollectionMemberships: async () => undefined
      }
    );

    assert.equal(row.collection_memberships, "not_exposed");
    assert.equal(row.collection_is_crawled, "not_exposed");
    assert.equal(row.collections_count, 0);
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
