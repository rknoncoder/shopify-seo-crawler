import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { auditBasicSeo } from "./basicSeoAudit.js";
import { auditBlog } from "./blogAudit.js";
import { auditCollection } from "./collectionAudit.js";
import { auditFacetedNavigation } from "./facetedNavigationAudit.js";
import { auditIndexability } from "./indexabilityAudit.js";
import { auditImageSeo } from "./imageSeoAudit.js";
import { auditLinkQuality } from "./linkQualityAudit.js";
import { auditPageSpeedSignals } from "./pageSpeedAudit.js";
import { auditSchema } from "./schemaAudit.js";
import { auditSerpSnippet } from "./serpSnippetAudit.js";
import { auditShopifyProduct } from "./shopifyProductAudit.js";
import { auditShopifyProductSeo } from "./shopifyProductSeoAudit.js";

export function runAudits(page: CrawledPage): SeoIssue[] {
  if (page.status >= 400) {
    return auditBasicSeo(page);
  }

  return [
    ...auditBasicSeo(page),
    ...auditSerpSnippet(page),
    ...auditIndexability(page),
    ...auditPageSpeedSignals(page),
    ...auditSchema(page),
    ...auditImageSeo(page),
    ...auditShopifyProduct(page),
    ...auditShopifyProductSeo(page),
    ...auditCollection(page),
    ...auditBlog(page),
    ...auditFacetedNavigation(page),
    ...auditLinkQuality(page)
  ];
}
