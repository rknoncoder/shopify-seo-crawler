import type { CrawledPage } from "../types/page.js";

export interface RobotsDirectives {
  noindex: boolean;
  nofollow: boolean;
  none: boolean;
  noarchive: boolean;
  nosnippet: boolean;
  noimageindex: boolean;
  maxSnippet: string;
  maxImagePreview: string;
  maxVideoPreview: string;
  unavailableAfter: string;
}

export interface IndexabilitySummary {
  indexable: boolean;
  status: string;
  canonicalTarget: string;
  canonicalSelfReferencing: boolean;
}

export function parseRobotsDirectives(value: string): RobotsDirectives {
  const tokens = tokenizeRobotsDirectives(value);
  const directiveNames = tokens.map((token) => token.name);
  const valueMap = new Map(tokens.map((token) => [token.name, token.value]));

  return {
    noindex: directiveNames.includes("noindex") || directiveNames.includes("none"),
    nofollow: directiveNames.includes("nofollow") || directiveNames.includes("none"),
    none: directiveNames.includes("none"),
    noarchive: directiveNames.includes("noarchive"),
    nosnippet: directiveNames.includes("nosnippet"),
    noimageindex: directiveNames.includes("noimageindex"),
    maxSnippet: valueMap.get("max-snippet") || "",
    maxImagePreview: valueMap.get("max-image-preview") || "",
    maxVideoPreview: valueMap.get("max-video-preview") || "",
    unavailableAfter: valueMap.get("unavailable_after") || ""
  };
}

export function summarizeIndexability(page: CrawledPage): IndexabilitySummary {
  const metaRobots = parseRobotsDirectives(page.meta.robots);
  const headerRobots = parseRobotsDirectives(page.http?.xRobotsTag ?? "");
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

  if (headerRobots.noindex) {
    return {
      indexable: false,
      status: "not_indexable_x_robots_tag",
      canonicalTarget,
      canonicalSelfReferencing
    };
  }

  if (metaRobots.noindex) {
    return {
      indexable: false,
      status: "not_indexable_noindex",
      canonicalTarget,
      canonicalSelfReferencing
    };
  }

  if (isUnavailableAfterExpired(headerRobots.unavailableAfter)) {
    return {
      indexable: false,
      status: "not_indexable_x_robots_tag_unavailable_after",
      canonicalTarget,
      canonicalSelfReferencing
    };
  }

  if (isUnavailableAfterExpired(metaRobots.unavailableAfter)) {
    return {
      indexable: false,
      status: "not_indexable_unavailable_after",
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

interface RobotsToken {
  name: string;
  value: string;
}

const valuedRobotsDirectives = new Set([
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "unavailable_after"
]);

const knownRobotsDirectives = new Set([
  "all",
  "index",
  "follow",
  "noindex",
  "nofollow",
  "none",
  "noarchive",
  "nosnippet",
  "noimageindex",
  "notranslate",
  "indexifembedded",
  ...valuedRobotsDirectives
]);

function tokenizeRobotsDirectives(value: string): RobotsToken[] {
  return splitRobotsDirectiveValue(value)
    .map((directive) => parseRobotsToken(stripUserAgentPrefix(directive)))
    .filter((token): token is RobotsToken => Boolean(token));
}

function splitRobotsDirectiveValue(value: string): string[] {
  const parts = value.split(",");
  const directives: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const previous = directives[directives.length - 1] || "";
    if (isUnavailableAfterToken(previous) && !looksLikeRobotsDirective(trimmed)) {
      directives[directives.length - 1] = `${previous}, ${trimmed}`;
    } else {
      directives.push(trimmed);
    }
  }

  return directives;
}

function stripUserAgentPrefix(directive: string): string {
  const trimmed = directive.trim();
  const separator = trimmed.indexOf(":");
  if (separator < 0) return trimmed;

  const prefix = normalizeDirectiveName(trimmed.slice(0, separator));
  if (valuedRobotsDirectives.has(prefix)) return trimmed;

  const remainder = trimmed.slice(separator + 1).trim();
  return looksLikeRobotsDirective(remainder) ? remainder : trimmed;
}

function parseRobotsToken(directive: string): RobotsToken | null {
  const separator = directive.indexOf(":");
  const rawName = separator >= 0 ? directive.slice(0, separator) : directive;
  const name = normalizeDirectiveName(rawName);
  if (!knownRobotsDirectives.has(name)) return null;

  return {
    name,
    value: separator >= 0 ? directive.slice(separator + 1).trim() : ""
  };
}

function looksLikeRobotsDirective(value: string): boolean {
  const separator = value.indexOf(":");
  const rawName = separator >= 0 ? value.slice(0, separator) : value;
  return knownRobotsDirectives.has(normalizeDirectiveName(rawName));
}

function normalizeDirectiveName(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, "-") === "unavailable-after"
    ? "unavailable_after"
    : name.trim().toLowerCase().replace(/_/g, "-");
}

function isUnavailableAfterToken(value: string): boolean {
  return normalizeDirectiveName(value.split(":")[0] || "") === "unavailable_after";
}

function isUnavailableAfterExpired(value: string): boolean {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
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
