import type { SeoIssue } from "../types/issue.js";
import { truncate } from "./textUtils.js";

export interface FetchFailureClassification {
  severity: SeoIssue["severity"];
  code: string;
  message: string;
  recommendation: string;
  evidence: string;
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  response?: {
    status?: unknown;
    statusText?: unknown;
  };
  cause?: {
    code?: unknown;
    message?: unknown;
  };
}

export function classifyHttpFetchFailure(status: number, statusText = ""): FetchFailureClassification | null {
  if (status < 400) return null;

  if (status === 403) {
    return classification(
      "high",
      "fetch_blocked_403",
      "Fetch was blocked with HTTP 403.",
      "Check storefront access rules, bot protection, WAF settings, or whether the crawler user-agent is being blocked.",
      { status, statusText }
    );
  }

  if (status === 429) {
    return classification(
      "critical",
      "fetch_rate_limited_429",
      "Fetch was rate limited with HTTP 429.",
      "Slow the crawl, reduce concurrency, increase crawl delay, or retry later when Shopify bot protection is less aggressive.",
      { status, statusText }
    );
  }

  if (status >= 500) {
    return classification(
      "critical",
      "fetch_server_error",
      `Fetch returned server error HTTP ${status}.`,
      "Check server stability, Shopify/app outages, CDN errors, or retry the crawl to confirm whether this is temporary.",
      { status, statusText }
    );
  }

  return classification(
    "critical",
    "fetch_http_error",
    `Fetch returned HTTP ${status}.`,
    "Fix the URL, redirect it to a valid page, or remove it from crawl sources and sitemaps.",
    { status, statusText }
  );
}

export function classifyFetchError(error: unknown): FetchFailureClassification {
  const info = errorInfo(error);
  const status = numberValue(info.response?.status);
  if (status !== undefined) {
    const httpFailure = classifyHttpFetchFailure(status, stringValue(info.response?.statusText));
    if (httpFailure) {
      return withEvidence(httpFailure, info);
    }
  }

  const errorCode = stringValue(info.code) || stringValue(info.cause?.code);
  const message = stringValue(info.message) || stringValue(info.cause?.message) || String(error);
  const lowerMessage = message.toLowerCase();

  if (isTimeout(errorCode, lowerMessage)) {
    return classification(
      "critical",
      "fetch_timeout",
      "Fetch timed out.",
      "Increase timeout, retry later, or check whether the storefront/CDN is slow to respond.",
      { errorCode, message }
    );
  }

  if (isDnsError(errorCode, lowerMessage)) {
    return classification(
      "critical",
      "fetch_dns_error",
      "Fetch failed due to a DNS/network resolution error.",
      "Check the domain, DNS records, network connection, or whether the hostname is temporarily unavailable.",
      { errorCode, message }
    );
  }

  if (isTlsError(errorCode, lowerMessage)) {
    return classification(
      "critical",
      "fetch_tls_error",
      "Fetch failed due to a TLS/SSL error.",
      "Check the SSL certificate, certificate chain, hostname coverage, or CDN TLS configuration.",
      { errorCode, message }
    );
  }

  return classification(
    "critical",
    "fetch_unknown_error",
    "Fetch failed for an unknown reason.",
    "Review the error evidence, retry the URL, and check blocking, network, redirects, timeout, or server availability.",
    { errorCode, message }
  );
}

export function isFetchFailureCode(code: string): boolean {
  return code === "fetch_failed" || code === "http_error" || code.startsWith("fetch_");
}

function classification(
  severity: SeoIssue["severity"],
  code: string,
  message: string,
  recommendation: string,
  evidence: Record<string, unknown>
): FetchFailureClassification {
  return {
    severity,
    code,
    message,
    recommendation,
    evidence: serializeEvidence(evidence)
  };
}

function withEvidence(classified: FetchFailureClassification, info: ErrorLike): FetchFailureClassification {
  const errorCode = stringValue(info.code) || stringValue(info.cause?.code);
  const message = stringValue(info.message) || stringValue(info.cause?.message);
  const extraEvidence = serializeEvidence({ errorCode, message });
  if (!extraEvidence) return classified;

  return {
    ...classified,
    evidence: truncate(`${classified.evidence}; ${extraEvidence}`)
  };
}

function errorInfo(error: unknown): ErrorLike {
  return error && typeof error === "object" ? error as ErrorLike : { message: String(error) };
}

function isTimeout(errorCode: string, lowerMessage: string): boolean {
  const normalizedCode = errorCode.toUpperCase();
  return ["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(normalizedCode) ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out");
}

function isDnsError(errorCode: string, lowerMessage: string): boolean {
  const normalizedCode = errorCode.toUpperCase();
  return ["ENOTFOUND", "EAI_AGAIN", "ENETUNREACH"].includes(normalizedCode) ||
    lowerMessage.includes("getaddrinfo") ||
    lowerMessage.includes("dns") ||
    lowerMessage.includes("name not resolved");
}

function isTlsError(errorCode: string, lowerMessage: string): boolean {
  const normalizedCode = errorCode.toUpperCase();
  return [
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "EPROTO",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  ].includes(normalizedCode) ||
    lowerMessage.includes("certificate") ||
    lowerMessage.includes("ssl") ||
    lowerMessage.includes("tls");
}

function serializeEvidence(values: Record<string, unknown>): string {
  return truncate(Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("; "));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
