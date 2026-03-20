/**
 * @fileoverview Credential and sensitive content redaction
 * @module @browseragentprotocol/server-playwright/security/credential-redactor
 */

// PERF: Pre-compiled regex patterns for credential redaction
const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Password input values (type before value)
  {
    pattern: /(<input[^>]*type\s*=\s*["']password["'][^>]*value\s*=\s*["'])([^"']*)(['"])/gi,
    replacement: "$1[REDACTED]$3",
  },
  // Password input values (value before type)
  {
    pattern: /(<input[^>]*value\s*=\s*["'])([^"']*)(['"][^>]*type\s*=\s*["']password["'])/gi,
    replacement: "$1[REDACTED]$3",
  },
  // Inputs with data-sensitive attribute
  {
    pattern: /(<input[^>]*data-sensitive[^>]*value\s*=\s*["'])([^"']*)(['"])/gi,
    replacement: "$1[REDACTED]$3",
  },
  // Sensitive data attributes
  {
    pattern: /(data-(?:password|secret|token|api-key|credential|auth)\s*=\s*["'])([^"']*)(['"])/gi,
    replacement: "$1[REDACTED]$3",
  },
  // JWT Bearer tokens
  {
    pattern: /(["'])Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+(['"])/gi,
    replacement: "$1[REDACTED_JWT]$2",
  },
];

/**
 * SECURITY: Redact sensitive content from HTML to prevent credential theft.
 * PERF: Uses pre-compiled regex patterns.
 */
export function redactSensitiveContent(html: string): string {
  if (html.length < 100) return html;

  for (const { pattern, replacement } of REDACT_PATTERNS) {
    pattern.lastIndex = 0;
    html = html.replace(pattern, replacement);
  }
  return html;
}
