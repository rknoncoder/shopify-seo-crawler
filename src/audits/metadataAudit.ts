import {
  detectMetadataPriceMismatch,
  hasBlogMaxImagePreviewLarge,
  isMissingOrPlaceholderOgImage,
  validateMetadataCanonical
} from "../analyzer/metadata.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { parseRobotsDirectives, summarizeIndexability } from "../utils/indexability.js";
import { truncate } from "../utils/textUtils.js";

type NoindexSource = NonNullable<SeoIssue["noindex_source"]>;

export function auditMetadataValidation(page: CrawledPage): SeoIssue[] {
  if (page.status !== 200) return [];

  const issues: SeoIssue[] = [];
  addRobotsIssues(page, issues);
  addCanonicalIssues(page, issues);
  addOpenGraphIssues(page, issues);
  addLocalizationAndHygieneIssues(page, issues);
  return issues;
}

function addRobotsIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const robots = parseRobotsDirectives(page.meta.robots);

  addNoindexPageIssue(page, issues);

  if (robots.nofollow) {
    issues.push(issue(
      page,
      "low",
      "metadata_nofollow",
      "Page uses meta robots nofollow.",
      "Use nofollow only when you intentionally do not want search engines to follow links on this page.",
      page.meta.robots
    ));
  }

  if (["blog", "article"].includes(page.pageType) && !hasBlogMaxImagePreviewLarge(page.meta.robots)) {
    issues.push(issue(
      page,
      "low",
      "metadata_blog_missing_max_image_preview_large",
      "Blog or article page does not allow large image previews in robots metadata.",
      "Add max-image-preview:large to blog/article robots metadata unless large previews should be restricted.",
      page.meta.robots || "robots meta missing"
    ));
  }
}

function addNoindexPageIssue(page: CrawledPage, issues: SeoIssue[]): void {
  if (!isPrimaryProductOrCollectionUrl(page.finalUrl)) return;

  const source = detectNoindexSource(page);
  if (!source) return;

  const indexability = summarizeIndexability(page);
  issues.push({
    url: page.finalUrl,
    pageType: page.pageType,
    severity: source === "canonical_mismatch" ? "medium" : "critical",
    category: "indexability",
    code: "noindex_page",
    issue: "noindex_page",
    noindex_source: source,
    noindex_removable: source === "meta_robots",
    message: "Product or collection page is not indexable.",
    recommendation: noindexRecommendation(source),
    evidence: truncate(noindexEvidence(page, source, indexability.canonicalTarget), 240)
  });
}

function detectNoindexSource(page: CrawledPage): NoindexSource | undefined {
  const robots = parseRobotsDirectives(page.meta.robots);
  if (robots.noindex) return "meta_robots";

  const xRobots = parseRobotsDirectives(page.http?.xRobotsTag ?? "");
  if (xRobots.noindex) return "x_robots_tag";

  const indexability = summarizeIndexability(page);
  if (indexability.canonicalTarget && !indexability.canonicalSelfReferencing) return "canonical_mismatch";

  return undefined;
}

function noindexRecommendation(source: NoindexSource): string {
  if (source === "meta_robots") {
    return "Remove the meta robots noindex directive from this product or collection page if it should appear in Google Search.";
  }

  if (source === "x_robots_tag") {
    return "Remove the HTTP X-Robots-Tag noindex directive if this product or collection page should appear in Google Search.";
  }

  return "Use a self-referencing canonical for product and collection pages that should be indexed, or keep this canonical only when the page is intentionally consolidated.";
}

function noindexEvidence(page: CrawledPage, source: NoindexSource, canonicalTarget: string): string {
  if (source === "meta_robots") return page.meta.robots;
  if (source === "x_robots_tag") return page.http?.xRobotsTag ?? "";
  return `canonical=${canonicalTarget || page.meta.canonical || "missing"}`;
}

function isPrimaryProductOrCollectionUrl(url: string): boolean {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.length === 2 && (segments[0] === "products" || segments[0] === "collections");
  } catch {
    return false;
  }
}

function addCanonicalIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const canonical = validateMetadataCanonical(page.meta.canonical, page.finalUrl);
  if (canonical.isValid) return;

  issues.push(issue(
    page,
    "medium",
    "metadata_canonical_invalid",
    "Canonical URL is missing, malformed, or points to a different page.",
    "Use a valid self-referencing canonical for indexable pages, except intentional Shopify collection-product duplicate URLs.",
    `reason=${canonical.reason}; canonical=${canonical.target || page.meta.canonical || "missing"}; page=${page.finalUrl}`
  ));
}

function addOpenGraphIssues(page: CrawledPage, issues: SeoIssue[]): void {
  if (isMissingOrPlaceholderOgImage(page.meta, page.finalUrl)) {
    issues.push(issue(
      page,
      "medium",
      "metadata_og_image_missing_or_placeholder",
      "Open Graph image is missing or appears to be a placeholder.",
      "Use a real product, collection, article, or brand preview image for og:image.",
      page.meta.ogImage || "missing"
    ));
  }

  const priceMismatch = detectMetadataPriceMismatch(page.meta, page.textSample);
  if (priceMismatch.mismatch || page.metadataValidation.ogPriceMismatch) {
    issues.push(issue(
      page,
      "high",
      "metadata_price_mismatch",
      "Open Graph product price conflicts with visible page pricing.",
      "Keep OG price and visible product price in sync.",
      priceMismatch.evidence || "metadataValidation.ogPriceMismatch=true"
    ));
  }
}

function addLocalizationAndHygieneIssues(page: CrawledPage, issues: SeoIssue[]): void {
  if (!page.meta.htmlLang) {
    issues.push(issue(
      page,
      "low",
      "metadata_html_lang_missing",
      "HTML lang attribute is missing.",
      "Add a language value such as lang=\"en-IN\" to the html element.",
      "html lang missing"
    ));
  }

  if (!page.meta.charsetWithinFirst1024) {
    issues.push(issue(
      page,
      "low",
      "metadata_charset_missing_or_late",
      "UTF-8 charset declaration is missing or appears too late in the HTML head.",
      "Place <meta charset=\"utf-8\"> near the top of the head, ideally within the first 1024 bytes.",
      `charset=${page.meta.charset || "missing"}; withinFirst1024=${page.meta.charsetWithinFirst1024}`
    ));
  }

  if (!page.meta.viewport) {
    issues.push(issue(
      page,
      "low",
      "metadata_viewport_missing",
      "Viewport meta tag is missing.",
      "Add a responsive viewport meta tag such as width=device-width, initial-scale=1.",
      "viewport missing"
    ));
  } else if (/\buser-scalable\s*=\s*no\b/i.test(page.meta.viewport)) {
    issues.push(issue(
      page,
      "medium",
      "metadata_viewport_user_scalable_no",
      "Viewport disables user zoom.",
      "Remove user-scalable=no so mobile users can zoom and Lighthouse accessibility checks are not harmed.",
      page.meta.viewport
    ));
  }
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  code: string,
  message: string,
  recommendation: string,
  evidence = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category: "metadata",
    code,
    message,
    recommendation,
    evidence: truncate(evidence, 240)
  };
}
