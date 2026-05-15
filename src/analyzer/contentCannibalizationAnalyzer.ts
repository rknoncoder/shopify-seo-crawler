import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { summarizeIndexability } from "../utils/indexability.js";
import { cleanText, truncate } from "../utils/textUtils.js";

export interface CannibalizationGroup {
  groupId: string;
  severity: SeoIssue["severity"];
  issueCode: string;
  variantClassification: VariantClassification;
  variantConfidence: VariantConfidence;
  variantSignals: string[];
  variantAttributes: string[];
  intentKey: string;
  signals: string[];
  pages: CrawledPage[];
  primaryUrl: string;
  competingUrls: string[];
  pageTypes: string[];
  sharedTitle: string;
  sharedMetaDescription: string;
  sharedContentHash: string;
  primaryInboundInternalLinks: number;
  recommendation: string;
}

interface CandidateGroup {
  pages: CrawledPage[];
  signal: CannibalizationSignal;
  intentKey: string;
  evidenceValue: string;
}

interface MutableGroup {
  pages: CrawledPage[];
  signals: Set<CannibalizationSignal>;
  intentKeys: Set<string>;
  titles: Set<string>;
  descriptions: Set<string>;
  contentHashes: Set<string>;
}

type CannibalizationSignal =
  | "duplicate_content"
  | "duplicate_title"
  | "duplicate_meta_description"
  | "shared_keyword_intent";

type VariantClassification = "true_cannibalization" | "variant_serp_risk" | "variant_cluster";
type VariantConfidence = "none" | "low" | "medium" | "high";

interface VariantAssessment {
  classification: VariantClassification;
  confidence: VariantConfidence;
  signals: string[];
  attributes: string[];
}

interface VariantDetails {
  signals: string[];
  attributes: string[];
}

const issuePriority: Record<string, number> = {
  content_cannibalization_duplicate_content: 1,
  content_cannibalization_serp_duplicate: 2,
  content_cannibalization_collection_product_overlap: 3,
  content_cannibalization_duplicate_title: 4,
  content_cannibalization_duplicate_description: 5,
  content_cannibalization_variant_serp_risk: 6,
  content_cannibalization_keyword_overlap: 7,
  content_cannibalization_variant_cluster: 8
};

const stopWords = new Set([
  "a",
  "about",
  "all",
  "an",
  "and",
  "are",
  "at",
  "best",
  "buy",
  "clearance",
  "discount",
  "for",
  "from",
  "in",
  "india",
  "just",
  "lowest",
  "men",
  "mens",
  "of",
  "off",
  "offer",
  "offers",
  "on",
  "online",
  "pack",
  "price",
  "prices",
  "rs",
  "sale",
  "shop",
  "shopping",
  "the",
  "to",
  "tripr",
  "under",
  "with"
]);

const colorAndVariantWords = new Set([
  "beige",
  "black",
  "blue",
  "brown",
  "dark",
  "gray",
  "green",
  "grey",
  "light",
  "maroon",
  "multi",
  "multicolor",
  "navy",
  "olive",
  "orange",
  "pink",
  "purple",
  "red",
  "white",
  "yellow"
]);

const variantColorWords = new Set([
  ...colorAndVariantWords,
  "charcoal",
  "navyblue",
  "olivegreen"
]);

export function detectContentCannibalizationIssues(pages: CrawledPage[]): SeoIssue[] {
  return findContentCannibalizationGroups(pages).map((group) => ({
    url: group.primaryUrl,
    pageType: group.pageTypes.join("|"),
    severity: group.severity,
    category: "content_cannibalization",
    code: group.issueCode,
    message: messageForGroup(group),
    recommendation: group.recommendation,
    evidence: truncate(`group=${group.groupId}; variant=${group.variantClassification}; variantSignals=${group.variantSignals.join("|")}; signals=${group.signals.join("|")}; pages=${group.pages.length}; intent=${group.intentKey}; competing=${group.competingUrls.slice(0, 5).join(" | ")}`, 360)
  }));
}

