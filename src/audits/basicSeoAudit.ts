import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { classifyHttpFetchFailure } from "../utils/fetchFailureClassifier.js";
import { truncate } from "../utils/textUtils.js";

export function auditBasicSeo(page: CrawledPage): SeoIssue[] {
  const issues: SeoIssue[] = [];
  addStatusIssues(page, issues);
  if (page.status >= 400) return issues;

  addTitleIssues(page, issues);
  addDescriptionIssues(page, issues);
  addCanonicalIssues(page, issues);
  addHeadingIssues(page, issues);
  addImageIssues(page, issues);
  return issues;
}

function addStatusIssues(page: CrawledPage, issues: SeoIssue[]): void {
  if (page.status >= 400) {
    const fetchIssue = classifyHttpFetchFailure(page.status);
    if (!fetchIssue) return;
    issues.push(issue(
      page,
      fetchIssue.severity,
      "technical",
      fetchIssue.code,
      fetchIssue.message,
      fetchIssue.recommendation,
      fetchIssue.evidence
    ));
  }
}

function addTitleIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const title = page.meta.title;
  if (!title) {
    issues.push(issue(page, "high", "metadata", "missing_title", "Missing title tag", "Add a unique title tag."));
  } else if (title.length < 25 || title.length > 65) {
    issues.push(issue(page, "medium", "metadata", "title_length", "Title length is outside the ideal range.", "Keep titles roughly 25 to 65 characters.", title));
  }
}

function addDescriptionIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const description = page.meta.description;
  if (!description) {
    issues.push(issue(page, "high", "metadata", "missing_meta_description", "Missing meta description", "Add a compelling unique meta description."));
  } else if (description.length < 70 || description.length > 160) {
    issues.push(issue(page, "low", "metadata", "meta_description_length", "Meta description length is outside the ideal range.", "Keep descriptions roughly 70 to 160 characters.", description));
  }
}

function addCanonicalIssues(page: CrawledPage, issues: SeoIssue[]): void {
  if (!page.meta.canonical) {
    issues.push(issue(page, "medium", "technical", "missing_canonical", "Missing canonical URL", "Add a self-referencing canonical or canonical target."));
  }
}

function addHeadingIssues(page: CrawledPage, issues: SeoIssue[]): void {
  if (page.headings.h1.length === 0) {
    issues.push(issue(page, "medium", "content", "missing_h1", "Missing H1", "Add one clear H1 that describes the page."));
  } else if (page.headings.h1.length > 1) {
    issues.push(issue(page, "low", "content", "multiple_h1", "Multiple H1 headings found", "Use one primary H1 per page.", page.headings.h1.join(" | ")));
  }
}

function addImageIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const missingAlt = page.images.filter((image) => !image.alt && shouldRequireAlt(image.src)).length;
  if (missingAlt > 0) {
    issues.push(issue(page, "low", "images", "missing_image_alt", `${missingAlt} images are missing alt text`, "Add descriptive alt text for meaningful images."));
  }
}

function shouldRequireAlt(src: string): boolean {
  const lowerSrc = src.toLowerCase();
  const filename = getFilename(lowerSrc);

  if (lowerSrc.startsWith("data:")) return false;
  if (lowerSrc.includes("logo") || filename.includes("logo")) return false;
  if (lowerSrc.includes("icon") || filename.includes("icon")) return false;
  if (lowerSrc.includes("payment") || filename.includes("payment")) return false;
  if (lowerSrc.includes("placeholder") || filename.includes("placeholder")) return false;
  if (lowerSrc.includes("sprite") || filename.includes("sprite")) return false;
  if (lowerSrc.includes("/preview_images/") || filename.includes("thumbnail")) return false;
  if (filename.endsWith(".svg")) return false;

  return true;
}

function getFilename(src: string): string {
  try {
    return decodeURIComponent(new URL(src).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return src.split("/").filter(Boolean).pop() || src;
  }
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  category: SeoIssue["category"],
  code: string,
  message: string,
  recommendation: string,
  evidence = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category,
    code,
    message,
    recommendation,
    evidence: truncate(evidence)
  };
}
