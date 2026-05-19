import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as cheerio from "cheerio";
import { auditHreflang } from "../src/audits/hreflangAudit.js";
import { extractMeta } from "../src/parser/metaExtractor.js";
import type { CrawledPage, PageMeta } from "../src/types/page.js";

describe("hreflang alternates", () => {
  it("extracts alternate link metadata from the head", () => {
    const $ = cheerio.load(`
      <head>
        <link rel="alternate" hreflang="en-IN" href="https://example.com/en" />
        <link rel="alternate" hreflang="x-default" href="https://example.com/" />
        <link rel="alternate" type="application/rss+xml" title="Feed" href="/feed.xml" />
      </head>
    `);

    const meta = extractMeta($);

    assert.deepEqual(meta.alternates, [
      {
        href: "https://example.com/en",
        hreflang: "en-IN",
        type: "",
        title: ""
      },
      {
        href: "https://example.com/",
        hreflang: "x-default",
        type: "",
        title: ""
      },
      {
        href: "/feed.xml",
        hreflang: "",
        type: "application/rss+xml",
        title: "Feed"
      }
    ]);
  });

  it("does not flag RSS alternate links as hreflang issues", () => {
    const issues = auditHreflang(page({
      alternates: [{
        href: "/feed.xml",
        hreflang: "",
        type: "application/rss+xml",
        title: "Feed"
      }]
    }));

    assert.equal(issues.length, 0);
  });

  it("flags malformed hreflang alternate metadata", () => {
    const issues = auditHreflang(page({
      alternates: [
        {
          href: "https://example.com/products/test",
          hreflang: "en-IN",
          type: "",
          title: ""
        },
        {
          href: "https://example.com/products/test-copy",
          hreflang: "en-IN",
          type: "",
          title: ""
        },
        {
          href: "ftp://example.com/products/test",
          hreflang: "english",
          type: "",
          title: ""
        },
        {
          href: "",
          hreflang: "hi-IN",
          type: "",
          title: ""
        }
      ]
    }));

    assert.deepEqual(issues.map((issue) => issue.code).sort(), [
      "hreflang_duplicate_value",
      "hreflang_invalid_url",
      "hreflang_invalid_value",
      "hreflang_missing_href"
    ].sort());
  });

  it("recommends a self-reference when a valid hreflang cluster omits the current URL", () => {
    const issues = auditHreflang(page({
      alternates: [
        {
          href: "https://example.com/products/test-en",
          hreflang: "en",
          type: "",
          title: ""
        },
        {
          href: "https://example.com/products/test-hi",
          hreflang: "hi-IN",
          type: "",
          title: ""
        }
      ]
    }));

    assert.equal(issues.some((issue) => issue.code === "hreflang_self_reference_missing"), true);
  });
});

function page(overrides: { alternates: PageMeta["alternates"] }): CrawledPage {
  const url = "https://example.com/products/test";

  return {
    finalUrl: url,
    meta: {
      canonical: url,
      alternates: overrides.alternates
    }
  } as CrawledPage;
}
