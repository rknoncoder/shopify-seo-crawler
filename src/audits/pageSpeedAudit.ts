import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

export function auditPageSpeedSignals(page: CrawledPage): SeoIssue[] {
  const speed = page.speed;
  const issues: SeoIssue[] = [];

  if (speed.htmlSizeKb > 1000) {
    issues.push(issue(page, "medium", "html_size_large", "HTML document is very large.", "Reduce duplicated HTML, app embeds, inline JSON, and unnecessary rendered content.", `htmlSizeKb=${speed.htmlSizeKb}`));
  } else if (speed.htmlSizeKb > 500) {
    issues.push(issue(page, "recommended", "html_size_large", "HTML document is large.", "Review theme/app output and reduce unnecessary HTML where practical.", `htmlSizeKb=${speed.htmlSizeKb}`));
  }

  if (speed.domElementCount > 3000) {
    issues.push(issue(page, "medium", "dom_size_large", "Page has a large DOM size.", "Reduce repeated product cards, hidden drawers, duplicate media markup, and app-injected elements.", `domElements=${speed.domElementCount}`));
  } else if (speed.domElementCount > 1500) {
    issues.push(issue(page, "recommended", "dom_size_large", "Page DOM is moderately large.", "Review repeated theme sections and app blocks.", `domElements=${speed.domElementCount}`));
  }

  if (speed.scriptCount > 60) {
    issues.push(issue(page, "medium", "script_count_high", "Page loads many script tags.", "Remove unused theme/app scripts and defer non-critical JavaScript.", `scripts=${speed.scriptCount}; externalScripts=${speed.externalScriptCount}`));
  } else if (speed.scriptCount > 35) {
    issues.push(issue(page, "recommended", "script_count_high", "Page has a high script count.", "Review app/theme JavaScript and defer non-critical scripts.", `scripts=${speed.scriptCount}; externalScripts=${speed.externalScriptCount}`));
  }

  if (speed.stylesheetCount > 15) {
    issues.push(issue(page, "recommended", "stylesheet_count_high", "Page loads many stylesheets.", "Consolidate theme CSS and remove unused app styles where practical.", `stylesheets=${speed.stylesheetCount}`));
  }

  if (speed.renderBlockingStylesheetCount > 10) {
    issues.push(issue(page, "recommended", "render_blocking_stylesheets", "Page has many render-blocking stylesheets.", "Inline critical CSS and defer or consolidate non-critical stylesheets.", `renderBlockingStylesheets=${speed.renderBlockingStylesheetCount}`));
  }

  if (speed.thirdPartyScriptCount > 12) {
    issues.push(issue(page, "medium", "third_party_script_count_high", "Page loads many third-party script hosts.", "Review analytics, marketing, chat, review, and app scripts for performance impact.", `hosts=${speed.thirdPartyScriptHosts.join("|")}`));
  } else if (speed.thirdPartyScriptCount > 6) {
    issues.push(issue(page, "recommended", "third_party_script_count_high", "Page has several third-party script hosts.", "Audit third-party scripts and remove apps that are not needed.", `hosts=${speed.thirdPartyScriptHosts.join("|")}`));
  }

  if (speed.shopifyAppScriptCount > 8) {
    issues.push(issue(page, "medium", "shopify_app_script_count_high", "Page appears to load many Shopify app scripts.", "Review installed apps and remove or disable unused storefront scripts.", `hosts=${speed.shopifyAppScriptHosts.join("|")}`));
  } else if (speed.shopifyAppScriptCount > 4) {
    issues.push(issue(page, "recommended", "shopify_app_script_count_high", "Page appears to load several Shopify app scripts.", "Review app storefront scripts and keep only those needed.", `hosts=${speed.shopifyAppScriptHosts.join("|")}`));
  }

  if (speed.imageCount > 80) {
    issues.push(issue(page, "medium", "image_count_high", "Page contains many image tags.", "Reduce duplicate media markup, lazy-load non-primary images, and avoid rendering hidden images unnecessarily.", `images=${speed.imageCount}`));
  } else if (speed.imageCount > 40) {
    issues.push(issue(page, "recommended", "image_count_high", "Page contains a high number of image tags.", "Review product galleries, collection cards, and hidden media blocks.", `images=${speed.imageCount}`));
  }

  if (speed.largeImageUrlCount > 6) {
    issues.push(issue(page, "recommended", "large_image_url_width", "Page references many large Shopify image URLs.", "Serve appropriately sized responsive images and avoid loading large width variants below the fold.", `largeImageUrls=${speed.largeImageUrlCount}`));
  }

  if (["home", "product", "collection"].includes(page.pageType) && speed.primaryImageLazy) {
    issues.push(issue(page, "medium", "primary_image_lazy_loaded", "Primary image appears to be lazy-loaded.", "Load the primary hero/product image eagerly for better LCP.", `primaryImageLazy=${speed.primaryImageLazy}`));
  }

  if (["home", "product", "collection"].includes(page.pageType) && !speed.primaryImageLazy && speed.primaryImageFetchPriority !== "high" && speed.preloadedImageCount === 0) {
    issues.push(issue(page, "recommended", "preload_missing_for_primary_image", "Primary image may not be prioritized.", "Use fetchpriority=\"high\" or preload for the primary hero/product image when appropriate.", `fetchpriority=${speed.primaryImageFetchPriority || "missing"}; preloadedImages=${speed.preloadedImageCount}`));
  }

  return issues;
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  code: string,
  message: string,
  recommendation: string,
  evidence = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category: "page_speed",
    code,
    message,
    recommendation,
    evidence: truncate(evidence, 260)
  };
}
