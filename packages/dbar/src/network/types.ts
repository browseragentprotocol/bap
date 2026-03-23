import { createHash } from "node:crypto";

// Re-export the capsule-level NetworkEntry for convenience
export {
  NetworkEntrySchema,
  type NetworkEntry,
  NetworkTranscriptSchema,
  type NetworkTranscript,
} from "../capsule/types.js";

/**
 * Headers included in the canonical request hash. Only headers that affect
 * response content are included so that non-deterministic headers (e.g.,
 * request IDs, timestamps) do not cause hash mismatches during replay.
 */
const DETERMINISTIC_HEADERS = ["content-type", "accept", "accept-language", "range"];

/**
 * Headers redacted from stored transcripts to prevent credential leakage
 * in capsule files.
 */
const REDACTED_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-csrf-token",
  "x-auth-token",
  "proxy-authorization",
];

/**
 * Replaces values of sensitive headers with "[REDACTED]" for safe storage.
 * Matching is case-insensitive.
 *
 * @param headers - Raw HTTP headers as key-value pairs.
 * @returns A new headers object with sensitive values replaced.
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (REDACTED_HEADERS.includes(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Produces a deterministic SHA-256 hex digest for a network request.
 * The hash includes: HTTP method, canonicalized URL (fragment stripped,
 * query params sorted), deterministic headers, and body content hash.
 *
 * Two requests with the same semantic content produce the same hash,
 * regardless of header ordering or URL fragment differences.
 *
 * @param request - The request to hash.
 * @returns 64-character lowercase hex SHA-256 digest.
 */
export function hashRequest(request: {
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: string;
}): string {
  const hash = createHash("sha256");
  hash.update(request.method);

  const url = canonicalizeUrl(request.url);
  hash.update(url);

  // Only include deterministic headers, sorted for stability
  const headerEntries: string[] = [];
  for (const key of DETERMINISTIC_HEADERS) {
    const value = findHeaderValue(request.headers, key);
    if (value !== undefined) {
      headerEntries.push(`${key}:${value}`);
    }
  }
  headerEntries.sort();
  hash.update(headerEntries.join("\n"));

  if (request.postData) {
    hash.update(createHash("sha256").update(request.postData).digest("hex"));
  }

  return hash.digest("hex");
}

/**
 * Computes a SHA-256 hex digest for a response body.
 *
 * @param body - The body string (plain or base64-encoded).
 * @param base64Encoded - Whether the body is base64-encoded.
 * @returns 64-character lowercase hex SHA-256 digest.
 */
export function hashBody(body: string, base64Encoded: boolean): string {
  const hash = createHash("sha256");
  if (base64Encoded) {
    hash.update(Buffer.from(body, "base64"));
  } else {
    hash.update(body);
  }
  return hash.digest("hex");
}

/**
 * Computes a SHA-256 hex digest for a raw Buffer.
 *
 * @param buffer - The buffer to hash.
 * @returns 64-character lowercase hex SHA-256 digest.
 */
export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Strips the URL fragment and sorts query parameters for deterministic comparison.
 * Returns the raw string unchanged if it cannot be parsed as a URL.
 */
function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return raw;
  }
}

/**
 * Case-insensitive header value lookup.
 */
function findHeaderValue(headers: Record<string, string>, key: string): string | undefined {
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowerKey) return v;
  }
  return undefined;
}

/**
 * Detects Server-Sent Events by checking the content-type header.
 *
 * @param headers - Response headers.
 * @returns True if the content-type indicates an SSE stream.
 */
export function isSSE(headers: Record<string, string>): boolean {
  const ct = findHeaderValue(headers, "content-type");
  return ct !== undefined && ct.toLowerCase().includes("text/event-stream");
}

/**
 * Detects WebSocket URLs by protocol scheme.
 *
 * @param url - The URL to check.
 * @returns True if the URL uses ws:// or wss:// scheme.
 */
export function isWebSocket(url: string): boolean {
  return url.startsWith("wss://") || url.startsWith("ws://");
}

/**
 * In-memory mutable transcript used during recording.
 * Tracks hash occurrence counts for deduplication during replay matching.
 */
export interface MutableNetworkTranscript {
  orderingPolicy: "creation" | "recorded";
  entries: MutableNetworkEntry[];
  hashOccurrences: Map<string, number>;
}

/**
 * In-memory mutable network entry used during recording.
 * Extends the capsule NetworkEntry schema with the optional networkId
 * field used for CDP cross-referencing.
 */
export interface MutableNetworkEntry {
  index: number;
  requestId: string;
  networkId?: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  requestHash: string;
  occurrenceIndex: number;
  timestamp: number;
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string; // base64
    bodyHash: string;
  };
  error?: {
    errorText: string;
    canceled: boolean;
    blockedReason?: string;
  };
}

/**
 * Creates an empty mutable transcript for use by NetworkRecorder.
 *
 * @returns A fresh transcript with "recorded" ordering and empty entries.
 */
export function createTranscript(): MutableNetworkTranscript {
  return {
    orderingPolicy: "recorded",
    entries: [],
    hashOccurrences: new Map(),
  };
}
