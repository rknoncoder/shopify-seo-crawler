import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage, ImageInfo } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

const genericAltPatterns = [
  /^image$/i,
  /^photo$/i,
  /^picture$/i,
  /^product$/i,
  /^product image$/i,
  /^untitled$/i,
  /^logo$/i,
  /^banner$/i,
  /^img[_\-\s]?\d*$/i
];

const genericFilenamePatterns = [
  /^image[-_\d]*\.(?:jpe?g|png|webp|gif)$/i,
  /^img[-_\d]*\.(?:jpe?g|png|webp|gif)$/i,
  /^photo[-_\d]*\.(?:jpe?g|png|webp|gif)$/i,
  /^main[-_\d]*\.(?:jpe?g|png|webp|gif)$/i,
  /^\d+\.(?:jpe?g|png|webp|gif)$/i
];

export function auditImageSeo(page: CrawledPage): SeoIssue[] {
  if (page.images.length === 0) return [];

  const issues: SeoIssue[] = [];
  const imagesWithAlt = page.images.filter((image) => image.alt);
  const meaningfulPageWords = new Set(meaningfulWords(page.headings.h1[0] || page.meta.title));

  addAltLengthIssues(page, issues, imagesWithAlt);
  addGenericAltIssues(page, issues, imagesWithAlt);
  addDuplicateAltIssues(page, issues, imagesWithAlt);
  addProductAltContextIssues(page, issues, imagesWithAlt, meaningfulPageWords);
  addFilenameIssues(page, issues);
  addDimensionIssues(page, issues);
  addLazyLoadingIssues(page, issues);

  return issues;
}

function addAltLengthIssues(page: CrawledPage, issues: SeoIssue[], images: ImageInfo[]): void {
  const tooShort = images.filter((image) => meaningfulWords(image.alt).length < 2);
  if (tooShort.length > 0) {
    issues.push(issue(
      page,
      "recommended",
      "image_alt_too_short",
      `${tooShort.length} image alt texts are very short.`,
      "Use concise but descriptive alt text that identifies the product, category, color, or context.",
      sampleImages(tooShort, "alt")
    ));
  }

  const tooLong = images.filter((image) => image.alt.length > 125);
  if (tooLong.length > 0) {
    issues.push(issue(
      page,
      "recommended",
      "image_alt_too_long",
      `${tooLong.length} image alt texts are too long.`,
      "Keep alt text descriptive and concise, usually under 125 characters.",
      sampleImages(tooLong, "alt")
    ));
  }
}

function addGenericAltIssues(page: CrawledPage, issues: SeoIssue[], images: ImageInfo[]): void {
  const generic = images.filter((image) => genericAltPatterns.some((pattern) => pattern.test(image.alt)));
  if (generic.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "image_alt_generic",
    `${generic.length} image alt texts are generic.`,
    "Replace generic alt text with specific descriptions of the product, collection, or image purpose.",
    sampleImages(generic, "alt")
  ));
}

function addDuplicateAltIssues(page: CrawledPage, issues: SeoIssue[], images: ImageInfo[]): void {
  const groups = new Map<string, { alt: string; images: ImageInfo[] }>();
  for (const image of images) {
    const normalized = normalizeText(image.alt);
    const group = groups.get(normalized) || { alt: image.alt, images: [] };
    group.images.push(image);
    groups.set(normalized, group);
  }

  const duplicates = [...groups.entries()].filter(([, group]) => group.images.length > 1);
  if (duplicates.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "image_alt_duplicate_on_page",
    `${duplicates.length} duplicate image alt text value(s) found on the page.`,
    "Use unique alt text when images show different angles, variants, colors, or details.",
    duplicates.slice(0, 5).map(([, group]) => `${normalizeText(group.alt)} (${group.images.length})`).join(" | ")
  ));

  const shopifyFallbackGroups = duplicates
    .map(([, group]) => group)
    .filter((group) => isLikelyShopifyVariantFallbackAlt(page, group.alt, group.images));
  if (shopifyFallbackGroups.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "shopify_variant_auto_alt_duplicate",
    "Duplicate image alt text appears to be Shopify's automatic product-title fallback on variant/media images.",
    "If the images show different variants, colors, angles, or product details, customize media alt text so each important image is unique. If duplicates are hidden theme clones, consider reducing duplicated media markup.",
    shopifyFallbackGroups.slice(0, 5).map((group) => `alt="${group.alt}" repeated ${group.images.length} times`).join(" | ")
  ));
}

