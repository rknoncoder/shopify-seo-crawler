import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function auditBlog(page: CrawledPage): SeoIssue[] {
  if (page.pageType !== "blog" && page.pageType !== "article") return [];

  const issues: SeoIssue[] = [];

  if (page.pageType === "article" && page.wordCount < 500) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "medium",
      category: "content",
      code: "thin_article",
      message: "Article content is short.",
      recommendation: "Expand the article with original guidance, examples, images, and internal links."
    });
  }

  if (page.pageType === "article" && !page.links.some((link) => link.internal && link.href !== page.finalUrl)) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "low",
      category: "internal_links",
      code: "article_no_internal_links",
      message: "Article has no internal links.",
      recommendation: "Link to relevant products, collections, and related articles."
    });
  }

  return issues;
}
