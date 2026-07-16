import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { flattenPage } from "../pipeline/outputWriter.js";
import { saveCsv } from "../storage/saveCsv.js";
import { saveIssuesCsv } from "../storage/saveIssuesCsv.js";
import { saveIssuesJson } from "../storage/saveIssuesJson.js";
import { saveJson } from "../storage/saveJson.js";
import type { CrawlTelemetry } from "../types/crawl.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export interface CrawlCheckpoint {
  targetUrl: string;
  generatedAt: string;
  totalCrawled: number;
  issueCount: number;
  telemetry: CrawlTelemetry;
  note: string;
}

export async function writeCrawlCheckpoint(
  targetUrl: string,
  pages: CrawledPage[],
  issues: SeoIssue[],
  telemetry: CrawlTelemetry
): Promise<void> {
  const checkpointDir = join("data", "checkpoints", "latest");
  const generatedAt = new Date().toISOString();
  const summary: CrawlCheckpoint = {
    targetUrl,
    generatedAt,
    totalCrawled: pages.length,
    issueCount: issues.length,
    telemetry,
    note: "Partial crawl checkpoint. Final site-wide reports are written only when the crawl completes."
  };

  await mkdir(checkpointDir, { recursive: true });
  await saveJsonAtomic(join(checkpointDir, "progress.json"), summary);
  await saveJsonAtomic(join(checkpointDir, "pages.json"), pages);
  await saveCsvAtomic(join(checkpointDir, "pages.csv"), pages.map(flattenPage));
  await saveIssuesJsonAtomic(join(checkpointDir, "issues.json"), issues);
  await saveIssuesCsvAtomic(join(checkpointDir, "issues.csv"), issues);
}

async function saveJsonAtomic(path: string, data: unknown): Promise<void> {
  const tempPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await saveJson(tempPath, data);
  await rename(tempPath, path);
}

async function saveCsvAtomic<T extends object>(path: string, rows: T[], explicitHeaders?: string[]): Promise<void> {
  const tempPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await saveCsv(tempPath, rows, explicitHeaders);
  await rename(tempPath, path);
}

async function saveIssuesJsonAtomic(path: string, issues: SeoIssue[]): Promise<void> {
  const tempPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await saveIssuesJson(issues, tempPath);
  await rename(tempPath, path);
}

async function saveIssuesCsvAtomic(path: string, issues: SeoIssue[]): Promise<void> {
  const tempPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await saveIssuesCsv(issues, tempPath);
  await rename(tempPath, path);
}
