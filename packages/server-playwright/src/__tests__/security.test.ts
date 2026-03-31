import { describe, it, expect, vi } from "vitest";
import { validateUrl } from "../security/url-validator.js";
import { redactSensitiveContent } from "../security/credential-redactor.js";
import { sanitizeBrowserArgs } from "../security/arg-sanitizer.js";
import { validateSelectorValue } from "../security/selector-validator.js";
import { BAPServerError } from "../errors.js";
import { DEFAULT_OPTIONS } from "../config.js";
import type { ResolvedOptions } from "../config.js";

/**
 * Unit tests for the four security modules in packages/server-playwright/src/security/.
 * Each describe block covers one module with happy-path, edge-case, and error-path tests.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a ResolvedOptions with defaults, accepting partial security overrides. */
function makeOptions(
  securityOverrides: Partial<ResolvedOptions["security"]> = {}
): ResolvedOptions {
  return {
    ...DEFAULT_OPTIONS,
    security: { ...DEFAULT_OPTIONS.security, ...securityOverrides },
  };
}

const noopLog = () => {};

// ===========================================================================
// url-validator.ts
// ===========================================================================

describe("validateUrl", () => {
  describe("blocked protocols", () => {
    it("should throw BAPServerError when protocol is javascript:", () => {
      expect(() => validateUrl("javascript:alert(1)", makeOptions(), noopLog)).toThrow(
        BAPServerError
      );
    });

    it("should throw BAPServerError when protocol is data:", () => {
      expect(() => validateUrl("data:text/html,<h1>hi</h1>", makeOptions(), noopLog)).toThrow(
        BAPServerError
      );
    });

    it("should throw BAPServerError when protocol is file:", () => {
      expect(() => validateUrl("file:///etc/passwd", makeOptions(), noopLog)).toThrow(
        BAPServerError
      );
    });

    it("should throw BAPServerError when protocol is vbscript:", () => {
      expect(() => validateUrl("vbscript:MsgBox(1)", makeOptions(), noopLog)).toThrow(
        BAPServerError
      );
    });

    it("should include recovery hint for blocked protocols", () => {
      try {
        validateUrl("javascript:void(0)", makeOptions(), noopLog);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(BAPServerError);
        expect((err as BAPServerError).recoveryHint).toContain("https://");
      }
    });
  });

  describe("cloud metadata endpoints", () => {
    it("should block AWS metadata IP 169.254.169.254", () => {
      expect(() =>
        validateUrl("http://169.254.169.254/latest/meta-data/", makeOptions(), noopLog)
      ).toThrow(/cloud metadata/i);
    });

    it("should block GCP metadata hostname", () => {
      expect(() =>
        validateUrl("http://metadata.google.internal/computeMetadata/v1/", makeOptions(), noopLog)
      ).toThrow(/cloud metadata/i);
    });

    it("should block Alibaba Cloud metadata IP", () => {
      expect(() =>
        validateUrl("http://100.100.100.200/latest/meta-data/", makeOptions(), noopLog)
      ).toThrow(/cloud metadata/i);
    });
  });

  describe("valid URLs", () => {
    it("should accept https URLs", () => {
      expect(() => validateUrl("https://example.com", makeOptions(), noopLog)).not.toThrow();
    });

    it("should accept http URLs", () => {
      expect(() =>
        validateUrl("http://example.com/page?q=1", makeOptions(), noopLog)
      ).not.toThrow();
    });
  });

  describe("malformed URLs", () => {
    it("should throw BAPServerError for completely invalid URL", () => {
      expect(() => validateUrl("not-a-url", makeOptions(), noopLog)).toThrow(BAPServerError);
    });

    it("should throw BAPServerError for empty string", () => {
      expect(() => validateUrl("", makeOptions(), noopLog)).toThrow(BAPServerError);
    });
  });

  describe("allowedProtocols override", () => {
    it("should block http when only https is allowed", () => {
      const opts = makeOptions({ allowedProtocols: ["https"] });
      expect(() => validateUrl("http://example.com", opts, noopLog)).toThrow(
        /Protocol not allowed/
      );
    });

    it("should allow https when only https is allowed", () => {
      const opts = makeOptions({ allowedProtocols: ["https"] });
      expect(() => validateUrl("https://example.com", opts, noopLog)).not.toThrow();
    });
  });

  describe("allowedHosts override", () => {
    it("should block hosts not in the allowlist", () => {
      const opts = makeOptions({ allowedHosts: ["trusted.com"] });
      expect(() => validateUrl("https://evil.com", opts, noopLog)).toThrow(/Host not allowed/);
    });

    it("should allow exact host match", () => {
      const opts = makeOptions({ allowedHosts: ["trusted.com"] });
      expect(() => validateUrl("https://trusted.com/path", opts, noopLog)).not.toThrow();
    });

    it("should support wildcard subdomain patterns", () => {
      const opts = makeOptions({ allowedHosts: ["*.example.com"] });
      expect(() => validateUrl("https://sub.example.com", opts, noopLog)).not.toThrow();
    });

    it("should allow bare domain for wildcard pattern", () => {
      const opts = makeOptions({ allowedHosts: ["*.example.com"] });
      expect(() => validateUrl("https://example.com", opts, noopLog)).not.toThrow();
    });
  });

  describe("internal IP warnings", () => {
    it("should log warning for localhost but not throw", () => {
      const log = vi.fn();
      expect(() => validateUrl("http://localhost:3000", makeOptions(), log)).not.toThrow();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("internal address"));
    });

    it("should log warning for 127.x.x.x addresses", () => {
      const log = vi.fn();
      validateUrl("http://127.0.0.1:8080", makeOptions(), log);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("internal address"));
    });

    it("should log warning for 192.168.x.x addresses", () => {
      const log = vi.fn();
      validateUrl("http://192.168.1.1", makeOptions(), log);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("internal address"));
    });
  });
});

