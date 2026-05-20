import type { CrawledPage } from "../types/page.js";
import { summarizeIndexability } from "../utils/indexability.js";

export interface IndexabilityReportRow {
  url: string;
  status: number;
  pageType: string;
  indexable: boolean;
  indexabilityStatus: string;
  inSitemap: boolean;
  canonical: string;
  canonicalTarget: string;
  canonicalSelfReferencing: boolean;
  robots: string;
  xRobotsTag: string;
  alternateCount: number;
  hreflangValues: string;
  issueCodes: string;
}

export function buildIndexabilityReport(pages: CrawledPage[], sitemapUrls: string[]): IndexabilityReportRow[] {
  const sitemapSet = new Set(sitemapUrls.map(normalizeForCompare));

  return pages.map((page) => {
    const indexability = summarizeIndexability(page);

    return {
      url: page.finalUrl,
      status: page.status,
      pageType: page.pageType,
      indexable: indexability.indexable,
      indexabilityStatus: indexability.status,
      inSitemap: sitemapSet.has(normalizeForCompare(page.finalUrl)),
      canonical: page.meta.canonical,
      canonicalTarget: indexability.canonicalTarget,
      canonicalSelfReferencing: indexability.canonicalSelfReferencing,
      robots: page.meta.robots,
      xRobotsTag: page.http?.xRobotsTag ?? "",
      alternateCount: page.meta.alternates.length,
      hreflangValues: page.meta.hreflangLanguages.join("|"),
      issueCodes: page.issues.join("|")
    };
  });
}

function normalizeForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}