function addProductAltContextIssues(page: CrawledPage, issues: SeoIssue[], images: ImageInfo[], pageWords: Set<string>): void {
  if (page.pageType !== "product" || pageWords.size === 0) return;

  const productImages = images.filter((image) => isLikelyProductImage(image));
  const missingContext = productImages.filter((image) => {
    const altWords = new Set(meaningfulWords(image.alt));
    return [...pageWords].filter((word) => altWords.has(word)).length === 0;
  });

  if (missingContext.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "product_image_alt_missing_product_name",
    `${missingContext.length} product image alt texts may not mention the product context.`,
    "Include the product type, color, or product name in important product image alt text.",
    sampleImages(missingContext, "alt")
  ));
}

function addFilenameIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const weakFilenames = page.images.filter((image) => genericFilenamePatterns.some((pattern) => pattern.test(getFilename(image.src))));
  if (weakFilenames.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "image_filename_not_descriptive",
    `${weakFilenames.length} image filenames are generic.`,
    "Use descriptive image filenames before upload when practical, such as product-type-color-view.webp.",
    sampleImages(weakFilenames, "filename")
  ));
}

function addDimensionIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const missingDimensions = page.images.filter((image) => !image.width || !image.height);
  if (missingDimensions.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "image_missing_dimensions",
    `${missingDimensions.length} images are missing width or height attributes.`,
    "Add width and height attributes to reduce layout shift and improve rendering stability.",
    sampleImages(missingDimensions, "src")
  ));
}

function addLazyLoadingIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const eligibleImages = page.images.filter(isLazyLoadingEligibleImage);
  if (eligibleImages.length <= 1) return;

  const nonLazyAfterPrimary = eligibleImages
    .filter((image) => !isPriorityImage(image))
    .slice(1)
    .filter((image) => !image.lazy);

  if (nonLazyAfterPrimary.length === 0) return;

  issues.push(issue(
    page,
    "recommended",
    "lazy_loading_missing",
    `${nonLazyAfterPrimary.length} non-primary images may be missing lazy loading.`,
    "Lazy-load below-the-fold images while keeping primary hero/product images eager.",
    sampleImages(nonLazyAfterPrimary, "src")
  ));
}

function isLikelyProductImage(image: ImageInfo): boolean {
  const source = `${image.src} ${image.rawSrc}`.toLowerCase();
  return source.includes("/products/") || source.includes("/cdn/shop/files/") || source.includes("/cdn/shop/products/");
}

function isLazyLoadingEligibleImage(image: ImageInfo): boolean {
  const source = `${image.src} ${image.rawSrc}`.toLowerCase();
  const filename = getFilename(image.src).toLowerCase();

  if (source.startsWith("data:")) return false;
  if (source.includes("logo") || filename.includes("logo")) return false;
  if (source.includes("icon") || filename.includes("icon")) return false;
  if (source.includes("payment") || filename.includes("payment")) return false;
  if (source.includes("placeholder") || filename.includes("placeholder")) return false;
  if (source.includes("/preview_images/") || filename.includes("thumbnail")) return false;
  if (source.includes("sprite") || filename.includes("sprite")) return false;
  if (filename.endsWith(".svg")) return false;

  return source.includes("/cdn/shop/files/") || source.includes("/cdn/shop/products/");
}

function isPriorityImage(image: ImageInfo): boolean {
  return image.fetchPriority?.toLowerCase() === "high";
}

function isLikelyShopifyVariantFallbackAlt(page: CrawledPage, alt: string, images: ImageInfo[]): boolean {
  if (page.pageType !== "product") return false;

  const productImages = images.filter(isLikelyProductImage);
  if (productImages.length < 3) return false;

  const pageWords = meaningfulWords(page.headings.h1[0] || page.meta.title);
  const altWords = new Set(meaningfulWords(alt));
  if (pageWords.length < 2 || altWords.size < 2) return false;

  const overlap = pageWords.filter((word) => altWords.has(word)).length / pageWords.length;
  return overlap >= 0.7;
}

function sampleImages(images: ImageInfo[], field: "alt" | "filename" | "src"): string {
  return images.slice(0, 5).map((image) => {
    if (field === "alt") return image.alt;
    if (field === "filename") return getFilename(image.src);
    return image.src;
  }).join(" | ");
}

function getFilename(src: string): string {
  try {
    return decodeURIComponent(new URL(src).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return src.split("/").filter(Boolean).pop() || src;
  }
}

function meaningfulWords(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length > 2 && !["the", "and", "for", "with", "men", "mens", "tripr"].includes(word));
}

function normalizeText(value: string): string {
  return value
    .replace(/&amp;/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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
    category: "images",
    code,
    message,
    recommendation,
    evidence: truncate(evidence, 240)
  };
}
