import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCrawlStatsCsvRows, buildCrawlStatsReport } from "../src/reports/crawlStatsReport.js";
import type { CrawlTelemetry } from "../src/types/crawl.js";
import type { SeoIssue } from "../src/types/issue.js";
import type { CrawledPage } from "../src/types/page.js";

describe("crawl stats report", () => {
  it("counts status families, exact statuses, failures, redirects, retries, and load-time summaries", () => {
    const report = buildCrawlStatsReport(
      [
        page(200, 10),
        page(201, 20, true),
        page(302, 30),
        page(404, 40),
        page(500, 50),
        page(102, 60)
      ],
      [
        issue("fetch_timeout"),
        issue("http_error"),
        issue("missing_title"),
        issue("orphaned_collection")
      ],
      telemetry(),
      linkGraphSummary()
    );

    assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(report.totalRequested, 8);
    assert.equal(report.totalCrawled, 6);
    assert.deepEqual(report.statusCodeCounts.families, {
      "2xx": 2,
      "3xx": 1,
      "4xx": 1,
      "5xx": 1,
      other: 1
    });
    assert.deepEqual(report.statusCodeCounts.exact, {
      "102": 1,
      "200": 1,
      "201": 1,
      "302": 1,
      "404": 1,
      "500": 1
    });
    assert.equal(report.fetchFailedCount, 2);
    assert.equal(report.skippedNonHtmlCount, 2);
    assert.equal(report.api_seeded_products, 7);
    assert.equal(report.api_seeded_collections, 3);
    assert.equal(report.probe_discovered_products, 5);
    assert.equal(report.probe_collections_attempted, 4);
    assert.equal(report.probe_collections_exhausted, 3);
    assert.equal(report.probe_collections_failed, 1);
    assert.equal(report.probe_total_pages_fetched, 9);
    assert.equal(report.sitemap_only_products, 2);
    assert.equal(report.orphaned_collection_count, 1);
    assert.equal(report.redirectedCount, 1);
    assert.deepEqual(report.retryCounters, telemetry().retries);
    assert.deepEqual(report.loadTimeMs, {
      avg: 35,
      p50: 30,
      p95: 60,
      max: 60
    });
    assert.deepEqual(report.network, {
      total_nodes: 3,
      total_edges: 4,
      orphan_count: 1,
      sink_count: 1,
      hub_count: 1,
      avg_inbound_links: 1.33,
      max_inbound_url: "https://example.com/products/foo",
      avg_depth_from_home: 1,
      top_pagerank_url: "https://example.com/products/foo",
      top_seo_pagerank_url: "https://example.com/products/foo",
      top_seo_pagerank_score: 0.9
    });
  });

  it("flattens crawl stats into one CSV row", () => {
    const report = buildCrawlStatsReport([page(200, 25), page(503, 75)], [issue("fetch_server_error")], telemetry(), linkGraphSummary());
    const [row] = buildCrawlStatsCsvRows(report);

    assert.equal(row.totalRequested, 8);
    assert.equal(row.totalCrawled, 2);
    assert.equal(row.status2xx, 1);
    assert.equal(row.status5xx, 1);
    assert.equal(row.exactStatusCounts, JSON.stringify({ "200": 1, "503": 1 }));
    assert.equal(row.fetchFailedCount, 1);
    assert.equal(row.api_seeded_products, 7);
    assert.equal(row.api_seeded_collections, 3);
    assert.equal(row.probe_discovered_products, 5);
    assert.equal(row.probe_collections_attempted, 4);
    assert.equal(row.probe_collections_exhausted, 3);
    assert.equal(row.probe_collections_failed, 1);
    assert.equal(row.probe_total_pages_fetched, 9);
    assert.equal(row.sitemap_only_products, 2);
    assert.equal(row.orphaned_collection_count, 0);
    assert.equal(row.retryStatusCounts, JSON.stringify({ "503": 2 }));
    assert.equal(row.avgLoadTimeMs, 50);
    assert.equal(row.p50LoadTimeMs, 25);
    assert.equal(row.p95LoadTimeMs, 75);
    assert.equal(row.maxLoadTimeMs, 75);
    assert.equal(row.total_nodes, 3);
    assert.equal(row.total_edges, 4);
    assert.equal(row.orphan_count, 1);
    assert.equal(row.sink_count, 1);
    assert.equal(row.hub_count, 1);
    assert.equal(row.avg_inbound_links, 1.33);
    assert.equal(row.max_inbound_url, "https://example.com/products/foo");
    assert.equal(row.avg_depth_from_home, 1);
    assert.equal(row.top_pagerank_url, "https://example.com/products/foo");
    assert.equal(row.top_seo_pagerank_url, "https://example.com/products/foo");
    assert.equal(row.top_seo_pagerank_score, 0.9);
  });

  it("returns null load-time summary values when no pages were crawled", () => {
    const report = buildCrawlStatsReport([], [], telemetry());

    assert.deepEqual(report.loadTimeMs, {
      avg: null,
      p50: null,
      p95: null,
      max: null
    });
  });
});

function page(status: number, loadTimeMs: number, redirected = false): CrawledPage {
  return { status, loadTimeMs, redirected } as CrawledPage;
}

function linkGraphSummary() {
  return [
    {
      url: "https://example.com/",
      type: "home" as const,
      inbound_count: 1,
      outbound_count: 2,
      inbound_sources: ["https://example.com/collections/rugs"],
      depth_from_home: 0,
      is_orphan: false,
      is_hub: true,
      is_sink: false,
      is_utility: false,
      pagerank_score: 0.25,
      seo_pagerank_score: 0.2
    },
    {
      url: "https://example.com/collections/rugs",
      type: "collection" as const,
      inbound_count: 1,
      outbound_count: 2,
      inbound_sources: ["https://example.com/"],
      depth_from_home: 1,
      is_orphan: false,
      is_hub: false,
      is_sink: false,
      is_utility: false,
      pagerank_score: 0.6,
      seo_pagerank_score: 0.4
    },
    {
      url: "https://example.com/products/foo",
      type: "product" as const,
      inbound_count: 2,
      outbound_count: 0,
      inbound_sources: ["https://example.com/", "https://example.com/collections/rugs"],
      depth_from_home: 2,
      is_orphan: true,
      is_hub: false,
      is_sink: true,
      is_utility: false,
      pagerank_score: 1,
      seo_pagerank_score: 0.9
    }
  ];
}

function issue(code: string): SeoIssue {
  return { code } as SeoIssue;
}

function telemetry(): CrawlTelemetry {
  return {
    totalRequested: 8,
    skippedNonHtmlCount: 2,
    apiSeededProducts: 7,
    apiSeededCollections: 3,
    probeDiscoveredProducts: 5,
    probeCollectionsAttempted: 4,
    probeCollectionsExhausted: 3,
    probeCollectionsFailed: 1,
    probeTotalPagesFetched: 9,
    sitemapOnlyProducts: 2,
    retries: {
      totalRetries: 3,
      statusRetries: 2,
      errorRetries: 1,
      retryStatusCounts: {
        "503": 2
      }
    }
  };
}
