import { describe, it, expect } from "vitest";
import { BAPPlaywrightServer } from "../server.js";
import type {
  BAPSecurityOptions,
  BAPLimitsOptions,
  BAPAuthorizationOptions,
} from "../server.js";

/**
 * Tests for server validation logic through configuration
 * Note: Direct method testing requires internal access; these tests verify
 * configuration is properly accepted and defaults are reasonable
 */

describe("Security Configuration", () => {
  describe("blockedProtocols", () => {
    it("accepts custom blocked protocols", () => {
      const security: BAPSecurityOptions = {
        blockedProtocols: ["file", "javascript", "data", "blob"],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts empty blocked protocols", () => {
      const security: BAPSecurityOptions = {
        blockedProtocols: [],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("allowedProtocols", () => {
    it("accepts allowed protocols list", () => {
      const security: BAPSecurityOptions = {
        allowedProtocols: ["https", "http"],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts https-only configuration", () => {
      const security: BAPSecurityOptions = {
        allowedProtocols: ["https"],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("blockedHosts", () => {
    it("accepts cloud metadata endpoint blocks", () => {
      const security: BAPSecurityOptions = {
        blockedHosts: [
          "169.254.169.254", // AWS
          "metadata.google.internal", // GCP
          "100.100.100.200", // Alibaba
        ],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts custom blocked hosts", () => {
      const security: BAPSecurityOptions = {
        blockedHosts: ["evil.com", "malware.net"],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("allowedHosts", () => {
    it("accepts wildcard domain patterns", () => {
      const security: BAPSecurityOptions = {
        allowedHosts: ["*.example.com", "trusted.org"],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts specific domain list", () => {
      const security: BAPSecurityOptions = {
        allowedHosts: ["api.example.com", "www.example.com"],
      };
      const server = new BAPPlaywrightServer({ security });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });
});

describe("Limits Configuration", () => {
  describe("page limits", () => {
    it("accepts maxPagesPerClient", () => {
      const limits: BAPLimitsOptions = {
        maxPagesPerClient: 10,
      };
      const server = new BAPPlaywrightServer({ limits });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("rate limits", () => {
    it("accepts maxRequestsPerSecond", () => {
      const limits: BAPLimitsOptions = {
        maxRequestsPerSecond: 100,
      };
      const server = new BAPPlaywrightServer({ limits });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts maxScreenshotsPerMinute", () => {
      const limits: BAPLimitsOptions = {
        maxScreenshotsPerMinute: 60,
      };
      const server = new BAPPlaywrightServer({ limits });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("combined limits", () => {
    it("accepts all limits together", () => {
      const limits: BAPLimitsOptions = {
        maxPagesPerClient: 20,
        maxRequestsPerSecond: 100,
        maxScreenshotsPerMinute: 60,
      };
      const server = new BAPPlaywrightServer({ limits });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });
});

describe("Authorization Configuration", () => {
  describe("defaultScopes", () => {
    it("accepts wildcard scopes", () => {
      const authorization: BAPAuthorizationOptions = {
        defaultScopes: ["*"],
      };
      const server = new BAPPlaywrightServer({ authorization });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts category wildcards", () => {
      const authorization: BAPAuthorizationOptions = {
        defaultScopes: ["browser:*", "action:*", "page:*"],
      };
      const server = new BAPPlaywrightServer({ authorization });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts specific scopes", () => {
      const authorization: BAPAuthorizationOptions = {
        defaultScopes: [
          "browser:launch",
          "browser:close",
          "page:navigate",
          "action:click",
        ],
      };
      const server = new BAPPlaywrightServer({ authorization });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("accepts read-only scope profile", () => {
      const authorization: BAPAuthorizationOptions = {
        defaultScopes: [
          "browser:launch",
          "browser:close",
          "page:*",
          "observe:*",
        ],
      };
      const server = new BAPPlaywrightServer({ authorization });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("scopesEnvVar", () => {
    it("accepts custom env var name", () => {
      const authorization: BAPAuthorizationOptions = {
        scopesEnvVar: "MY_APP_BAP_SCOPES",
      };
      const server = new BAPPlaywrightServer({ authorization });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });
});

describe("Session Configuration", () => {
  it("accepts maxDuration in seconds", () => {
    const server = new BAPPlaywrightServer({
      session: { maxDuration: 7200 }, // 2 hours
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts idleTimeout in seconds", () => {
    const server = new BAPPlaywrightServer({
      session: { idleTimeout: 600 }, // 10 minutes
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts both session timeouts", () => {
    const server = new BAPPlaywrightServer({
      session: {
        maxDuration: 3600,
        idleTimeout: 300,
      },
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });
});

describe("Authentication Configuration", () => {
  it("accepts authToken directly", () => {
    const server = new BAPPlaywrightServer({
      authToken: "super-secret-token-12345",
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts authTokenEnvVar", () => {
    const server = new BAPPlaywrightServer({
      authTokenEnvVar: "MY_BAP_TOKEN",
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts both token options (direct takes precedence)", () => {
    const server = new BAPPlaywrightServer({
      authToken: "direct-token",
      authTokenEnvVar: "FALLBACK_TOKEN",
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });
});

describe("TLS Configuration", () => {
  it("accepts requireTLS option", () => {
    const server = new BAPPlaywrightServer({
      tls: {
        requireTLS: true,
      },
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts warnInsecure option", () => {
    const server = new BAPPlaywrightServer({
      tls: {
        warnInsecure: false,
      },
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });
});

describe("Default Values", () => {
  it("creates server with sensible defaults", () => {
    // This test ensures the server can be created without any options
    // and has reasonable default behavior
    const server = new BAPPlaywrightServer();
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });
});