export function findContentCannibalizationGroups(pages: CrawledPage[]): CannibalizationGroup[] {
  const indexablePages = pages.filter((page) => summarizeIndexability(page).indexable);
  const inboundCounts = buildInboundCounts(pages);
  const candidates = buildCandidates(indexablePages);
  const groups = mergeCandidates(candidates);

  return [...groups.values()]
    .map((group) => finalizeGroup(group, inboundCounts))
    .sort((left, right) =>
      issuePriority[left.issueCode] - issuePriority[right.issueCode] ||
      right.pages.length - left.pages.length ||
      left.intentKey.localeCompare(right.intentKey)
    )
    .map((group, index) => ({
      ...group,
      groupId: `CAN-${String(index + 1).padStart(4, "0")}`
    }));
}

function buildCandidates(pages: CrawledPage[]): CandidateGroup[] {
  const candidates: CandidateGroup[] = [];

  addExactCandidates(candidates, pages, "duplicate_title", (page) => normalizeExact(page.meta.title), 12);
  addExactCandidates(candidates, pages, "duplicate_meta_description", (page) => normalizeExact(page.meta.description), 35);
  addExactCandidates(candidates, pages, "duplicate_content", (page) => page.textHash, 10);
  addIntentCandidates(candidates, pages);

  return candidates;
}

function addExactCandidates(
  candidates: CandidateGroup[],
  pages: CrawledPage[],
  signal: CannibalizationSignal,
  getter: (page: CrawledPage) => string,
  minLength: number
): void {
  const groups = new Map<string, CrawledPage[]>();

  for (const page of pages) {
    const key = getter(page);
    if (key.length < minLength) continue;
    groups.set(key, [...(groups.get(key) || []), page]);
  }

  for (const [key, groupPages] of groups.entries()) {
    if (groupPages.length < 2) continue;
    candidates.push({
      pages: groupPages,
      signal,
      intentKey: buildIntentKeyFromPages(groupPages) || truncate(key, 90),
      evidenceValue: key
    });
  }
}

function addIntentCandidates(candidates: CandidateGroup[], pages: CrawledPage[]): void {
  const groups = new Map<string, CrawledPage[]>();

  for (const page of pages) {
    const key = buildIntentKey(page);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), page]);
  }

  for (const [key, groupPages] of groups.entries()) {
    if (groupPages.length < 2 || groupPages.length > 50) continue;

    const pageTypes = new Set(groupPages.map((page) => page.pageType));
    const tokenCount = key.split(" ").length;
    if (tokenCount < 3 && pageTypes.size < 2) continue;

    candidates.push({
      pages: groupPages,
      signal: "shared_keyword_intent",
      intentKey: key,
      evidenceValue: key
    });
  }
}

function mergeCandidates(candidates: CandidateGroup[]): Map<string, MutableGroup> {
  const groups = new Map<string, MutableGroup>();

  for (const candidate of candidates) {
    const key = candidate.pages.map((page) => page.finalUrl).sort().join("|");
    const current = groups.get(key) || {
      pages: candidate.pages,
      signals: new Set<CannibalizationSignal>(),
      intentKeys: new Set<string>(),
      titles: new Set<string>(),
      descriptions: new Set<string>(),
      contentHashes: new Set<string>()
    };

    current.signals.add(candidate.signal);
    if (candidate.intentKey) current.intentKeys.add(candidate.intentKey);
    if (candidate.signal === "duplicate_title") current.titles.add(candidate.evidenceValue);
    if (candidate.signal === "duplicate_meta_description") current.descriptions.add(candidate.evidenceValue);
    if (candidate.signal === "duplicate_content") current.contentHashes.add(candidate.evidenceValue);
    groups.set(key, current);
  }

  return groups;
}

