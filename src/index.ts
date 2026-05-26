import { startCrawler } from "./crawler/crawler.js";
import { configureRun, getExcelExportOptions } from "./pipeline/configureRun.js";
import { writeCrawlOutputs, writeSitemapInventory } from "./pipeline/outputWriter.js";
import { buildReportBundle } from "./pipeline/reportBuilder.js";
import { buildSitemapInventory, extractUrlsForCrawl, resolveSitemapDetection } from "./pipeline/sitemapInventory.js";

async function main(): Promise<void> {
  const run = configureRun();

  console.log(`Target website: ${run.targetUrl}`);
  console.log(`Crawl source: ${run.source}`);
  console.log(`Crawl mode: ${run.crawlMode}`);

  const detectionResult = await resolveSitemapDetection(run.targetUrl, run.crawlMode, run.manualSitemapUrls);
  const sitemapInventory = await buildSitemapInventory(detectionResult);
  await writeSitemapInventory(sitemapInventory);

  const urls = run.crawlMode === "single" || run.crawlMode === "discover"
    ? [run.targetUrl]
    : await extractUrlsForCrawl(sitemapInventory.sitemaps.filter((sitemap) => sitemap.selectedForCrawl));

  const crawledFromSitemap = !["single", "discover"].includes(run.crawlMode) && urls.length > 0;
  const finalUrls = urls.length > 0 ? urls : [run.targetUrl];
  const sitemapUrlsForReports = crawledFromSitemap ? finalUrls : [];
  console.log(`Final URLs selected: ${finalUrls.length}`);

  const result = await startCrawler(finalUrls, { followLinks: !crawledFromSitemap });
  const reports = await buildReportBundle({
    targetUrl: run.targetUrl,
    result,
    finalUrls: sitemapUrlsForReports,
    pageSpeedOptions: run.pageSpeedOptions
  });
  const excelOptions = getExcelExportOptions(result.pages.length);
  const excelPath = await writeCrawlOutputs(result, reports, excelOptions);

  console.log(`Crawled pages: ${result.pages.length}`);
  console.log(`Issues found: ${reports.issues.length}`);
  if (run.pageSpeedOptions.enabled) {
    console.log(`PageSpeed Insights URLs tested: ${reports.pageSpeedReport.length}`);
  }
  if (excelPath) {
    console.log(`Excel export completed: ${excelPath}`);
  } else {
    console.log(`Excel export skipped: ${excelOptions.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
