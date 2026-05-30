import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLinkGraphCsvRows,
  buildLinkGraphReport,
  buildLinkGraphSummaryReport,
  inferLinkGraphNodeType,
  isUtilityUrl
} from "../src/reports/linkGraphReport.js";
import type { LinkGraph } from "../src/types/crawl.js";
import type { CrawledPage } from "../src/types/page.js";

describe("link graph report", () => {
  it("exports nodes, edges, edge CSV rows, and per-node summary stats", () => {
    const graph: LinkGraph = new Map([
      ["https://example.com/", new Set([
        "https://example.com/collections/rugs",
        "https://example.com/pages/about",
        "https://example.com/account/login"
      ])],
      ["https://example.com/account/login", new Set([
        "https://example.com/products/foo"
      ])],
      ["https://example.com/collections/rugs", new Set([
        "https://example.com/products/foo",
        "https://example.com/products/foo"
      ])],
      ["https://example.com/products/foo", new Set([
        "https://example.com/collections/rugs",
        "https://example.com/products/foo"
      ])],
      ["https://example.com/products/self-only", new Set([
        "https://example.com/products/self-only"
      ])],
      ["https://example.com/products/api-only", new Set()]
    ]);
    const pages = [
      page("https://example.com/"),
      page("https://example.com/account/login"),
      page("https://example.com/collections/rugs"),
      page("https://example.com/products/foo"),
      page("https://example.com/products/self-only"),
      page("https://example.com/products/api-only", "api_probe")
    ];

    const report = buildLinkGraphReport(graph, pages);
    const csvRows = buildLinkGraphCsvRows(report);
    const summary = buildLinkGraphSummaryReport(graph, pages);
    const productSummary = summary.find((row) => row.url === "https://example.com/products/foo");
    const utilitySummary = summary.find((row) => row.url === "https://example.com/account/login");
    const selfOnlySummary = summary.find((row) => row.url === "https://example.com/products/self-only");
    const apiOnlySummary = summary.find((row) => row.url === "https://example.com/products/api-only");

    assert.deepEqual(
      report.nodes.find((node) => node.id === "https://example.com/products/foo"),
      { id: "https://example.com/products/foo", type: "product", crawled: true }
    );
    assert.deepEqual(
      report.nodes.find((node) => node.id === "https://example.com/pages/about"),
      { id: "https://example.com/pages/about", type: "page", crawled: false }
    );
    assert.deepEqual(
      csvRows.find((row) => row.source === "https://example.com/collections/rugs" && row.target === "https://example.com/products/foo"),
      {
        source: "https://example.com/collections/rugs",
        target: "https://example.com/products/foo",
        source_type: "collection",
        target_type: "product"
      }
    );
    assert.equal(report.edges.some((edge) => edge.source === edge.target), false);
    assert.equal(csvRows.some((row) => row.source === row.target), false);
    assert.equal(productSummary?.type, "product");
    assert.equal(productSummary?.inbound_count, 2);
    assert.equal(productSummary?.outbound_count, 1);
    assert.deepEqual(productSummary?.inbound_sources, [
      "https://example.com/account/login",
      "https://example.com/collections/rugs"
    ]);
    assert.equal(productSummary?.depth_from_home, 2);
    assert.equal(productSummary?.is_orphan, false);
    assert.equal(productSummary?.is_hub, false);
    assert.equal(productSummary?.is_sink, false);
    assert.equal(productSummary?.is_utility, false);
    assert.equal(typeof productSummary?.pagerank_score, "number");
    assert.ok((productSummary?.pagerank_score ?? -1) >= 0);
    assert.ok((productSummary?.pagerank_score ?? 2) <= 1);
    assert.equal(typeof productSummary?.seo_pagerank_score, "number");
    assert.ok((productSummary?.seo_pagerank_score ?? -1) >= 0);
    assert.ok((productSummary?.seo_pagerank_score ?? 2) <= 1);

    assert.equal(utilitySummary?.is_utility, true);
    assert.equal(utilitySummary?.seo_pagerank_score, 0);

    assert.equal(selfOnlySummary?.inbound_count, 0);
    assert.equal(selfOnlySummary?.outbound_count, 0);
    assert.deepEqual(selfOnlySummary?.inbound_sources, []);
    assert.equal(selfOnlySummary?.is_orphan, true);
    assert.equal(selfOnlySummary?.is_sink, true);
    assert.equal(selfOnlySummary?.is_utility, false);

    assert.equal(apiOnlySummary?.inbound_count, 0);
    assert.equal(apiOnlySummary?.outbound_count, 0);
    assert.equal(apiOnlySummary?.depth_from_home, null);
    assert.equal(apiOnlySummary?.is_orphan, false);
    assert.equal(apiOnlySummary?.is_sink, true);
    assert.equal(apiOnlySummary?.is_utility, false);
  });

  it("infers node types from URL paths", () => {
    assert.equal(inferLinkGraphNodeType("https://example.com/"), "home");
    assert.equal(inferLinkGraphNodeType("https://example.com/products/foo"), "product");
    assert.equal(inferLinkGraphNodeType("https://example.com/collections/rugs"), "collection");
    assert.equal(inferLinkGraphNodeType("https://example.com/blogs/news/post"), "blog");
    assert.equal(inferLinkGraphNodeType("https://example.com/pages/about"), "page");
    assert.equal(inferLinkGraphNodeType("https://example.com/policies/refund-policy"), "other");
  });

  it("identifies utility URL patterns", () => {
    assert.equal(isUtilityUrl("https://example.com/account/login"), true);
    assert.equal(isUtilityUrl("https://example.com/cart"), true);
    assert.equal(isUtilityUrl("https://example.com/search?q=shirt"), true);
    assert.equal(isUtilityUrl("https://example.com/checkout/contact_information"), true);
    assert.equal(isUtilityUrl("https://example.com/password"), true);
    assert.equal(isUtilityUrl("https://example.com/products/cartoon-shirt"), false);
  });
});

function page(finalUrl: string, discoverySource?: CrawledPage["discoverySource"]): CrawledPage {
  return { finalUrl, discoverySource } as CrawledPage;
}