// ===========================================================================
// credential-redactor.ts
// ===========================================================================

describe("redactSensitiveContent", () => {
  describe("password input redaction", () => {
    it("should redact password input values (type before value)", () => {
      const html =
        "<form>" + "x".repeat(100) + '<input type="password" value="s3cret" name="pw">' + "</form>";
      const result = redactSensitiveContent(html);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("s3cret");
    });

    it("should redact password input values (value before type)", () => {
      const html =
        "<form>" + "x".repeat(100) + '<input value="s3cret" type="password" name="pw">' + "</form>";
      const result = redactSensitiveContent(html);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("s3cret");
    });
  });

  describe("JWT Bearer token redaction", () => {
    it("should redact JWT Bearer tokens", () => {
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-DEF_123";
      const html = "x".repeat(100) + `"Bearer ${jwt}"`;
      const result = redactSensitiveContent(html);
      expect(result).toContain("[REDACTED_JWT]");
      expect(result).not.toContain(jwt);
    });
  });

  describe("data-sensitive attribute redaction", () => {
    it("should redact inputs with data-sensitive attribute", () => {
      const html = "x".repeat(100) + '<input data-sensitive value="secret-value" name="ssn">';
      const result = redactSensitiveContent(html);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("secret-value");
    });

    it("should redact data-password attributes", () => {
      const html = "x".repeat(100) + '<div data-password="my-pass">hidden</div>';
      const result = redactSensitiveContent(html);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("my-pass");
    });

    it("should redact data-token attributes", () => {
      const html = "x".repeat(100) + '<span data-token="abc123">token</span>';
      const result = redactSensitiveContent(html);
      expect(result).toContain("[REDACTED]");
      expect(result).not.toContain("abc123");
    });
  });

  describe("non-sensitive content", () => {
    it("should leave regular text inputs untouched", () => {
      const html = "x".repeat(100) + '<input type="text" value="hello" name="username">';
      const result = redactSensitiveContent(html);
      expect(result).toContain("hello");
    });

    it("should return short strings unchanged (fast path)", () => {
      const html = '<input type="password" value="s3cret">';
      // Under 100 chars, the fast path returns early without redaction
      expect(redactSensitiveContent(html)).toBe(html);
    });
  });
});

// ===========================================================================
// arg-sanitizer.ts
// ===========================================================================

