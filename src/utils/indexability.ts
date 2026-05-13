import type { CrawledPage } from "../types/page.js";

export interface RobotsDirectives {
  noindex: boolean;
  nofollow: boolean;
  none: boolean;
  noarchive: boolean;
}

export interface IndexabilitySummary {
  indexable: boolean;
  status: string;
  canonicalTarget: string;
  canonicalSelfReferencing: boolean;
}

export function parseRobotsDirectives(value: string): RobotsDirectives {
  const directives = value
    .toLowerCase()
    .split(",")
    .map((directive) => directive.trim())
    .filter(Boolean);

  return {
    noindex: directives.includes("noindex") || directives.includes("none"),
    nofollow: directives.includes("nofollow") || directives.includes("none"),
    none: directives.includes("none"),
    noarchive: directives.includes("noarchive")
  };
}

export function summarizeIndexability(page: CrawledPage): IndexabilitySummary {
  const robots = parseRobotsDirectives(page.meta.robots);
  const canonicalTarget = normalizeCanonicalTarget(page.meta.canonical, page.finalUrl);
  const canonicalSelfReferencing = canonicalTarget ? sameNormalizedUrl(canonicalTarget, page.finalUrl) : false;

  if (page.status >= 400) {
    return {
      indexable: false,
      status: `not_indexable_http_${page.status}`,
      canonicalTarget,
      canonicalSelfReferencing
    };
  }

  if (robots.noindex) {
    return {
      indexable: false,
      status: "not_indexable_noindex",
      canonicalTarget,
      canonicalSelfReferencing
    };
  }

  if (canonicalTarget && !canonicalSelfReferencing) {
    return {
      indexable: false,
      status: "not_indexable_canonicalized",
      canonicalTarget,
      canonicalSelfReferencing
    };
  }

  return {
    indexable: true,
    status: "indexable",
    canonicalTarget,
    canonicalSelfReferencing
  };
}

export function normalizeCanonicalTarget(canonical: string, baseUrl: string): string {
  if (!canonical) return "";
  try {
    return normalizeUrlForIndexing(new URL(canonical, baseUrl));
  } catch {
    return "";
  }
}

export function sameNormalizedUrl(left: string, right: string): boolean {
  try {
    return normalizeUrlForIndexing(new URL(left)) === normalizeUrlForIndexing(new URL(right));
  } catch {
    return false;
  }
}

function normalizeUrlForIndexing(url: URL): string {
  url.hash = "";
  url.search = "";
  const normalized = url.toString();
  return normalized.endsWith("/") && url.pathname !== "/" ? normalized.slice(0, -1) : normalized;
}
