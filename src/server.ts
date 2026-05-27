import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

type CrawlJobStatus = "running" | "completed" | "failed";
type CrawlMode = "single" | "seo" | "full" | "discover";

interface CrawlRequest {
  url: string;
  mode?: CrawlMode;
  maxPages?: number;
  sitemap?: string;
  memorySafe?: boolean;
  noExcel?: boolean;
  pagespeed?: boolean;
  heapMb?: number;
}

interface CrawlJob {
  id: string;
  url: string;
  mode: CrawlMode;
  maxPages?: number;
  sitemap?: string;
  memorySafe: boolean;
  noExcel: boolean;
  pagespeed: boolean;
  heapMb?: number;
  status: CrawlJobStatus;
  startedAt: string;
  completedAt: string;
  exitCode?: number | null;
  error?: string;
  logs: string[];
  process?: ChildProcessWithoutNullStreams;
}

const host = process.env.SHOPIFY_CRAWLER_SERVER_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.SHOPIFY_CRAWLER_SERVER_PORT || "3000", 10);
const maxLogLines = 500;
const jobs = new Map<string, CrawlJob>();

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    await routeRequest(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

server.listen(port, host, () => {
  console.log(`Shopify SEO Crawler dashboard: http://${host}:${port}`);
});

async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

  if (request.method === "GET" && requestUrl.pathname === "/") {
    sendHtml(response, dashboardHtml());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/network") {
    sendHtml(response, networkHtml());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, generatedAt: new Date().toISOString() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/crawl") {
    const payload = normalizeCrawlRequest(await readJsonBody(request));
    const runningJob = [...jobs.values()].find((job) => job.status === "running");
    if (runningJob) {
      sendJson(response, 409, {
        error: "A crawl is already running.",
        runningJob: serializeJob(runningJob)
      });
      return;
    }

    const job = startCrawlJob(payload);
    sendJson(response, 202, serializeJob(job));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/jobs") {
    sendJson(response, 200, [...jobs.values()].map(serializeJob).reverse());
    return;
  }

  const jobMatch = requestUrl.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "GET" && jobMatch?.[1]) {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return;
    }
    sendJson(response, 200, serializeJob(job));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/reports/summary") {
    sendJson(response, 200, await buildReportsSummary());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/reports/files") {
    sendJson(response, 200, await listReportFiles());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/link-graph") {
    await sendReportJson(response, "link-graph.json");
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/link-graph-summary") {
    await sendReportJson(response, "link-graph-summary.json");
    return;
  }

  const reportMatch = requestUrl.pathname.match(/^\/reports\/([^/]+)$/);
  if (request.method === "GET" && reportMatch?.[1]) {
    await sendReportFile(response, reportMatch[1]);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function startCrawlJob(payload: CrawlRequest): CrawlJob {
  const id = createJobId();
  const command = process.execPath;
  const args = buildNodeCrawlArgs(payload);

  const job: CrawlJob = {
    id,
    url: payload.url,
    mode: payload.mode || "seo",
    maxPages: payload.maxPages,
    sitemap: payload.sitemap,
    memorySafe: payload.memorySafe ?? true,
    noExcel: payload.noExcel ?? true,
    pagespeed: payload.pagespeed ?? false,
    heapMb: payload.heapMb,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: "",
    logs: []
  };

  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: sanitizeEnv(process.env),
    windowsHide: true
  });

  job.process = child;
  jobs.set(id, job);
  appendLog(job, `$ "${command}" ${args.join(" ")}`);

  child.stdout.on("data", (chunk) => appendLog(job, chunk.toString()));
  child.stderr.on("data", (chunk) => appendLog(job, chunk.toString()));
  child.on("error", (error) => {
    job.status = "failed";
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    appendLog(job, error.message);
  });
  child.on("close", (code) => {
    job.exitCode = code;
    job.status = code === 0 ? "completed" : "failed";
    job.completedAt = new Date().toISOString();
    appendLog(job, `Crawler exited with code ${code ?? "unknown"}.`);
  });

  return job;
}

function buildNodeCrawlArgs(payload: CrawlRequest): string[] {
  const args: string[] = [];
  if (payload.heapMb) args.push(`--max-old-space-size=${payload.heapMb}`);
  args.push("--import", "tsx", "src/index.ts", "--url", payload.url, "--mode", payload.mode || "seo");

  if (payload.maxPages) args.push("--max-pages", String(payload.maxPages));
  if (payload.sitemap) args.push("--sitemap", payload.sitemap);
  if (payload.memorySafe ?? true) args.push("--memory-safe");
  if (payload.noExcel ?? true) args.push("--no-excel");
  if (payload.pagespeed) args.push("--pagespeed");

  return args;
}

function sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function normalizeCrawlRequest(input: unknown): CrawlRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const raw = input as Record<string, unknown>;
  const url = String(raw.url || "").trim();
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL must start with http:// or https://.");
  }

  const mode = normalizeMode(raw.mode);
  const maxPages = normalizeOptionalNumber(raw.maxPages, 1, 10000);
  const heapMb = normalizeOptionalNumber(raw.heapMb, 512, 16384);
  const sitemap = typeof raw.sitemap === "string" && raw.sitemap.trim() ? raw.sitemap.trim() : undefined;

  if (sitemap) {
    const parsedSitemap = new URL(sitemap, url);
    if (!["http:", "https:"].includes(parsedSitemap.protocol)) {
      throw new Error("Sitemap URL must start with http:// or https://.");
    }
  }

  return {
    url: parsed.toString(),
    mode,
    maxPages,
    sitemap,
    memorySafe: raw.memorySafe !== false,
    noExcel: raw.noExcel !== false,
    pagespeed: raw.pagespeed === true,
    heapMb
  };
}

function normalizeMode(value: unknown): CrawlMode {
  return value === "single" || value === "full" || value === "seo" || value === "discover" ? value : "seo";
}

function normalizeOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).byteLength > 1024 * 1024) {
      throw new Error("Request body is too large.");
    }
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function serializeJob(job: CrawlJob): Omit<CrawlJob, "process"> {
  const { process: _process, ...safeJob } = job;
  return safeJob;
}

function appendLog(job: CrawlJob, value: string): void {
  const lines = value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  job.logs.push(...lines);
  if (job.logs.length > maxLogLines) {
    job.logs.splice(0, job.logs.length - maxLogLines);
  }
}

async function buildReportsSummary(): Promise<Record<string, unknown>> {
  const crawlStats = await readReportJson("crawl-stats.json");
  const issues = await readReportJson("issues.json");
  const imageSeoSummary = await readReportJson("image-seo-summary.json");
  const pages = await readCsvRowCount("pages.csv");

  return {
    generatedAt: new Date().toISOString(),
    crawlStats,
    imageSeoSummary,
    pageRows: pages,
    issueCount: Array.isArray(issues) ? issues.length : 0,
    severityCounts: Array.isArray(issues) ? countBy(issues, "severity") : {},
    topIssueCodes: Array.isArray(issues) ? topCounts(issues, "code", 12) : []
  };
}

