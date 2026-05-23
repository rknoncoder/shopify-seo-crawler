import PQueue from "p-queue";
import config from "../config/config.js";
import { runAudits } from "../audits/runAudits.js";
import { analyzeSite } from "../analyzer/seoAnalyzer.js";
import { fetchPage, getFetchTelemetry, resetFetchTelemetry, sleepBetweenRequests } from "./fetcher.js";
import { UrlManager } from "./urlManager.js";
import { parseHtml } from "../parser/htmlParser.js";
import type { CrawlResult } from "../types/crawl.js";
import type { ImageInventoryUsage } from "../types/image.js";
import type { CrawledPage } from "../types/page.js";
import type { SeoIssue } from "../types/issue.js";
import { classifyFetchError } from "../utils/fetchFailureClassifier.js";
import { truncate } from "../utils/textUtils.js";
import { shouldSkipUrl } from "../utils/urlUtils.js";

interface StartCrawlerOptions {
  followLinks?: boolean;
}

export async function startCrawler(seedUrls: string[], options: StartCrawlerOptions = {}): Promise<CrawlResult> {
  resetFetchTelemetry();
  const followLinks = options.followLinks ?? true;
  const baseUrl = seedUrls[0];
  const manager = new UrlManager(baseUrl);
  const pages: CrawledPage[] = [];
  const analysisPages: CrawledPage[] = [];
  const pageIssues: SeoIssue[] = [];
  const imageInventoryUsages: ImageInventoryUsage[] = [];
  let totalRequested = 0;
  let skippedNonHtmlCount = 0;
  const queue = new PQueue({ concurrency: config.concurrency });

  seedUrls.slice(0, config.maxPages).forEach((url) => manager.add(url, 0));

  while (manager.hasNext() && pages.length < config.maxPages) {
    const next = manager.next();
    if (!next) break;

    queue.add(async () => {
      try {
        totalRequested += 1;
        const fetched = await fetchPage(next.url);
        if (!fetched.contentType.includes("text/html") && fetched.html.trim().startsWith("<") === false) {
          skippedNonHtmlCount += 1;
          return;
        }

        const page = parseHtml(fetched, next.depth);
        const issues = runAudits(page);
        page.issues = issues.map((issue) => issue.code);
        pageIssues.push(...issues);
        imageInventoryUsages.push(...buildImageInventoryUsages(page));

        if (followLinks && next.depth < config.maxDepth) {
          page.links
            .filter((link) => link.internal && !shouldSkipUrl(link.href, baseUrl))
            .forEach((link) => manager.add(link.href, next.depth + 1));
        }

        analysisPages.push(compactPageForAnalysis(page));
        pages.push(compactPageForStorage(page));
      } catch (error) {
        const fetchIssue = classifyFetchError(error);
        pageIssues.push({
          url: next.url,
          pageType: "unknown",
          severity: fetchIssue.severity,
          category: "technical",
          code: fetchIssue.code,
          message: fetchIssue.message,
          recommendation: fetchIssue.recommendation,
          evidence: fetchIssue.evidence
        });
      } finally {
        if (config.crawlDelayMs > 0) {
          await sleepBetweenRequests(config.crawlDelayMs);
        }
      }
    });

    if (queue.size + queue.pending >= config.concurrency) {
      await queue.onSizeLessThan(config.concurrency);
    }
  }

  await queue.onIdle();
  return {
    pages,
    issues: analyzeSite(analysisPages, pageIssues),
    imageInventoryUsages,
    telemetry: {
      totalRequested,
      skippedNonHtmlCount,
      retries: getFetchTelemetry()
    }
  };
}

function buildImageInventoryUsages(page: CrawledPage): ImageInventoryUsage[] {
  return page.images.map((image) => ({
    imageUrl: image.src,
    rawSrc: truncate(image.rawSrc, 500),
    alt: truncate(image.alt, 300),
    pageUrl: page.finalUrl,
    pageType: page.pageType,
    width: image.width || "",
    height: image.height || "",
    lazy: image.lazy,
    fetchPriority: image.fetchPriority || ""
  }));
}

function compactPageForAnalysis(page: CrawledPage): CrawledPage {
  return {
    ...page,
    textSample: "",
    links: page.links
      .filter((link) => link.internal)
      .map((link) => ({
        href: link.href,
        rawHref: "",
        text: truncate(link.text, 90),
        rel: [],
        internal: true,
        status: link.status
      })),
    images: [],
    schemas: []
  };
}

function compactPageForStorage(page: CrawledPage): CrawledPage {
  return {
    ...page,
    textSample: truncate(page.textSample, config.storage.maxStoredTextSampleChars),
    links: page.links.slice(0, config.storage.maxStoredLinksPerPage),
    images: page.images.slice(0, config.storage.maxStoredImagesPerPage)
  };
}
