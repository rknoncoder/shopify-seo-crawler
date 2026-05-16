import type { CrawlConfig } from "../types/crawl.js";

const config: CrawlConfig = {
  startUrl: "https://example.myshopify.com/",
  crawlMode: "full",
  maxPages: 700,
  maxDepth: 3,
  timeout: 15000,
  concurrency: 1,
  crawlDelayMs: 3000,
  userAgent: "ShopifySEOBot/1.0 (+https://example.com/bot)",
  retries: 2,
  retryDelayMs: 3000,
  storage: {
    maxStoredLinksPerPage: 120,
    maxStoredImagesPerPage: 40,
    maxStoredTextSampleChars: 2000
  },
  crawl: {
    sameOriginOnly: true,
    keepQueryStrings: false,
    excludedPathPatterns: [
      "/admin",
      "/account",
      "/cart",
      "/checkout",
      "/orders",
      "/apps/",
      "/challenge",
      "/search",
      "/password",
      "/tools/",
      "customer_posted=true",
      "variant=",
      "view=",
      "sort_by=",
      "filter.",
      "utm_",
      "fbclid",
      "gclid"
    ],
    excludedExtensions: [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".css",
      ".js",
      ".zip",
      ".xml",
      ".json"
    ]
  },
  sitemapSelection: {
    crawlAll: false,
    includePatterns: [
      "products",
      "collections",
      "pages",
      "blogs",
      "articles",
      "policies"
    ],
    excludePatterns: ["cdn", "vendors"]
  },
  crawlModes: {
    single: {
      maxPages: 1,
      maxDepth: 0,
      sitemapSelection: {
        crawlAll: false,
        includePatterns: [],
        excludePatterns: []
      }
    },
    seo: {
      maxPages: 700,
      maxDepth: 3
    },
    full: {
      maxPages: 5000,
      maxDepth: 10,
      sitemapSelection: {
        crawlAll: true,
        includePatterns: [],
        excludePatterns: []
      }
    }
  }
};

export default config;
