# Shopify SEO Crawler

A TypeScript SEO crawler initialized from the structure of `rknoncoder/wordpress-seo-crawler`, adapted for Shopify storefronts.

It discovers Shopify sitemaps, crawls product, collection, blog, article, page, and policy URLs, extracts SEO signals, detects Shopify-specific templates, runs audits, and exports JSON, CSV, and Excel reports.

Shopify-specific checks include duplicate collection-product URL canonicals, indexable collection tag pages, and thin collections with 0 or 1 crawlable product links.

Shopify product SEO checks include product content depth, material/fabric details, size/fit details, care instructions, review signals, FAQ content, sold-out indexability risk, image count, and duplicate variant/combination cluster risk.

Collection SEO checks include thin collection copy, low/no product links, repeated product links, missing FAQ content, generic collection titles, boilerplate collection descriptions, crawlable sort/filter/pagination links, and indexable Shopify tag URLs.

Image SEO checks include missing alt text, weak/generic/duplicate alt text, product image alt context, generic filenames, missing dimensions, and missing lazy loading for non-primary images.

Image SEO reporting includes a Screaming Frog-style image inventory with image URL, alt text, usage count, pages used, and sample pages. Image SEO summary reporting adds site-wide totals for missing alt images, pages affected by missing alt, missing dimensions, duplicate alt issue pages, large image URLs, and primary-image lazy loading. Product pages also flag duplicate alt text that appears to be Shopify's automatic product-title fallback on variant/media images.

Page speed signals check HTML size, DOM size, script count, stylesheet count, render-blocking stylesheets, third-party/app script hosts, image count, large Shopify image URLs, and primary-image priority hints. These are lightweight crawl signals, not a Lighthouse replacement.

Optional PageSpeed Insights integration can export Lighthouse/PageSpeed data for a limited sample of crawled URLs using `--pagespeed`. It supports unauthenticated test calls and optional API keys through `--pagespeed-key`, `PAGESPEED_API_KEY`, or `SHOPIFY_CRAWLER_PAGESPEED_KEY`.

Redirect checks report crawled URLs that redirect, redirect chains when detected, and internal links pointing to known redirected URLs. Page exports and `redirect-report` include requested URL, final URL, redirected, and redirect count.

Content cannibalization checks group indexable URLs that appear to compete for the same search intent using duplicate content, duplicate SERP metadata, collection-product overlap, and normalized keyword intent from titles, H1s, and URL handles. It is variant-aware, so Shopify product color/model/pack/combo clusters are separated into `variant_cluster` or `variant_serp_risk` instead of being treated the same as true cannibalization. The dedicated report recommends a primary URL and lists competing URLs.

Technical link checks include `malformed_internal_link`, which flags internal links created from bad raw `href` values such as leading spaces, non-breaking spaces, or accidentally nested absolute URLs.

Fetch failures are categorized into actionable technical issue codes such as `fetch_timeout`, `fetch_dns_error`, `fetch_tls_error`, `fetch_blocked_403`, `fetch_rate_limited_429`, and `fetch_server_error`.

Indexability checks report pages blocked by meta robots, canonicalized URLs, invalid canonicals, nofollow directives, sitemap URLs that are not indexable, indexable pages missing from the selected sitemap URL set, and page-level indexability status in `pages.csv` plus `indexability-report.csv`.

HTTP header metadata is captured for each crawled page, including `X-Robots-Tag`, cache headers, server/CDN cache hints, content length, and measured response size. `X-Robots-Tag` noindex/nofollow directives are included in indexability audits.

Hreflang and `rel="alternate"` links are extracted into page outputs. The crawler flags malformed hreflang values, invalid alternate URLs, duplicate language alternates, and missing self-references in hreflang clusters.

Robots directives include richer snippet controls such as `nosnippet`, `noimageindex`, `max-snippet`, `max-image-preview`, `max-video-preview`, and `unavailable_after`. Open Graph and Twitter metadata checks flag missing social preview fields, invalid image URLs, invalid Twitter card values, and URL/title mismatches.

