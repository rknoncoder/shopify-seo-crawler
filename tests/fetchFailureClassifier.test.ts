import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFetchError, classifyHttpFetchFailure, isFetchFailureCode } from "../src/utils/fetchFailureClassifier.js";

describe("fetch failure classifier", () => {
  it("maps HTTP failures to actionable fetch issue codes", () => {
    assert.equal(classifyHttpFetchFailure(200), null);

    assert.deepEqual(pick(classifyHttpFetchFailure(403, "Forbidden")), {
      code: "fetch_blocked_403",
      severity: "high",
      message: "Fetch was blocked with HTTP 403."
    });

    assert.deepEqual(pick(classifyHttpFetchFailure(429, "Too Many Requests")), {
      code: "fetch_rate_limited_429",
      severity: "critical",
      message: "Fetch was rate limited with HTTP 429."
    });

    assert.deepEqual(pick(classifyHttpFetchFailure(503, "Service Unavailable")), {
      code: "fetch_server_error",
      severity: "critical",
      message: "Fetch returned server error HTTP 503."
    });

    assert.deepEqual(pick(classifyHttpFetchFailure(404, "Not Found")), {
      code: "fetch_http_error",
      severity: "critical",
      message: "Fetch returned HTTP 404."
    });
  });

  it("maps timeout, DNS, TLS, and unknown thrown errors", () => {
    assert.equal(classifyFetchError({ code: "ECONNABORTED", message: "timeout of 15000ms exceeded" }).code, "fetch_timeout");
    assert.equal(classifyFetchError({ code: "EAI_AGAIN", message: "getaddrinfo EAI_AGAIN example.com" }).code, "fetch_dns_error");
    assert.equal(classifyFetchError({ code: "CERT_HAS_EXPIRED", message: "certificate has expired" }).code, "fetch_tls_error");
    assert.equal(classifyFetchError({ code: "ECONNRESET", message: "socket hang up" }).code, "fetch_unknown_error");
  });

  it("maps Axios-style response errors before generic code checks", () => {
    const classified = classifyFetchError({
      code: "ERR_BAD_REQUEST",
      message: "Request failed with status code 429",
      response: {
        status: 429,
        statusText: "Too Many Requests"
      }
    });

    assert.equal(classified.code, "fetch_rate_limited_429");
    assert.match(classified.evidence, /status=429/);
    assert.match(classified.evidence, /errorCode=ERR_BAD_REQUEST/);
  });

  it("keeps compatibility with legacy fetch failure issue codes", () => {
    assert.equal(isFetchFailureCode("fetch_failed"), true);
    assert.equal(isFetchFailureCode("http_error"), true);
    assert.equal(isFetchFailureCode("fetch_timeout"), true);
    assert.equal(isFetchFailureCode("missing_title"), false);
  });
});

function pick(result: ReturnType<typeof classifyHttpFetchFailure>): { code: string; severity: string; message: string } | null {
  if (!result) return null;
  return {
    code: result.code,
    severity: result.severity,
    message: result.message
  };
}
