import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { auditBasicSeo } from "./basicSeoAudit.js";
import { auditBlog } from "./blogAudit.js";
import { auditCollection } from "./collectionAudit.js";
import { auditFacetedNavigation } from "./facetedNavigationAudit.js";
import { auditSchema } from "./schemaAudit.js";
import { auditShopifyProduct } from "./shopifyProductAudit.js";

export function runAudits(page: CrawledPage): SeoIssue[] {
  return [
    ...auditBasicSeo(page),
    ...auditSchema(page),
    ...auditShopifyProduct(page),
    ...auditCollection(page),
    ...auditBlog(page),
    ...auditFacetedNavigation(page)
  ];
}