Advanced metadata validation records compact page-level signals for noindex, canonical validity, Open Graph product data, OG/visible price mismatches, viewport issues, hreflang count, HTML language, UTF-8 charset placement, and e-commerce social metadata.

Internal link checks report orphan pages, weakly linked pages, and products that are not linked from any crawled collection page.

Discover mode includes a Shopify collection pagination probe for infinite-scroll themes. When a crawled collection URL is found, the crawler also fetches lightweight pagination variants such as `/collections/t-shirts?limit=250&page=1`, `/collections/t-shirts?limit=250&page=2`, and so on. These probe pages are used only to discover canonical product URLs and are not stored as normal crawled pages, which keeps report output focused and avoids duplicate collection-page audits.

Discover mode also seeds storefront URLs from Shopify JSON and sitemap sources before normal BFS crawling starts. It reads `/products.json` for listed products, `/collections.json` for listed collections, and `/sitemap.xml` plus product sitemap files to catch live product URLs that exist in the sitemap but are not returned by `/products.json`.

SERP snippet checks report weak title/meta description quality, including generic titles, brand-only titles, title/H1 mismatch, boilerplate descriptions, descriptions that duplicate titles/headings, and product descriptions that lack useful shopping details.

Crawl telemetry reporting writes request/crawl totals, status-code buckets, fetch failures, redirects, retry counters, and load-time summaries to `crawl-stats`.

Discover telemetry also reports `api_seeded_products`, `api_seeded_collections`, `probe_discovered_products`, and `sitemap_only_products` so large crawls can explain where product URLs came from. Crawl stats also include network counters such as total nodes/edges, orphan/sink/hub counts, average inbound links, average home-depth, max-inbound URL, and top PageRank URL.

Link graph reporting exports the crawl's internal HTML link network as a JSON adjacency list, a flat CSV edge list for Excel/Gephi/Cytoscape, and a per-node summary with inbound count, outbound count, inbound sources, home-depth, orphan status, hub/sink flags, and a normalized PageRank score.

Schema and rich-result crawling are intentionally out of scope for this project and should be handled by the separate schema crawler.

## Install

```bash
npm install
```

## Crawl

```bash
npm run crawl -- --url https://example.myshopify.com
```

Useful flags:

- `--url` target storefront URL.
- `--mode` one of `single`, `seo`, `full`, or `discover`. Default is `full`.
- `--max-pages` maximum pages to crawl.
- `--max-depth` internal link crawl depth, mainly useful for `discover` mode.
- `--sitemap` repeatable manual sitemap URL.
- `--pagespeed` run optional Google PageSpeed Insights checks after crawling.
- `--pagespeed-limit` maximum crawled URLs to test with PageSpeed Insights. Default is `10`.
- `--pagespeed-strategy` one of `mobile` or `desktop`. Default is `mobile`.
- `--pagespeed-key` optional Google API key for PageSpeed Insights.
- `--memory-safe` reduce stored raw page detail and skip Excel export for large crawls.
- `--no-excel` skip Excel export and write CSV/JSON reports only.
- `--excel` force Excel export even when the crawl is above the automatic Excel page limit.
- `--excel-max-pages` page count limit for automatic Excel export. Default is `1500`.
- `--max-stored-links` maximum links stored per page in `data/raw/output.json`.
- `--max-stored-images` maximum images stored per page in `data/raw/output.json`.
- `--max-stored-text` maximum visible-text sample characters stored per page.

The crawler identifies itself with this user agent:

```text
ShopifySEOBot/1.0 (+https://example.com/bot)
```

By default it crawls with one request at a time and waits roughly 3-5 seconds between requests to reduce Shopify bot-protection blocks.

### Crawl Modes

