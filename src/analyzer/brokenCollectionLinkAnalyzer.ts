import type { LinkGraph } from "../types/crawl.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

const brokenCollectionRecommendation = "Remove or redirect this collection URL. Check if collection was deleted or handle was changed in Shopify admin.";
const vendorsPageNote = "This is a Shopify vendor listing page. Enable it in Shopify Admin -> Online Store -> Navigation, or remove the link.";

export function detectBrokenCollectionLinks(pages: CrawledPage[], linkGraph: LinkGraph): SeoIssue[] {
  const issues: SeoIssue[] = [];

  for (const page of pages) {
    if (page.status !== 404 || !isCollectionUrl(page.finalUrl)) continue;

    const inboundSources = findInboundSources(page.finalUrl, linkGraph);
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "high",
      category: "internal_links",
      code: "broken_collection_link",
      message: "Collection URL returns HTTP 404.",
      recommendation: buildRecommendation(page.finalUrl),
      evidence: truncate(`status=404; inbound_sources=${inboundSources.join("|") || "none"}`, 500),
      inbound_sources: inboundSources
    });
  }

  return issues;
}

function findInboundSources(targetUrl: string, linkGraph: LinkGraph): string[] {
  const normalizedTarget = normalizeGraphUrl(targetUrl);
  const sources = new Set<string>();

  for (const [source, targets] of linkGraph) {
    if (normalizeGraphUrl(source) === normalizedTarget) continue;

    for (const target of targets) {
      if (normalizeGraphUrl(target) === normalizedTarget) {
        sources.add(source);
        break;
      }
    }
  }

  return [...sources].sort();
}

function buildRecommendation(url: string): string {
  return isVendorsCollection(url)
    ? `${brokenCollectionRecommendation} ${vendorsPageNote}`
    : brokenCollectionRecommendation;
}

function isCollectionUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith("/collections/");
  } catch {
    return false;
  }
}

function isVendorsCollection(url: string): boolean {
  try {
    const pathname = normalizePathname(new URL(url).pathname);
    return pathname === "/collections/vendors";
  } catch {
    return false;
  }
}

function normalizeGraphUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

function normalizePathname(pathname: string): string {
  return pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
}
