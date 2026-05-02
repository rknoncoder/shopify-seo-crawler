# Shopify SEO Crawler

A TypeScript SEO crawler initialized from the structure of `rknoncoder/wordpress-seo-crawler`, adapted for Shopify storefronts.

It discovers Shopify sitemaps, crawls product, collection, blog, article, page, and policy URLs, extracts SEO signals, detects Shopify-specific templates, runs audits, and exports JSON, CSV, and Excel reports.

## Install

```bash
npm install
```

## Crawl

```bash
npm run crawl -- --url https://example.myshopify.com --mode seo
```

Useful flags:

- `--url` target storefront URL.
- `--mode` one of `single`, `seo`, or `full`.
- `--max-pages` maximum pages to crawl.
- `--max-depth` link crawl depth when falling back from sitemaps.
- `--sitemap` repeatable manual sitemap URL.

The crawler identifies itself with this user agent:

```text
ShopifySEOBot/1.0 (+https://example.com/bot)
```

By default it waits roughly 1-2 seconds between requests to reduce Shopify bot-protection blocks.

Environment variables with the `SHOPIFY_CRAWLER_` prefix also work, for example:

```bash
SHOPIFY_CRAWLER_URL=https://example.com npm run crawl
```

## Output

Reports are written to:

- `data/raw/output.json`
- `data/raw/site-profile.json`
- `data/raw/sitemaps.json`
- `data/reports/pages.csv`
- `data/reports/issues.json`
- `data/reports/issues.csv`
- `data/reports/action-plan.json`
- `data/reports/action-plan.csv`
- `data/reports/shopify-seo-report.xlsx`