function finalizeGroup(group: MutableGroup, inboundCounts: Map<string, number>): CannibalizationGroup {
  const signals = [...group.signals];
  const pageTypes = [...new Set(group.pages.map((page) => page.pageType))].sort();
  const variantAssessment = assessVariantGroup(group.pages, signals, pageTypes);
  const issueCode = issueCodeForGroup(signals, pageTypes, variantAssessment);
  const primary = pickPrimaryPage(group.pages, inboundCounts);
  const severity = severityForIssueCode(issueCode);

  return {
    groupId: "",
    severity,
    issueCode,
    variantClassification: variantAssessment.classification,
    variantConfidence: variantAssessment.confidence,
    variantSignals: variantAssessment.signals,
    variantAttributes: variantAssessment.attributes,
    intentKey: [...group.intentKeys][0] || buildIntentKeyFromPages(group.pages),
    signals,
    pages: group.pages,
    primaryUrl: primary.finalUrl,
    competingUrls: group.pages.filter((page) => page.finalUrl !== primary.finalUrl).map((page) => page.finalUrl),
    pageTypes,
    sharedTitle: [...group.titles][0] || "",
    sharedMetaDescription: truncate([...group.descriptions][0] || "", 260),
    sharedContentHash: [...group.contentHashes][0] || "",
    primaryInboundInternalLinks: inboundCounts.get(primary.finalUrl) || 0,
    recommendation: recommendationForIssueCode(issueCode)
  };
}

function issueCodeForGroup(signals: string[], pageTypes: string[], variantAssessment: VariantAssessment): string {
  if (variantAssessment.classification === "variant_serp_risk") return "content_cannibalization_variant_serp_risk";
  if (variantAssessment.classification === "variant_cluster") return "content_cannibalization_variant_cluster";
  if (signals.includes("duplicate_content")) return "content_cannibalization_duplicate_content";
  if (signals.includes("duplicate_title") && signals.includes("duplicate_meta_description")) return "content_cannibalization_serp_duplicate";
  if (pageTypes.includes("collection") && pageTypes.includes("product")) return "content_cannibalization_collection_product_overlap";
  if (signals.includes("duplicate_title")) return "content_cannibalization_duplicate_title";
  if (signals.includes("duplicate_meta_description")) return "content_cannibalization_duplicate_description";
  return "content_cannibalization_keyword_overlap";
}

function severityForIssueCode(issueCode: string): SeoIssue["severity"] {
  if (issueCode === "content_cannibalization_duplicate_content" || issueCode === "content_cannibalization_serp_duplicate") return "high";
  if (issueCode === "content_cannibalization_variant_serp_risk") return "medium";
  if (issueCode === "content_cannibalization_collection_product_overlap") return "medium";
  if (issueCode === "content_cannibalization_variant_cluster") return "info";
  if (issueCode === "content_cannibalization_keyword_overlap") return "recommended";
  return "medium";
}

function messageForGroup(group: CannibalizationGroup): string {
  if (group.issueCode === "content_cannibalization_variant_serp_risk") {
    return `Variant SERP risk: ${group.pages.length} product variant pages share overly similar content or SERP metadata.`;
  }

  if (group.issueCode === "content_cannibalization_variant_cluster") {
    return `Variant cluster detected: ${group.pages.length} product pages appear to be intentional variants of the same product family.`;
  }

  if (group.issueCode === "content_cannibalization_duplicate_content") {
    return `Potential content cannibalization: ${group.pages.length} indexable pages have duplicate content.`;
  }

  if (group.issueCode === "content_cannibalization_serp_duplicate") {
    return `Potential content cannibalization: ${group.pages.length} indexable pages share the same title and meta description.`;
  }

  if (group.issueCode === "content_cannibalization_collection_product_overlap") {
    return `Potential content cannibalization: collection and product pages target the same search intent.`;
  }

  if (group.issueCode === "content_cannibalization_duplicate_title") {
    return `Potential content cannibalization: ${group.pages.length} indexable pages share the same title.`;
  }

  if (group.issueCode === "content_cannibalization_duplicate_description") {
    return `Potential content cannibalization: ${group.pages.length} indexable pages share the same meta description.`;
  }

  return `Potential content cannibalization: ${group.pages.length} indexable pages appear to target the same keyword intent.`;
}

