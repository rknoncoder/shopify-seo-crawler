import { findContentCannibalizationGroups } from "../analyzer/contentCannibalizationAnalyzer.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

export interface ContentCannibalizationReportRow {
  groupId: string;
  severity: string;
  issueCode: string;
  variantClassification: string;
  variantConfidence: string;
  variantSignals: string;
  variantAttributes: string;
  intentKey: string;
  signals: string;
  pageCount: number;
  pageTypes: string;
  primaryUrl: string;
  primaryInboundInternalLinks: number;
  competingUrls: string;
  sampleTitles: string;
  sharedTitle: string;
  sharedMetaDescription: string;
  sharedContentHash: string;
  recommendation: string;
}

export function buildContentCannibalizationReport(pages: CrawledPage[]): ContentCannibalizationReportRow[] {
  return findContentCannibalizationGroups(pages).map((group) => ({
    groupId: group.groupId,
    severity: group.severity,
    issueCode: group.issueCode,
    variantClassification: group.variantClassification,
    variantConfidence: group.variantConfidence,
    variantSignals: group.variantSignals.join("|"),
    variantAttributes: group.variantAttributes.join("|"),
    intentKey: group.intentKey,
    signals: group.signals.join("|"),
    pageCount: group.pages.length,
    pageTypes: group.pageTypes.join("|"),
    primaryUrl: group.primaryUrl,
    primaryInboundInternalLinks: group.primaryInboundInternalLinks,
    competingUrls: group.competingUrls.join("|"),
    sampleTitles: [...new Set(group.pages.map((page) => page.meta.title).filter(Boolean))].slice(0, 5).map((title) => truncate(title, 90)).join("|"),
    sharedTitle: group.sharedTitle,
    sharedMetaDescription: group.sharedMetaDescription,
    sharedContentHash: group.sharedContentHash,
    recommendation: group.recommendation
  }));
}
