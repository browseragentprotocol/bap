import { describe, it, expect } from "vitest";
import {
  redactHeaders,
  hashRequest,
  hashBody,
  hashBuffer,
  isSSE,
  isWebSocket,
  createTranscript,
} from "../network/types.js";

describe("redactHeaders", () => {
  it("shouldRedactSensitiveHeaders", () => {
    // Given headers containing authorization and cookie
    const headers = {
      Authorization: "Bearer token123",
      Cookie: "session=abc",
      "Content-Type": "application/json",
    };
    // When redacted
    const result = redactHeaders(headers);
    // Then sensitive headers are replaced with [REDACTED]
    expect(result["Authorization"]).toBe("[REDACTED]");
    expect(result["Cookie"]).toBe("[REDACTED]");
    // And non-sensitive headers are preserved
    expect(result["Content-Type"]).toBe("application/json");
  });

  it("shouldRedactAllKnownSensitiveHeaders", () => {
    // Given all known sensitive header names
    const headers: Record<string, string> = {
      authorization: "Bearer x",
      cookie: "c=1",
      "set-cookie": "c=2",
      "x-api-key": "key",
      "x-csrf-token": "csrf",
      "x-auth-token": "auth",
      "proxy-authorization": "Basic x",
    };
    // When redacted
    const result = redactHeaders(headers);
    // Then all are redacted
    for (const value of Object.values(result)) {
      expect(value).toBe("[REDACTED]");
    }
  });

  it("shouldReturnEmptyObjectForEmptyInput", () => {
    // Given empty headers
    // When redacted
    const result = redactHeaders({});
    // Then result is empty
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("shouldHandleCaseInsensitiveMatching", () => {
    // Given headers with mixed casing
    const headers = { AUTHORIZATION: "secret", "X-API-KEY": "key123" };
    // When redacted
    const result = redactHeaders(headers);
    // Then both are redacted (case-insensitive match)
    expect(result["AUTHORIZATION"]).toBe("[REDACTED]");
    expect(result["X-API-KEY"]).toBe("[REDACTED]");
  });
});

describe("hashRequest", () => {
  it("shouldProduceDeterministicHashForSameRequest", () => {
    // Given the same request called twice
    const request = {
      method: "GET",
      url: "https://example.com/api?b=2&a=1",
      headers: { "Content-Type": "application/json" },
    };
    // When hashed twice
    const hash1 = hashRequest(request);
    const hash2 = hashRequest(request);
    // Then hashes match
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("shouldSortQueryParametersForCanonicalUrl", () => {
    // Given two URLs with same params in different order
    const req1 = { method: "GET", url: "https://example.com?b=2&a=1", headers: {} };
    const req2 = { method: "GET", url: "https://example.com?a=1&b=2", headers: {} };
    // When hashed
    // Then hashes are equal (query params are sorted)
    expect(hashRequest(req1)).toBe(hashRequest(req2));
  });

  it("shouldStripFragmentFromUrl", () => {
    // Given two URLs differing only in fragment
    const req1 = { method: "GET", url: "https://example.com/page#section1", headers: {} };
    const req2 = { method: "GET", url: "https://example.com/page#section2", headers: {} };
    // When hashed
    // Then hashes are equal (fragments stripped)
    expect(hashRequest(req1)).toBe(hashRequest(req2));
  });

  it("shouldIncludeOnlyDeterministicHeaders", () => {
    // Given requests differing only in a non-deterministic header
    const req1 = { method: "GET", url: "https://example.com", headers: { "x-request-id": "abc" } };
    const req2 = { method: "GET", url: "https://example.com", headers: { "x-request-id": "xyz" } };
    // When hashed
    // Then hashes are equal (x-request-id is not deterministic)
    expect(hashRequest(req1)).toBe(hashRequest(req2));
  });

  it("shouldDifferWhenDeterministicHeadersDiffer", () => {
    // Given requests differing in content-type (a deterministic header)
    const req1 = {
      method: "GET",
      url: "https://example.com",
      headers: { "content-type": "text/html" },
    };
    const req2 = {
      method: "GET",
      url: "https://example.com",
      headers: { "content-type": "application/json" },
    };
    // When hashed
    // Then hashes differ
    expect(hashRequest(req1)).not.toBe(hashRequest(req2));
  });

  it("shouldIncludePostDataInHash", () => {
    // Given two POST requests with different bodies
    const req1 = { method: "POST", url: "https://example.com", headers: {}, postData: '{"a":1}' };
    const req2 = { method: "POST", url: "https://example.com", headers: {}, postData: '{"a":2}' };
    // When hashed
    // Then hashes differ
    expect(hashRequest(req1)).not.toBe(hashRequest(req2));
  });

  it("shouldDifferByMethod", () => {
    // Given requests with different methods
    const req1 = { method: "GET", url: "https://example.com", headers: {} };
    const req2 = { method: "POST", url: "https://example.com", headers: {} };
    // When hashed
    // Then hashes differ
    expect(hashRequest(req1)).not.toBe(hashRequest(req2));
  });

  it("shouldHandleInvalidUrlGracefully", () => {
    // Given a request with a malformed URL
    const request = { method: "GET", url: "not-a-url", headers: {} };
    // When hashed
    // Then it does not throw and returns a valid hash
    const hash = hashRequest(request);
    expect(hash).toHaveLength(64);
  });

  it("shouldMatchHeadersCaseInsensitively", () => {
    // Given headers with different casing for the same deterministic header
    const req1 = {
      method: "GET",
      url: "https://example.com",
      headers: { "Content-Type": "text/html" },
    };
    const req2 = {
      method: "GET",
      url: "https://example.com",
      headers: { "content-type": "text/html" },
    };
    // When hashed
    // Then hashes are equal
    expect(hashRequest(req1)).toBe(hashRequest(req2));
  });
});

describe("hashBody", () => {
  it("shouldHashPlainTextBody", () => {
    // Given a plain text body
    const hash = hashBody("hello world", false);
    // Then it returns a valid SHA-256 hex
    expect(hash).toHaveLength(64);
  });

  it("shouldHashBase64Body", () => {
    // Given a base64-encoded body
    const plain = Buffer.from("hello world").toString("base64");
    const hashFromBase64 = hashBody(plain, true);
    const hashFromPlain = hashBody("hello world", false);
    // Then base64 decode produces same hash as raw string
    expect(hashFromBase64).toBe(hashFromPlain);
  });

  it("shouldProduceDifferentHashesForDifferentBodies", () => {
    // Given two different bodies
    const hash1 = hashBody("body1", false);
    const hash2 = hashBody("body2", false);
    // Then hashes differ
    expect(hash1).not.toBe(hash2);
  });
});

describe("hashBuffer", () => {
  it("shouldHashBuffer", () => {
    // Given a buffer
    const buf = Buffer.from("test data");
    const hash = hashBuffer(buf);
    // Then it returns a valid SHA-256 hex
    expect(hash).toHaveLength(64);
  });

  it("shouldMatchHashBodyForSameContent", () => {
    // Given the same content as buffer and as string
    const content = "identical content";
    const bufHash = hashBuffer(Buffer.from(content));
    const strHash = hashBody(content, false);
    // Then hashes match
    expect(bufHash).toBe(strHash);
  });
});

describe("isSSE", () => {
  it("shouldDetectSSEContentType", () => {
    // Given headers with text/event-stream
    expect(isSSE({ "content-type": "text/event-stream" })).toBe(true);
    expect(isSSE({ "Content-Type": "text/event-stream; charset=utf-8" })).toBe(true);
  });

  it("shouldReturnFalseForNonSSE", () => {
    // Given headers without SSE
    expect(isSSE({ "content-type": "application/json" })).toBe(false);
    expect(isSSE({})).toBe(false);
  });
});

describe("isWebSocket", () => {
  it("shouldDetectWebSocketUrls", () => {
    expect(isWebSocket("ws://localhost:8080")).toBe(true);
    expect(isWebSocket("wss://example.com/socket")).toBe(true);
  });

  it("shouldReturnFalseForHttpUrls", () => {
    expect(isWebSocket("http://example.com")).toBe(false);
    expect(isWebSocket("https://example.com")).toBe(false);
  });
});

describe("createTranscript", () => {
  it("shouldCreateEmptyTranscript", () => {
    // When creating a new transcript
    const transcript = createTranscript();
    // Then it has default values
    expect(transcript.orderingPolicy).toBe("recorded");
    expect(transcript.entries).toHaveLength(0);
    expect(transcript.hashOccurrences.size).toBe(0);
  });
});