async function readReportJson(fileName: string): Promise<unknown> {
  try {
    const raw = await readFile(join(process.cwd(), "data", "reports", fileName), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readCsvRowCount(fileName: string): Promise<number> {
  try {
    const raw = await readFile(join(process.cwd(), "data", "reports", fileName), "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return Math.max(0, lines.length - 1);
  } catch {
    return 0;
  }
}

function countBy(items: unknown[], key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const value = String((item as Record<string, unknown>)[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function topCounts(items: unknown[], key: string, limit: number): Array<{ name: string; count: number }> {
  return Object.entries(countBy(items, key))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

async function listReportFiles(): Promise<Array<{ name: string; size: number; modifiedAt: string }>> {
  const reportsDir = join(process.cwd(), "data", "reports");
  try {
    const entries = await readdir(reportsDir);
    const files = await Promise.all(entries.map(async (name) => {
      const fileStat = await stat(join(reportsDir, name));
      return {
        name,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString()
      };
    }));
    return files
      .filter((file) => file.name.endsWith(".csv") || file.name.endsWith(".json") || file.name.endsWith(".xlsx"))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function sendReportFile(response: ServerResponse, fileName: string): Promise<void> {
  const reportsDir = resolve(process.cwd(), "data", "reports");
  const safeName = normalize(fileName).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(reportsDir, safeName);

  if (!filePath.startsWith(reportsDir) || safeName.includes("/") || safeName.includes("\\")) {
    sendJson(response, 400, { error: "Invalid report file path." });
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(fileName),
      "content-disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Report file not found." });
  }
}

async function sendReportJson(response: ServerResponse, fileName: string): Promise<void> {
  const report = await readReportJson(fileName);
  if (report === null) {
    sendJson(response, 404, { error: `${fileName} not found. Run a crawl first.` });
    return;
  }

  sendJson(response, 200, report);
}

function contentTypeFor(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".csv") return "text/csv; charset=utf-8";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function createJobId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `crawl-${stamp}-${suffix}`;
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shopify SEO Crawler</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --surface: #ffffff;
      --line: #d8dde5;
      --text: #151923;
      --muted: #5d6675;
      --accent: #167a5b;
      --accent-strong: #0d5e45;
      --danger: #b42318;
      --warn: #a15c07;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      background: #101820;
      color: #ffffff;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .header-actions a {
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 13px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 18px;
    }
    section {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 18px;
    }
    form {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) repeat(4, minmax(110px, 150px));
      gap: 12px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
    }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 12px;
      font: inherit;
      background: #ffffff;
      color: var(--text);
    }
    .toggles {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .toggle {
      display: inline-flex;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-weight: 600;
    }
    .toggle input {
      width: 18px;
      height: 18px;
    }
    button {
      border: 0;
      border-radius: 6px;
      padding: 11px 14px;
      font: inherit;
      font-weight: 700;
      background: var(--accent);
      color: #ffffff;
      cursor: pointer;
    }
    button:hover { background: var(--accent-strong); }
    button:disabled {
      background: #8b949e;
      cursor: not-allowed;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fbfcfd;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .metric strong {
      display: block;
      margin-top: 6px;
      font-size: 24px;
    }
    .status {
      padding: 6px 10px;
      border-radius: 999px;
      background: #e7f4ef;
      color: var(--accent-strong);
      font-size: 13px;
      font-weight: 700;
    }
    .status.failed {
      background: #ffe8e5;
      color: var(--danger);
    }
    .status.running {
      background: #fff3dc;
      color: var(--warn);
    }
    pre {
      margin: 0;
      background: #101820;
      color: #e8eef5;
      border-radius: 8px;
      padding: 14px;
      min-height: 220px;
      max-height: 420px;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.5;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      text-align: left;
      padding: 10px 8px;
      vertical-align: middle;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    a {
      color: var(--accent-strong);
      font-weight: 700;
      text-decoration: none;
    }
    @media (max-width: 900px) {
      form, .grid {
        grid-template-columns: 1fr;
      }
      main {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Shopify SEO Crawler</h1>
    <div class="header-actions">
      <a href="/network">Network Graph</a>
      <span id="serverStatus" class="status">Ready</span>
    </div>
  </header>
  <main>
    <section>
      <h2>Start Crawl</h2>
      <form id="crawlForm">
        <label>Store URL
          <input id="url" name="url" type="url" placeholder="https://triprindia.com" required>
        </label>
        <label>Mode
          <select id="mode" name="mode">
            <option value="seo">SEO</option>
            <option value="single">Single</option>
            <option value="full">Full</option>
            <option value="discover">Discover</option>
          </select>
        </label>
        <label>Max Pages
          <input id="maxPages" name="maxPages" type="number" min="1" max="10000" placeholder="optional">
        </label>
        <label>Heap MB
          <input id="heapMb" name="heapMb" type="number" min="512" max="16384" value="4096">
        </label>
        <button id="startButton" type="submit">Start</button>
      </form>
      <div class="toggles">
        <label class="toggle"><input id="memorySafe" type="checkbox" checked> Memory safe</label>
        <label class="toggle"><input id="noExcel" type="checkbox" checked> Skip Excel</label>
        <label class="toggle"><input id="pagespeed" type="checkbox"> PageSpeed</label>
      </div>
    </section>

    <section>
      <h2>Latest Report</h2>
      <div class="grid">
        <div class="metric"><span>Pages</span><strong id="pages">0</strong></div>
        <div class="metric"><span>Issues</span><strong id="issues">0</strong></div>
        <div class="metric"><span>Missing Alt</span><strong id="missingAlt">0</strong></div>
        <div class="metric"><span>Pages Missing Alt</span><strong id="pagesMissingAlt">0</strong></div>
        <div class="metric"><span>Fetch Failures</span><strong id="failures">0</strong></div>
        <div class="metric"><span>P95 Load</span><strong id="p95">0 ms</strong></div>
      </div>
    </section>

    <section>
      <h2>Job Log</h2>
      <pre id="logs">No crawl started in this server session.</pre>
    </section>

    <section>
      <h2>Report Files</h2>
      <table>
        <thead><tr><th>File</th><th>Size</th><th>Modified</th></tr></thead>
        <tbody id="files"></tbody>
      </table>
    </section>
  </main>
  <script>
    const form = document.getElementById("crawlForm");
    const statusBadge = document.getElementById("serverStatus");
    const startButton = document.getElementById("startButton");
    const logs = document.getElementById("logs");
    let currentJobId = "";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        url: document.getElementById("url").value,
        mode: document.getElementById("mode").value,
        maxPages: document.getElementById("maxPages").value || undefined,
        heapMb: document.getElementById("heapMb").value || undefined,
        memorySafe: document.getElementById("memorySafe").checked,
        noExcel: document.getElementById("noExcel").checked,
        pagespeed: document.getElementById("pagespeed").checked
      };

      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) {
        alert(body.error || "Unable to start crawl");
        return;
      }
      currentJobId = body.id;
      renderJob(body);
    });

    async function poll() {
      await refreshReports();
      await refreshFiles();
      if (currentJobId) {
        const response = await fetch("/api/jobs/" + currentJobId);
        if (response.ok) renderJob(await response.json());
      } else {
        const response = await fetch("/api/jobs");
        const jobs = await response.json();
        if (jobs[0]) renderJob(jobs[0]);
      }
      setTimeout(poll, 2500);
    }

    async function refreshReports() {
      const response = await fetch("/api/reports/summary");
      if (!response.ok) return;
      const summary = await response.json();
      document.getElementById("pages").textContent = summary.pageRows || 0;
      document.getElementById("issues").textContent = summary.issueCount || 0;
      document.getElementById("missingAlt").textContent = summary.imageSeoSummary?.missingAltImages || 0;
      document.getElementById("pagesMissingAlt").textContent = summary.imageSeoSummary?.pagesWithMissingAlt || 0;
      document.getElementById("failures").textContent = summary.crawlStats?.fetchFailedCount || 0;
      const p95 = summary.crawlStats?.loadTimeMs?.p95 || 0;
      document.getElementById("p95").textContent = p95 + " ms";
    }

    async function refreshFiles() {
      const response = await fetch("/api/reports/files");
      if (!response.ok) return;
      const files = await response.json();
      document.getElementById("files").innerHTML = files.map((file) => (
        "<tr><td><a href=\\"/reports/" + encodeURIComponent(file.name) + "\\">" + file.name + "</a></td><td>" +
        formatBytes(file.size) + "</td><td>" + new Date(file.modifiedAt).toLocaleString() + "</td></tr>"
      )).join("");
    }

    function renderJob(job) {
      statusBadge.textContent = job.status;
      statusBadge.className = "status " + job.status;
      startButton.disabled = job.status === "running";
      logs.textContent = (job.logs || []).join("\\n") || "Waiting for crawler output...";
      logs.scrollTop = logs.scrollHeight;
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }

    poll();
  </script>
</body>
</html>`;
}

function networkHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shopify SEO Crawler - Network Graph</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --surface: #ffffff;
      --line: #d8dde5;
      --text: #151923;
      --muted: #5d6675;
      --accent: #167a5b;
      --accent-strong: #0d5e45;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      background: #101820;
      color: #ffffff;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    header a {
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 6px;
      padding: 7px 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
    }
    main {
      max-width: 1480px;
      margin: 0 auto;
      padding: 18px;
      display: grid;
      gap: 14px;
    }
    .toolbar, .layout, aside {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .toolbar {
      padding: 14px;
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto auto;
      gap: 14px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    input, select {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 11px;
      font: inherit;
      background: #ffffff;
      color: var(--text);
    }
    .statline {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }
    .layout {
      min-height: calc(100vh - 170px);
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      overflow: hidden;
    }
    #chart {
      min-height: calc(100vh - 170px);
      position: relative;
      background: #fbfcfd;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    aside {
      border-width: 0 0 0 1px;
      border-radius: 0;
      padding: 18px;
      overflow: auto;
    }
    aside h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .muted {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }
    dl {
      margin: 0;
      display: grid;
      gap: 12px;
    }
    dt {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    dd {
      margin: 3px 0 0;
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    dd a {
      color: var(--accent-strong);
      font-weight: 700;
      text-decoration: none;
    }
    .legend {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
    }
    .legend span {
      display: inline-flex;
      gap: 5px;
      align-items: center;
    }
    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      display: inline-block;
    }
    .node circle {
      stroke: #ffffff;
      stroke-width: 1.5px;
    }
    .node.orphan circle {
      stroke: #334155;
      stroke-dasharray: 4 3;
    }
    .node.search-hit circle {
      stroke: #111827;
      stroke-width: 3px;
    }
    .empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--muted);
      font-weight: 700;
      text-align: center;
      padding: 24px;
    }
    @media (max-width: 980px) {
      .toolbar, .layout {
        grid-template-columns: 1fr;
      }
      aside {
        border-width: 1px 0 0;
      }
      #chart {
        min-height: 520px;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>Link Network</h1>
    <a href="/">Dashboard</a>
  </header>
  <main>
    <section class="toolbar">
      <label>Search URL
        <input id="search" type="search" placeholder="products, collections, handle...">
      </label>
      <label>Filter
        <select id="graphFilter">
          <option value="all">All nodes</option>
          <option value="hubs">Hubs only</option>
          <option value="orphans">Orphans only</option>
          <option value="catalog">Collections + Products only</option>
        </select>
      </label>
      <div>
        <div id="graphCounts" class="statline">Loading graph...</div>
        <div id="searchCount" class="muted"></div>
      </div>
    </section>
    <section class="layout">
      <div id="chart">
        <svg id="graph" role="img" aria-label="Internal link force graph"></svg>
        <div id="emptyState" class="empty" hidden></div>
      </div>
      <aside>
        <h2>Node Details</h2>
        <div id="nodeDetails" class="muted">Click a node to inspect URL, type, inbound links, outbound links, PageRank, and orphan status.</div>
        <div class="legend" aria-label="Node color legend">
          <span><i class="swatch" style="background:#ef4444"></i>Home</span>
          <span><i class="swatch" style="background:#f7a64f"></i>Collection</span>
          <span><i class="swatch" style="background:#4f86f7"></i>Product</span>
          <span><i class="swatch" style="background:#6dbf67"></i>Blog</span>
          <span><i class="swatch" style="background:#c084fc"></i>Page</span>
        </div>
      </aside>
    </section>
  </main>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
  <script>
    const colorByType = {
      product: "#4f86f7",
      collection: "#f7a64f",
      blog: "#6dbf67",
      page: "#c084fc",
      home: "#ef4444",
      other: "#64748b"
    };

    const d3 = window.d3;
    const svg = d3 ? d3.select("#graph") : null;
    const chart = document.getElementById("chart");
    const emptyState = document.getElementById("emptyState");
    const filterSelect = document.getElementById("graphFilter");
    const searchInput = document.getElementById("search");
    const graphCounts = document.getElementById("graphCounts");
    const searchCount = document.getElementById("searchCount");
    const nodeDetails = document.getElementById("nodeDetails");

    let allNodes = [];
    let allEdges = [];
    let simulation = null;
    let nodeSelection = null;
    let linkSelection = null;
    let resizeTimer = 0;

    if (!d3) {
      showEmpty("D3 could not load from the CDN. Check your internet connection and reload this page.");
    } else {
      loadGraph();
    }

    filterSelect.addEventListener("change", renderGraph);
    searchInput.addEventListener("input", applySearchHighlight);
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderGraph, 180);
    });

    async function loadGraph() {
      try {
        const graphResponse = await fetch("/api/link-graph");
        if (!graphResponse.ok) throw new Error("link-graph.json was not found. Run a crawl first.");
        const summaryResponse = await fetch("/api/link-graph-summary");
        const graph = await graphResponse.json();
        const summary = summaryResponse.ok ? await summaryResponse.json() : [];
        mergeGraphData(graph, summary);
        renderGraph();
      } catch (error) {
        showEmpty(error instanceof Error ? error.message : "Unable to load link graph.");
      }
    }

    function mergeGraphData(graph, summaryRows) {
      const summaryByUrl = new Map();
      if (Array.isArray(summaryRows)) {
        for (const row of summaryRows) {
          if (row && row.url) summaryByUrl.set(String(row.url), row);
        }
      }

      allNodes = (Array.isArray(graph.nodes) ? graph.nodes : [])
        .map((node) => {
          const id = String(node.id || "");
          const summary = summaryByUrl.get(id) || {};
          return {
            id,
            type: String(summary.type || node.type || "other"),
            crawled: Boolean(node.crawled),
            inbound_count: toNumber(summary.inbound_count),
            outbound_count: toNumber(summary.outbound_count),
            pagerank_score: toNumber(summary.pagerank_score),
            is_orphan: Boolean(summary.is_orphan),
            is_hub: Boolean(summary.is_hub),
            is_sink: Boolean(summary.is_sink),
            depth_from_home: summary.depth_from_home === null || summary.depth_from_home === undefined ? "" : summary.depth_from_home
          };
        })
        .filter((node) => node.id);

      const nodeIds = new Set(allNodes.map((node) => node.id));
      allEdges = (Array.isArray(graph.edges) ? graph.edges : [])
        .map((edge) => ({ source: String(edge.source || ""), target: String(edge.target || "") }))
        .filter((edge) => edge.source && edge.target);

      for (const edge of allEdges) {
        if (!nodeIds.has(edge.source)) {
          nodeIds.add(edge.source);
          allNodes.push(createFallbackNode(edge.source));
        }
        if (!nodeIds.has(edge.target)) {
          nodeIds.add(edge.target);
          allNodes.push(createFallbackNode(edge.target));
        }
      }
    }

    function createFallbackNode(url) {
      return {
        id: url,
        type: inferType(url),
        crawled: false,
        inbound_count: 0,
        outbound_count: 0,
        pagerank_score: 0,
        is_orphan: false,
        is_hub: false,
        is_sink: false,
        depth_from_home: ""
      };
    }

    function renderGraph() {
      if (!d3 || !svg) return;
      if (simulation) simulation.stop();
      svg.selectAll("*").remove();
      emptyState.hidden = true;

      const filter = filterSelect.value;
      const nodes = allNodes.filter((node) => nodeMatchesFilter(node, filter)).map((node) => ({ ...node }));
      const visibleIds = new Set(nodes.map((node) => node.id));
      const edges = allEdges
        .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
        .map((edge) => ({ ...edge }));

      graphCounts.textContent = "Showing " + nodes.length + " nodes / " + edges.length + " edges";

      if (nodes.length === 0) {
        showEmpty("No nodes match this filter.");
        return;
      }

      const width = Math.max(640, chart.clientWidth || 900);
      const height = Math.max(420, chart.clientHeight || 620);
      const maxInbound = Math.max(1, ...nodes.map((node) => node.inbound_count));
      const radius = d3.scaleSqrt().domain([0, maxInbound]).range([4, 20]);

      svg.attr("viewBox", "0 0 " + width + " " + height);

      const defs = svg.append("defs");
      defs.append("marker")
        .attr("id", "arrowHover")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 16)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#334155");

      linkSelection = svg.append("g")
        .attr("stroke", "#64748b")
        .attr("stroke-width", 0.8)
        .selectAll("line")
        .data(edges)
        .join("line")
        .attr("stroke-opacity", 0.3)
        .on("mouseenter", function () {
          d3.select(this).attr("marker-end", "url(#arrowHover)").attr("stroke-opacity", 0.9).attr("stroke-width", 1.4);
        })
        .on("mouseleave", function () {
          d3.select(this).attr("marker-end", null).attr("stroke-opacity", 0.3).attr("stroke-width", 0.8);
        });

      nodeSelection = svg.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", (node) => "node" + (node.is_orphan ? " orphan" : ""))
        .attr("opacity", (node) => baseNodeOpacity(node))
        .on("mouseenter", handleNodeHover)
        .on("mouseleave", resetHover)
        .on("click", (_event, node) => renderNodeDetails(node))
        .call(d3.drag()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded));

      nodeSelection.append("circle")
        .attr("r", (node) => radius(node.inbound_count))
        .attr("fill", (node) => colorByType[node.type] || colorByType.other);

      nodeSelection.append("title").text((node) => node.id);

      simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id((node) => node.id).distance(72).strength(0.45))
        .force("charge", d3.forceManyBody().strength(-45))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius((node) => radius(node.inbound_count) + 5))
        .on("tick", () => {
          linkSelection
            .attr("x1", (edge) => endpoint(edge.source).x)
            .attr("y1", (edge) => endpoint(edge.source).y)
            .attr("x2", (edge) => endpoint(edge.target).x)
            .attr("y2", (edge) => endpoint(edge.target).y);

          nodeSelection.attr("transform", (node) => {
            node.x = clamp(node.x, 24, width - 24);
            node.y = clamp(node.y, 24, height - 24);
            return "translate(" + node.x + "," + node.y + ")";
          });
        });

      applySearchHighlight();
    }

    function handleNodeHover(_event, hoveredNode) {
      const neighbors = new Set([hoveredNode.id]);

      linkSelection
        .attr("stroke-opacity", (edge) => {
          const connected = isConnected(edge, hoveredNode.id);
          if (connected) {
            neighbors.add(endpointId(edge.source));
            neighbors.add(endpointId(edge.target));
          }
          return connected ? 0.9 : 0.05;
        })
        .attr("stroke-width", (edge) => isConnected(edge, hoveredNode.id) ? 1.4 : 0.6)
        .attr("marker-end", (edge) => isConnected(edge, hoveredNode.id) ? "url(#arrowHover)" : null);

      nodeSelection.attr("opacity", (node) => neighbors.has(node.id) ? Math.max(baseNodeOpacity(node), 0.72) : 0.12);
    }

    function resetHover() {
      linkSelection
        .attr("stroke-opacity", 0.3)
        .attr("stroke-width", 0.8)
        .attr("marker-end", null);
      nodeSelection.attr("opacity", (node) => baseNodeOpacity(node));
      applySearchHighlight();
    }

    function applySearchHighlight() {
      if (!nodeSelection) return;
      const query = searchInput.value.trim().toLowerCase();
      let matches = 0;

      nodeSelection.classed("search-hit", (node) => {
        const matched = Boolean(query) && node.id.toLowerCase().includes(query);
        if (matched) matches += 1;
        return matched;
      });

      searchCount.textContent = query ? matches + " matching visible nodes" : "";
    }

    function renderNodeDetails(node) {
      nodeDetails.className = "";
      nodeDetails.innerHTML =
        "<dl>" +
        detailRow("URL", "<a href=\\"" + safeAttr(node.id) + "\\" target=\\"_blank\\" rel=\\"noopener\\">" + safe(node.id) + "</a>", true) +
        detailRow("Type", node.type) +
        detailRow("Inbound count", String(node.inbound_count)) +
        detailRow("Outbound count", String(node.outbound_count)) +
        detailRow("PageRank score", formatScore(node.pagerank_score)) +
        detailRow("Orphan", node.is_orphan ? "Yes" : "No") +
        detailRow("Hub", node.is_hub ? "Yes" : "No") +
        detailRow("Depth from home", node.depth_from_home === "" ? "Not reachable from home" : String(node.depth_from_home)) +
        "</dl>";
    }

    function detailRow(label, value, valueIsHtml) {
      return "<div><dt>" + safe(label) + "</dt><dd>" + (valueIsHtml ? value : safe(value)) + "</dd></div>";
    }

    function nodeMatchesFilter(node, filter) {
      if (filter === "hubs") return node.is_hub === true;
      if (filter === "orphans") return node.is_orphan === true;
      if (filter === "catalog") return node.type === "collection" || node.type === "product";
      return true;
    }

    function isConnected(edge, nodeId) {
      return endpointId(edge.source) === nodeId || endpointId(edge.target) === nodeId;
    }

    function endpoint(value) {
      return typeof value === "string" ? { id: value, x: 0, y: 0 } : value;
    }

    function endpointId(value) {
      return typeof value === "string" ? value : value.id;
    }

    function baseNodeOpacity(node) {
      return node.is_orphan ? 0.52 : 1;
    }

    function dragStarted(event, node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
    }

    function dragged(event, node) {
      node.fx = event.x;
      node.fy = event.y;
    }

    function dragEnded(event, node) {
      if (!event.active) simulation.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    }

    function showEmpty(message) {
      emptyState.hidden = false;
      emptyState.textContent = message;
      graphCounts.textContent = "No graph loaded";
    }

    function inferType(url) {
      try {
        const pathname = new URL(url).pathname;
        if (pathname === "/" || pathname === "") return "home";
        if (pathname.startsWith("/products/")) return "product";
        if (pathname.startsWith("/collections/")) return "collection";
        if (pathname.startsWith("/blogs/")) return "blog";
        if (pathname.startsWith("/pages/")) return "page";
      } catch {
        return "other";
      }
      return "other";
    }

    function toNumber(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    }

    function clamp(value, min, max) {
      if (!Number.isFinite(value)) return min;
      return Math.max(min, Math.min(max, value));
    }

    function formatScore(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(6) : "0.000000";
    }

    function safe(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function safeAttr(value) {
      return safe(value).split(String.fromCharCode(96)).join("&#096;");
    }
  </script>
</body>
</html>`;
}