function recommendationForIssueCode(issueCode: string): string {
  if (issueCode === "content_cannibalization_variant_serp_risk") {
    return "Keep the variant pages only if they serve distinct demand; otherwise consolidate, canonicalize, or rewrite variant titles, meta descriptions, and body copy with clear color, pack, design, or use-case differences.";
  }

  if (issueCode === "content_cannibalization_variant_cluster") {
    return "Review as a Shopify variant cluster. If each URL should rank separately, keep unique titles, meta descriptions, content, images, and internal links; otherwise consolidate or canonicalize weaker variants.";
  }

  if (issueCode === "content_cannibalization_collection_product_overlap") {
    return "Choose the preferred ranking page for the query, then adjust product titles/copy or collection copy/internal links so each page targets a distinct intent.";
  }

  if (issueCode === "content_cannibalization_duplicate_content") {
    return "Consolidate near-identical pages, add unique content, or canonicalize/noindex weaker variants when they should not rank separately.";
  }

  if (issueCode === "content_cannibalization_serp_duplicate") {
    return "Rewrite titles and meta descriptions so each indexable page targets a unique query, product variant, or buying intent.";
  }

  return "Choose a primary URL for the shared intent, strengthen its internal links, and rewrite competing pages for more specific long-tail intent.";
}

function assessVariantGroup(pages: CrawledPage[], signals: string[], pageTypes: string[]): VariantAssessment {
  if (pageTypes.length !== 1 || pageTypes[0] !== "product" || pages.length < 2) {
    return emptyVariantAssessment();
  }

  const details = pages.map(extractVariantDetails);
  const variantPages = details.filter((detail) => detail.attributes.length > 0).length;
  const variantRatio = variantPages / pages.length;
  const variantSignals = [...new Set(details.flatMap((detail) => detail.signals))].sort();
  const variantAttributes = [...new Set(details.flatMap((detail) => detail.attributes))].sort();

  if (variantRatio < 0.55 || variantSignals.length === 0) {
    return emptyVariantAssessment();
  }

  const confidence: VariantConfidence = variantRatio >= 0.85 && variantSignals.length >= 2
    ? "high"
    : variantRatio >= 0.7
      ? "medium"
      : "low";

  const hasExactRisk = signals.some((signal) =>
    signal === "duplicate_content" ||
    signal === "duplicate_title" ||
    signal === "duplicate_meta_description"
  );

  return {
    classification: hasExactRisk ? "variant_serp_risk" : "variant_cluster",
    confidence,
    signals: variantSignals,
    attributes: variantAttributes.slice(0, 40)
  };
}

function emptyVariantAssessment(): VariantAssessment {
  return {
    classification: "true_cannibalization",
    confidence: "none",
    signals: [],
    attributes: []
  };
}

function extractVariantDetails(page: CrawledPage): VariantDetails {
  const source = normalizeIntentText([
    page.meta.title,
    page.headings.h1[0] || "",
    urlHandleText(page.finalUrl)
  ].join(" "));
  const tokens = source.split(" ").filter(Boolean);
  const signals = new Set<string>();
  const attributes = new Set<string>();

  for (const token of tokens) {
    if (variantColorWords.has(token)) {
      signals.add("color_variant");
      attributes.add(`color:${token}`);
    }

    if (isModelCode(token)) {
      signals.add("model_code_variant");
      attributes.add(`code:${token}`);
    }
  }

  const packMatches = source.match(/\bpack\s+(?:of\s+)?\d+\b/g) || [];
  for (const match of packMatches) {
    signals.add("pack_variant");
    attributes.add(match.replace(/\s+/g, "_"));
  }

  if (/\bcombo\b/.test(source)) {
    signals.add("combo_variant");
    attributes.add("combo");
  }

  if (/\b(?:variant|variants|colour|colours|color|colors)\b/.test(source)) {
    signals.add("variant_family");
    attributes.add("variant_family");
  }

  if (/\bcopy\b/.test(source)) {
    signals.add("copy_variant");
    attributes.add("copy");
  }

  return {
    signals: [...signals],
    attributes: [...attributes]
  };
}