describe("sanitizeBrowserArgs", () => {
  describe("safe arguments", () => {
    it("should allow --no-sandbox", () => {
      const result = sanitizeBrowserArgs(["--no-sandbox"], noopLog);
      expect(result).toContain("--no-sandbox");
    });

    it("should allow --disable-gpu", () => {
      const result = sanitizeBrowserArgs(["--disable-gpu"], noopLog);
      expect(result).toContain("--disable-gpu");
    });

    it("should allow --window-size with valid dimensions", () => {
      const result = sanitizeBrowserArgs(["--window-size=1920,1080"], noopLog);
      expect(result).toContain("--window-size=1920,1080");
    });

    it("should allow --incognito", () => {
      const result = sanitizeBrowserArgs(["--incognito"], noopLog);
      expect(result).toContain("--incognito");
    });
  });

  describe("dangerous arguments blocked", () => {
    it("should block --remote-debugging-port", () => {
      const log = vi.fn();
      const result = sanitizeBrowserArgs(["--remote-debugging-port=9222"], log);
      expect(result).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Blocked"));
    });

    it("should block --disable-web-security", () => {
      const log = vi.fn();
      const result = sanitizeBrowserArgs(["--disable-web-security"], log);
      expect(result).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Blocked"));
    });

    it("should block --user-data-dir", () => {
      const log = vi.fn();
      const result = sanitizeBrowserArgs(["--user-data-dir=/tmp/evil"], log);
      expect(result).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Blocked"));
    });

    it("should block --load-extension", () => {
      const log = vi.fn();
      const result = sanitizeBrowserArgs(["--load-extension=/path/ext"], log);
      expect(result).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Blocked"));
    });

    it("should block --reduce-security-for-testing", () => {
      const log = vi.fn();
      const result = sanitizeBrowserArgs(["--reduce-security-for-testing"], log);
      expect(result).toHaveLength(0);
    });
  });

  describe("unknown arguments filtered", () => {
    it("should filter out unrecognized arguments", () => {
      const log = vi.fn();
      const result = sanitizeBrowserArgs(["--some-random-flag"], log);
      expect(result).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Unknown"));
    });
  });

  describe("mixed arguments", () => {
    it("should keep safe args and remove dangerous ones", () => {
      const result = sanitizeBrowserArgs(
        ["--no-sandbox", "--disable-web-security", "--disable-gpu"],
        noopLog
      );
      expect(result).toEqual(["--no-sandbox", "--disable-gpu"]);
    });
  });

  describe("empty and undefined input", () => {
    it("should return empty array for undefined args", () => {
      const result = sanitizeBrowserArgs(undefined, noopLog);
      expect(result).toEqual([]);
    });

    it("should return empty array for empty args", () => {
      const result = sanitizeBrowserArgs([], noopLog);
      expect(result).toEqual([]);
    });
  });
});

// ===========================================================================
// selector-validator.ts
// ===========================================================================

describe("validateSelectorValue", () => {
  const noopSecLog = () => {};

  describe("valid selectors", () => {
    it("should accept a normal CSS selector", () => {
      expect(() => validateSelectorValue("div.container > p", "css", noopSecLog)).not.toThrow();
    });

    it("should accept a normal XPath selector", () => {
      expect(() =>
        validateSelectorValue("//div[@class='main']", "xpath", noopSecLog)
      ).not.toThrow();
    });

    it("should accept a text selector", () => {
      expect(() => validateSelectorValue("Click me", "text", noopSecLog)).not.toThrow();
    });
  });

  describe("CSS injection prevention", () => {
    it("should block javascript: in CSS url()", () => {
      const log = vi.fn();
      expect(() =>
        validateSelectorValue("div[style*='url(javascript:alert(1))']", "css", log)
      ).toThrow(/javascript.*not allowed/i);
      expect(log).toHaveBeenCalledWith("SELECTOR_INJECTION", expect.any(Object));
    });

    it("should block expression() in CSS selectors", () => {
      const log = vi.fn();
      expect(() => validateSelectorValue("div[style*='expression(alert(1))']", "css", log)).toThrow(
        /expression.*not allowed/i
      );
      expect(log).toHaveBeenCalledWith("SELECTOR_INJECTION", expect.any(Object));
    });
  });

  describe("XPath injection prevention", () => {
    it("should block document() in XPath", () => {
      const log = vi.fn();
      expect(() => validateSelectorValue("document('http://evil.com')/root", "xpath", log)).toThrow(
        /document.*not allowed/i
      );
      expect(log).toHaveBeenCalledWith("SELECTOR_INJECTION", expect.any(Object));
    });
  });

  describe("empty and oversized selectors", () => {
    it("should throw for empty selector value", () => {
      expect(() => validateSelectorValue("", "css", noopSecLog)).toThrow(/empty/i);
    });

    it("should throw for whitespace-only selector value", () => {
      expect(() => validateSelectorValue("   ", "css", noopSecLog)).toThrow(/empty/i);
    });

    it("should throw for selector exceeding max length", () => {
      const log = vi.fn();
      const longSelector = "a".repeat(10001);
      expect(() => validateSelectorValue(longSelector, "css", log)).toThrow(/too long/i);
      expect(log).toHaveBeenCalledWith("SELECTOR_TOO_LONG", expect.any(Object));
    });
  });

  describe("type-specific validation scoping", () => {
    it("should not block expression() for non-CSS selector types", () => {
      // expression() is only dangerous in CSS context
      expect(() => validateSelectorValue("expression(test)", "text", noopSecLog)).not.toThrow();
    });

    it("should not block document() for non-XPath selector types", () => {
      // document() is only dangerous in XPath context
      expect(() => validateSelectorValue("document(test)", "css", noopSecLog)).not.toThrow();
    });
  });
});