| Mode | Best for | Behavior |
| --- | --- | --- |
| `single` | One-page audit, Chrome-extension style checks, quick debugging | Crawls only the target URL. |
| `seo` | Smaller sitemap-based SEO crawls | Uses selected Shopify sitemap URLs and conservative limits. |
| `full` | Full Shopify sitemap crawl | Uses all selected sitemap URLs and larger limits. |
| `discover` | Internal-link discovery, orphan/reachability checks, infinite-scroll collection testing | Skips sitemaps, starts from the target URL, follows internal links, and probes Shopify collection pagination for hidden product links. |

Use `discover` mode when you want to ignore sitemaps and crawl from the target URL through internal HTML links:

```bash
npm run crawl -- --url https://example.com --mode discover --max-pages 3000 --max-depth 8 --memory-safe --no-excel
```

In `discover` mode, Shopify collection URLs are also probed with pagination parameters:

```text
/collections/example?limit=250&page=1
/collections/example?limit=250&page=2
/collections/example?limit=250&page=3
```

The crawler extracts product links from those responses, normalizes collection-product URLs such as `/collections/summer/products/cool-shirt` to `/products/cool-shirt`, and queues the canonical product URL. The probe loop stops when a pagination page returns an error, has no product links, or adds no new product URLs.

This is designed to catch products that are hidden behind Shopify infinite scroll or JavaScript "load more" behavior without using a heavy browser renderer. It is much faster and lighter than Playwright/Puppeteer. A future optional JavaScript rendering fallback can be added for themes or apps that do not expose product links through normal Shopify pagination.

Important: pagination probe and sitemap seed requests are not stored as normal crawled pages. URLs discovered only through Shopify JSON/API/sitemap sources are tagged with `discoverySource` values such as `api_probe`, `pagination_probe`, or `sitemap_unlisted`. If they have no crawlable HTML inbound links, they are reported as `no_html_inbound_link` instead of being mixed into true `orphan_page` issues.

## Local Dashboard

Run the local API and dashboard:

```bash
npm run server
```

Then open:

```text
http://localhost:3000
```

The dashboard starts crawls through the existing CLI engine and serves the latest CSV/JSON/XLSX reports from `data/reports`. It binds to `127.0.0.1` by default for local use.

After a crawl has generated link graph reports, open the interactive internal link network view:

```text
http://localhost:3000/network
```

The network view reads `data/reports/link-graph.json` through `GET /api/link-graph` and uses `link-graph-summary.json` for inbound counts, hubs, orphans, and PageRank details.

For large Shopify stores, use memory-safe mode so the crawler writes CSV/JSON reports without building the heavy Excel workbook:

```bash
npm run crawl -- --url https://example.com --mode full --max-pages 3000 --memory-safe
```

Environment variables with the `SHOPIFY_CRAWLER_` prefix also work, for example:

```bash
SHOPIFY_CRAWLER_URL=https://example.com npm run crawl
```

## Testing

```bash
npm test
```

The baseline unit tests use Node's built-in test runner with `tsx` for TypeScript files.

## Output

Reports are written to:

- `data/raw/output.json`
- `data/raw/site-profile.json`
- `data/raw/sitemaps.json`
- `data/reports/pages.csv`
- `data/reports/crawl-stats.json`
- `data/reports/crawl-stats.csv`
- `data/reports/indexability-report.json`
- `data/reports/indexability-report.csv`
- `data/reports/content-cannibalization-report.json`
- `data/reports/content-cannibalization-report.csv`
- `data/reports/redirect-report.json`
- `data/reports/redirect-report.csv`
- `data/reports/pagespeed-report.json`
- `data/reports/pagespeed-report.csv`
- `data/reports/image-inventory.json`
- `data/reports/image-inventory.csv`
- `data/reports/image-seo-summary.json`
- `data/reports/image-seo-summary.csv`
- `data/reports/link-graph.json`
- `data/reports/link-graph.csv`
- `data/reports/link-graph-summary.json`
- `data/reports/issues.json`
- `data/reports/issues.csv`
- `data/reports/action-plan.json`
- `data/reports/action-plan.csv`
- `data/reports/shopify-seo-report.xlsx`