function isModelCode(token: string): boolean {
  return /^(?:d|j|s|os|st|vt|z|sh|cargo)\d{1,4}$/i.test(token) ||
    /^\d{1,4}(?:d|j|s|os|st|vt|z|sh)$/i.test(token);
}

function pickPrimaryPage(pages: CrawledPage[], inboundCounts: Map<string, number>): CrawledPage {
  return [...pages].sort((left, right) => pageScore(right, inboundCounts) - pageScore(left, inboundCounts))[0];
}

function pageScore(page: CrawledPage, inboundCounts: Map<string, number>): number {
  const typeScore: Record<string, number> = {
    collection: 60,
    product: 50,
    page: 35,
    article: 30,
    blog: 20,
    home: 10
  };

  return (typeScore[page.pageType] || 0) +
    (inboundCounts.get(page.finalUrl) || 0) * 3 +
    Math.min(page.wordCount / 100, 20) +
    (page.meta.description ? 2 : 0) +
    (page.headings.h1.length === 1 ? 2 : 0);
}

function buildInboundCounts(pages: CrawledPage[]): Map<string, number> {
  const pageUrls = new Map(pages.map((page) => [normalizeUrlForCompare(page.finalUrl), page.finalUrl]));
  const inboundCounts = new Map<string, number>();

  for (const page of pages) {
    const linkedUrls = new Set<string>();

    for (const link of page.links) {
      if (!link.internal) continue;
      const target = pageUrls.get(normalizeUrlForCompare(link.href));
      if (!target || target === page.finalUrl) continue;
      linkedUrls.add(target);
    }

    for (const target of linkedUrls) {
      inboundCounts.set(target, (inboundCounts.get(target) || 0) + 1);
    }
  }

  return inboundCounts;
}

function buildIntentKeyFromPages(pages: CrawledPage[]): string {
  const keys = pages.map(buildIntentKey).filter(Boolean);
  return keys[0] || "";
}

function buildIntentKey(page: CrawledPage): string {
  const source = [
    page.meta.title,
    page.headings.h1[0] || "",
    urlHandleText(page.finalUrl)
  ].join(" ");

  const tokens = tokenizeIntent(source);
  const uniqueTokens = [...new Set(tokens)];

  if (uniqueTokens.length < 3) return "";
  return uniqueTokens.sort().join(" ");
}

function tokenizeIntent(value: string): string[] {
  return normalizeIntentText(value)
    .split(" ")
    .map((token) => singularize(token))
    .filter((token) =>
      token.length >= 3 &&
      !stopWords.has(token) &&
      !colorAndVariantWords.has(token) &&
      !/\d/.test(token)
    );
}

function normalizeIntentText(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/\bt[\s-]?shirts?\b/g, " tshirt ")
    .replace(/\btee[\s-]?shirts?\b/g, " tshirt ")
    .replace(/\btrack[\s-]?pants?\b/g, " track pant ")
    .replace(/\bcargo[\s-]?pants?\b/g, " cargo pant ")
    .replace(/[^a-z0-9]+/g, " ");
}

function singularize(token: string): string {
  const replacements: Record<string, string> = {
    cargos: "cargo",
    hoodies: "hoodie",
    jackets: "jacket",
    joggers: "jogger",
    pants: "pant",
    polos: "polo",
    shirts: "shirt",
    shorts: "short",
    tshirts: "tshirt",
    trunks: "trunk",
    vests: "vest"
  };

  return replacements[token] || token;
}

function normalizeExact(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function urlHandleText(url: string): string {
  try {
    const parsed = new URL(url);
    const handle = parsed.pathname.split("/").filter(Boolean).at(-1) || "";
    return decodeURIComponent(handle).replace(/[-_]+/g, " ");
  } catch {
    return "";
  }
}

function normalizeUrlForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}
