import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function detectDuplicates(pages: CrawledPage[]): SeoIssue[] {
  return [
    ...detectDuplicateField(pages, "title", (page) => page.meta.title, "duplicate_title"),
    ...detectDuplicateField(pages, "meta description", (page) => page.meta.description, "duplicate_meta_description"),
    ...detectDuplicateField(pages, "content hash", (page) => page.textHash, "duplicate_content")
  ];
}

function detectDuplicateField(
  pages: CrawledPage[],
  label: string,
  getter: (page: CrawledPage) => string,
  code: string
): SeoIssue[] {
  const groups = new Map<string, CrawledPage[]>();

  for (const page of pages) {
    const value = getter(page);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) || []), page]);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .flatMap(([value, group]) =>
      group.map((page) => ({
        url: page.finalUrl,
        pageType: page.pageType,
        severity: code === "duplicate_content" ? "high" as const : "medium" as const,
        category: code === "duplicate_content" ? "content" as const : "metadata" as const,
        code,
        message: `Duplicate ${label} found across ${group.length} pages.`,
        recommendation: `Make each page's ${label} unique and aligned with search intent.`,
        evidence: value
      }))
    );
}
