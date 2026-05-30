export type IssueSeverity = "critical" | "high" | "medium" | "low" | "recommended" | "info";

export type IssueCategory =
  | "technical"
  | "redirects"
  | "metadata"
  | "content"
  | "content_cannibalization"
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
  issue?: string;
  handle?: string;
  noindex_source?: "meta_robots" | "x_robots_tag" | "canonical_mismatch";
  noindex_removable?: boolean;
  message: string;
  recommendation: string;
  evidence?: string;
  inbound_sources?: string[];
  reachable_via?: string;
}
