export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";

export type IssueCategory =
  | "technical"
  | "metadata"
  | "content"
  | "schema"
  | "shopify"
  | "faceted_navigation"
  | "internal_links"
  | "images";

export interface SeoIssue {
  url: string;
  pageType: string;
  severity: IssueSeverity;
  category: IssueCategory;
  code: string;
  message: string;
  recommendation: string;
  evidence?: string;
}
