export type IssueSeverity = "critical" | "high" | "medium" | "low" | "recommended" | "info";

export type IssueCategory =
  | "technical"
  | "redirects"
  | "metadata"
  | "content"
  | "content_cannibalization"
  | "schema"
  | "shopify"
  | "indexability"
  | "serp_snippet"
  | "page_speed"
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
