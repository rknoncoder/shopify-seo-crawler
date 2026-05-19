import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { normalizeCanonicalTarget, sameNormalizedUrl } from "../utils/indexability.js";
import { truncate } from "../utils/textUtils.js";

const validTwitterCards = new Set(["summary", "summary_large_image", "app", "player"]);

export function auditSocialMetadata(page: CrawledPage): SeoIssue[] {
  if (page.status !== 200) return [];

  const issues: SeoIssue[] = [];
  const meta = page.meta;

  if (!meta.ogTitle) {
    issues.push(issue(page, "recommended", "og_title_missing", "Open Graph title is missing.", "Add og:title so shared links have a clear title."));
  } else if (meta.title && !textsOverlapEnough(meta.ogTitle, meta.title)) {
    issues.push(issue(
      page,
      "recommended",
      "og_title_mismatch",
      "Open Graph title differs substantially from the title tag.",
      "Keep og:title aligned with the page title unless a different social headline is intentional.",
      `title=${meta.title}; og:title=${meta.ogTitle}`
    ));
  }

  if (!meta.ogDescription) {
    issues.push(issue(page, "recommended", "og_description_missing", "Open Graph description is missing.", "Add og:description so shared links have useful preview text."));
  }

  if (!meta.ogImage) {
    issues.push(issue(page, "recommended", "og_image_missing", "Open Graph image is missing.", "Add og:image so shared links include a relevant preview image."));
  } else if (!isValidUrl(meta.ogImage, page.finalUrl)) {
    issues.push(issue(page, "medium", "og_image_invalid_url", "Open Graph image URL is invalid.", "Use a valid HTTP or HTTPS URL for og:image.", meta.ogImage));
  }

  if (meta.ogUrl && !sameNormalizedUrl(resolveUrl(meta.ogUrl, page.finalUrl), normalizeCanonicalTarget(meta.canonical, page.finalUrl) || page.finalUrl)) {
    issues.push(issue(
      page,
      "medium",
      "og_url_mismatch",
      "Open Graph URL does not match the canonical URL.",
      "Keep og:url aligned with the canonical URL to avoid conflicting social/share signals.",
      `canonical=${meta.canonical || page.finalUrl}; og:url=${meta.ogUrl}`
    ));
  }

  if (meta.ogImage && (!meta.ogImageWidth || !meta.ogImageHeight)) {
    issues.push(issue(
      page,
      "recommended",
      "og_image_dimensions_missing",
      "Open Graph image dimensions are missing.",
      "Add og:image:width and og:image:height where possible for more reliable social previews.",
      meta.ogImage
    ));
  }

  if (!meta.twitterCard) {
    issues.push(issue(page, "recommended", "twitter_card_missing", "Twitter card metadata is missing.", "Add twitter:card, usually summary_large_image for product and collection pages."));
  } else if (!validTwitterCards.has(meta.twitterCard.toLowerCase())) {
    issues.push(issue(page, "medium", "twitter_card_invalid", "Twitter card value is invalid.", "Use a valid twitter:card value such as summary or summary_large_image.", meta.twitterCard));
  }

  if (meta.twitterImage && !isValidUrl(meta.twitterImage, page.finalUrl)) {
    issues.push(issue(page, "medium", "twitter_image_invalid_url", "Twitter image URL is invalid.", "Use a valid HTTP or HTTPS URL for twitter:image.", meta.twitterImage));
  }

  if (meta.twitterTitle && meta.ogTitle && !textsOverlapEnough(meta.twitterTitle, meta.ogTitle)) {
    issues.push(issue(
      page,
      "recommended",
      "twitter_title_og_title_mismatch",
      "Twitter title and Open Graph title differ substantially.",
      "Keep social titles aligned unless channel-specific wording is intentional.",
      `twitter:title=${meta.twitterTitle}; og:title=${meta.ogTitle}`
    ));
  }

  return issues;
}

function isValidUrl(value: string, baseUrl: string): boolean {
  if (!/^(https?:)?\/\//i.test(value)) return false;

  try {
    const parsed = new URL(value, baseUrl);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function resolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function textsOverlapEnough(left: string, right: string): boolean {
  const leftWords = new Set(meaningfulWords(left));
  const rightWords = meaningfulWords(right);
  if (leftWords.size === 0 || rightWords.length === 0) return true;

  const overlap = rightWords.filter((word) => leftWords.has(word)).length;
  return overlap / rightWords.length >= 0.5;
}

function meaningfulWords(value: string): string[] {
  return value
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter((word) => word.length > 2);
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
    evidence: truncate(evidence, 220)
  };
}
