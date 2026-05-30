import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectOrphanedCollectionIssues } from "../src/analyzer/orphanedCollectionAnalyzer.js";
import type { LinkGraphSummaryRow } from "../src/reports/linkGraphReport.js";
import type { CrawledPage } from "../src/types/page.js";

describe("orphaned collection analyzer", () => {
  it("reports 200 primary collection URLs with no non-utility inbound links", () => {
    const issues = detectOrphanedCollectionIssues(
      [page("https://example.com/collections/innerwear", 200)],
      [
        summary("https://example.com/collections/innerwear", [
          "https://example.com/collections/innerwear",
          "https://example.com/search?q=innerwear"
        ])
      ]
    );

    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "orphaned_collection");
    assert.equal(issues[0].issue, "orphaned_collection");
    assert.equal(issues[0].severity, "critical");
    assert.equal(issues[0].handle, "innerwear");
    assert.match(issues[0].recommendation, /Add it to a navigation menu/);
  });

  it("does not report collections with real internal inbound links", () => {
    const issues = detectOrphanedCollectionIssues(
      [page("https://example.com/collections/innerwear", 200)],
      [
        summary("https://example.com/collections/innerwear", [
          "https://example.com/",
          "https://example.com/pages/size-guide"
        ])
      ]
    );

    assert.equal(issues.length, 0);
  });

  it("ignores non-200 collections, query variants, and tag collection paths", () => {
    const issues = detectOrphanedCollectionIssues(
      [
        page("https://example.com/collections/deleted", 404),
        page("https://example.com/collections/innerwear?sort_by=best-selling", 200),
        page("https://example.com/collections/all/sale", 200),
        page("https://example.com/products/innerwear", 200)
      ],
      []
    );

    assert.equal(issues.length, 0);
  });
});

function page(finalUrl: string, status: number): CrawledPage {
  return { finalUrl, status, pageType: "collection" } as CrawledPage;
}

function summary(url: string, inboundSources: string[]): LinkGraphSummaryRow {
  return {
    url,
    type: "collection",
    inbound_count: inboundSources.length,
    outbound_count: 0,
    inbound_sources: inboundSources,
    depth_from_home: null,
    is_orphan: inboundSources.length === 0,
    is_hub: false,
    is_sink: true,
    is_utility: false,
    pagerank_score: 0,
    seo_pagerank_score: 0
  };
}
