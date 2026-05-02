import config from "../config/config.js";

export function normalizeUrl(input: string, base?: string): string {
  const url = new URL(input, base);
  url.hash = "";
  if (!config.crawl.keepQueryStrings) {
    url.search = "";
  }
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function isSameOrigin(url: string, baseUrl: string): boolean {
  return new URL(url).origin === new URL(baseUrl).origin;
}

export function shouldSkipUrl(url: string, baseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return true;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return true;
  if (config.crawl.sameOriginOnly && parsed.origin !== new URL(baseUrl).origin) return true;

  const lowerUrl = parsed.toString().toLowerCase();
  const lowerPath = parsed.pathname.toLowerCase();

  if (config.crawl.excludedExtensions.some((extension) => lowerPath.endsWith(extension))) {
    return true;
  }

  return config.crawl.excludedPathPatterns.some((pattern) => lowerUrl.includes(pattern.toLowerCase()));
}

export function classifyPath(url: string): string {
  const { pathname } = new URL(url);
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/products/")) return "product";
  if (pathname.startsWith("/collections/")) return "collection";
  if (pathname.startsWith("/blogs/") && pathname.split("/").filter(Boolean).length >= 3) return "article";
  if (pathname.startsWith("/blogs/")) return "blog";
  if (pathname.startsWith("/pages/")) return "page";
  if (pathname.startsWith("/policies/")) return "policy";
  if (pathname.startsWith("/cart")) return "cart";
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/account")) return "account";
  return "unknown";
}

export function getHandle(url: string, segment: string): string | undefined {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const index = parts.indexOf(segment);
  return index >= 0 ? parts[index + 1] : undefined;
}
