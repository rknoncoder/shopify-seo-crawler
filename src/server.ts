import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

type CrawlJobStatus = "running" | "completed" | "failed";
type CrawlMode = "single" | "seo" | "full";

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
  return value === "single" || value === "full" || value === "seo" ? value : "seo";
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
  const pages = await readCsvRowCount("pages.csv");

  return {
    generatedAt: new Date().toISOString(),
    crawlStats,
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
    <span id="serverStatus" class="status">Ready</span>
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
