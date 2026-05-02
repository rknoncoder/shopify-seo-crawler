import PQueue from "p-queue";
import config from "../config/config.js";
import { runAudits } from "../audits/runAudits.js";
import { analyzeSite } from "../analyzer/seoAnalyzer.js";
import { fetchPage, sleepBetweenRequests } from "./fetcher.js";
import { UrlManager } from "./urlManager.js";
import { parseHtml } from "../parser/htmlParser.js";
import type { CrawlResult } from "../types/crawl.js";
import type { CrawledPage } from "../types/page.js";
import type { SeoIssue } from "../types/issue.js";
import { shouldSkipUrl } from "../utils/urlUtils.js";

export async function startCrawler(seedUrls: string[]): Promise<CrawlResult> {
  const baseUrl = seedUrls[0];
  const manager = new UrlManager(baseUrl);
  const pages: CrawledPage[] = [];
  const pageIssues: SeoIssue[] = [];
  const queue = new PQueue({ concurrency: config.concurrency });

  seedUrls.slice(0, config.maxPages).forEach((url) => manager.add(url, 0));

  while (manager.hasNext() && pages.length < config.maxPages) {
    const next = manager.next();
    if (!next) break;

    queue.add(async () => {
      try {
        const fetched = await fetchPage(next.url);
        if (!fetched.contentType.includes("text/html") && fetched.html.trim().startsWith("<") === false) {
          return;
        }

        const page = parseHtml(fetched, next.depth);
        const issues = runAudits(page);
        page.issues = issues.map((issue) => issue.code);
        pages.push(page);
        pageIssues.push(...issues);

        if (next.depth < config.maxDepth) {
          page.links
            .filter((link) => link.internal && !shouldSkipUrl(link.href, baseUrl))
            .forEach((link) => manager.add(link.href, next.depth + 1));
        }
      } catch (error) {
        pageIssues.push({
          url: next.url,
          pageType: "unknown",
          severity: "critical",
          category: "technical",
          code: "fetch_failed",
          message: "Page could not be fetched.",
          recommendation: "Check DNS, redirects, blocking, timeout, or server availability.",
          evidence: error instanceof Error ? error.message : String(error)
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
  return { pages, issues: analyzeSite(pages, pageIssues) };
}
