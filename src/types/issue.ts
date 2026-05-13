export type IssueSeverity = "critical" | "high" | "medium" | "low" | "recommended" | "info";

export type IssueCategory =
  | "technical"
  | "metadata"
  | "content"
  | "schema"
  | "shopify"
  | "indexability"
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
