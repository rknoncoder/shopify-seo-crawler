import type { LinkGraphSummaryRow } from "../reports/linkGraphReport.js";
import { isUtilityUrl } from "../reports/linkGraphReport.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

const orphanedCollectionRecommendation = "This collection has no internal HTML links pointing to it. Add it to a navigation menu or link it from a relevant page. Products assigned only to this collection will appear in the unreachable products report.";

export function detectOrphanedCollectionIssues(
  pages: CrawledPage[],
  linkGraphSummary: LinkGraphSummaryRow[]
): SeoIssue[] {
  const summaryByUrl = new Map(linkGraphSummary.map((row) => [normalizeUrl(row.url), row]));
  const issues: SeoIssue[] = [];
  const seenIssueUrls = new Set<string>();

  for (const page of pages) {
    const collection = parsePrimaryCollectionUrl(page.finalUrl);
    if (!collection || page.status !== 200) continue;
    if (seenIssueUrls.has(collection.url)) continue;

    const summary = summaryByUrl.get(normalizeUrl(page.finalUrl));
    const inboundSources = filterNonUtilityInboundSources(page.finalUrl, summary?.inbound_sources ?? []);
    if (inboundSources.length > 0) continue;

    seenIssueUrls.add(collection.url);
    issues.push({
      url: collection.url,
      handle: collection.handle,
      issue: "orphaned_collection",
      pageType: page.pageType,
      severity: "critical",
      category: "internal_links",
      code: "orphaned_collection",
      message: "Collection has no internal HTML links pointing to it.",
      recommendation: orphanedCollectionRecommendation,
      evidence: truncate("status=200; inbound_non_utility_sources=0", 500)
    });
  }

  return issues;
}

function filterNonUtilityInboundSources(targetUrl: string, inboundSources: string[]): string[] {
  const normalizedTarget = normalizeUrl(targetUrl);

  return inboundSources.filter((source) => {
    const normalizedSource = normalizeUrl(source);
    return normalizedSource
      && normalizedSource !== normalizedTarget
      && !isUtilityUrl(normalizedSource);
  });
}

function parsePrimaryCollectionUrl(url: string): { url: string; handle: string } | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.search) return undefined;

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "collections") return undefined;

    const handle = decodeURIComponent(segments[1] ?? "");
    if (!handle) return undefined;

    return {
      url: normalizeUrl(parsed.toString()),
      handle
    };
  } catch {
    return undefined;
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}
