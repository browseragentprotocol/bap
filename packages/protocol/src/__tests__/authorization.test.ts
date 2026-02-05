import { describe, it, expect } from "vitest";
import {
  hasScope,
  parseScopes,
  isValidScope,
  validateTokenClaims,
  ScopeProfiles,
  MethodScopes,
  type BAPScope,
} from "../authorization.js";

describe("hasScope()", () => {
  describe("method-based scope checking", () => {
    it("returns true when client has required scope for method", () => {
      expect(hasScope(["action:click"], "action/click")).toBe(true);
    });

    it("returns false when client lacks required scope for method", () => {
      expect(hasScope(["observe:screenshot"], "action/click")).toBe(false);
    });

    it("returns true when scope is in granted list", () => {
      expect(
        hasScope(["observe:screenshot", "action:click", "page:navigate"], "action/click")
      ).toBe(true);
    });

    it("returns true for lifecycle methods with empty required scopes", () => {
      expect(hasScope([], "initialize")).toBe(true);
      expect(hasScope([], "shutdown")).toBe(true);
    });
  });

  describe("wildcard matching", () => {
    it("* matches any method", () => {
      expect(hasScope(["*"], "action/click")).toBe(true);
      expect(hasScope(["*"], "observe/screenshot")).toBe(true);
      expect(hasScope(["*"], "page/navigate")).toBe(true);
    });

    it("category:* matches all methods in that category", () => {
      expect(hasScope(["action:*"], "action/click")).toBe(true);
      expect(hasScope(["action:*"], "action/fill")).toBe(true);
      expect(hasScope(["action:*"], "action/type")).toBe(true);
    });

    it("category:* does not match other categories", () => {
      expect(hasScope(["action:*"], "observe/screenshot")).toBe(false);
      expect(hasScope(["action:*"], "page/navigate")).toBe(false);
    });
  });

  describe("empty scopes", () => {
    it("returns false for empty scope list on non-lifecycle methods", () => {
      expect(hasScope([], "action/click")).toBe(false);
    });
  });

  describe("multiple wildcards", () => {
    it("supports multiple category wildcards", () => {
      const scopes: BAPScope[] = ["action:*", "observe:*"];
      expect(hasScope(scopes, "action/click")).toBe(true);
      expect(hasScope(scopes, "observe/screenshot")).toBe(true);
      expect(hasScope(scopes, "page/navigate")).toBe(false);
    });
  });

  describe("unknown methods", () => {
    it("requires wildcard for unknown methods", () => {
      expect(hasScope(["*"], "custom/unknown")).toBe(true);
      expect(hasScope(["action:*"], "custom/unknown")).toBe(false);
    });
  });
});

describe("parseScopes()", () => {
  it("parses comma-separated string", () => {
    const scopes = parseScopes("action:click, observe:screenshot, page:navigate");
    expect(scopes).toEqual(["action:click", "observe:screenshot", "page:navigate"]);
  });

  it("trims whitespace", () => {
    const scopes = parseScopes("  action:click  ,  observe:screenshot  ");
    expect(scopes).toEqual(["action:click", "observe:screenshot"]);
  });

  it("passes through arrays with valid scopes", () => {
    const input: BAPScope[] = ["action:click", "observe:screenshot"];
    const scopes = parseScopes(input);
    expect(scopes).toEqual(input);
  });

  it("handles single scope string", () => {
    const scopes = parseScopes("action:click");
    expect(scopes).toEqual(["action:click"]);
  });

  it("filters out invalid scopes from string", () => {
    const scopes = parseScopes("action:click, invalid:scope, observe:screenshot");
    expect(scopes).toEqual(["action:click", "observe:screenshot"]);
  });

  it("handles empty string", () => {
    const scopes = parseScopes("");
    expect(scopes).toEqual([]);
  });

  it("handles undefined input", () => {
    const scopes = parseScopes(undefined);
    expect(scopes).toEqual([]);
  });

  it("handles empty array", () => {
    const scopes = parseScopes([]);
    expect(scopes).toEqual([]);
  });
});

describe("isValidScope()", () => {
  it("returns true for valid scopes", () => {
    expect(isValidScope("action:click")).toBe(true);
    expect(isValidScope("observe:screenshot")).toBe(true);
    expect(isValidScope("page:navigate")).toBe(true);
    expect(isValidScope("browser:launch")).toBe(true);
    expect(isValidScope("storage:read")).toBe(true);
    expect(isValidScope("network:intercept")).toBe(true);
  });

  it("returns true for wildcard scopes", () => {
    expect(isValidScope("*")).toBe(true);
    expect(isValidScope("action:*")).toBe(true);
    expect(isValidScope("observe:*")).toBe(true);
    expect(isValidScope("page:*")).toBe(true);
  });

  it("returns false for invalid scopes", () => {
    expect(isValidScope("invalid:scope")).toBe(false);
    expect(isValidScope("not-a-scope")).toBe(false);
    expect(isValidScope("")).toBe(false);
    expect(isValidScope("action/click")).toBe(false); // methods are not scopes
  });
});

describe("validateTokenClaims()", () => {
  describe("expiration checking", () => {
    it("returns undefined for non-expired token", () => {
      const claims = {
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        scopes: ["action:click"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeUndefined();
    });

    it("returns error message for expired token", () => {
      const claims = {
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        scopes: ["action:click"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeDefined();
      expect(result).toContain("expired");
    });

    it("returns undefined for tokens without exp", () => {
      const claims = {
        scopes: ["action:click"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeUndefined();
    });
  });

  describe("not-before checking", () => {
    it("returns undefined for token past nbf", () => {
      const claims = {
        nbf: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        scopes: ["action:click"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeUndefined();
    });

    it("returns error message for token before nbf", () => {
      const claims = {
        nbf: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        scopes: ["action:click"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeDefined();
      expect(result).toContain("not yet valid");
    });
  });

  describe("scope validation", () => {
    it("returns undefined for valid scopes", () => {
      const claims = {
        scopes: ["action:click", "observe:screenshot"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeUndefined();
    });

    it("returns error for missing scopes", () => {
      const claims = {} as { scopes: BAPScope[] };
      const result = validateTokenClaims(claims);
      expect(result).toBeDefined();
      expect(result).toContain("scopes");
    });

    it("returns error for empty scopes array", () => {
      const claims = {
        scopes: [] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeDefined();
    });

    it("returns error for invalid scope in array", () => {
      const claims = {
        scopes: ["action:click", "invalid:scope"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeDefined();
      expect(result).toContain("Invalid scopes");
    });

    it("allows wildcard scopes", () => {
      const claims = {
        scopes: ["*"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeUndefined();
    });

    it("allows category wildcard scopes", () => {
      const claims = {
        scopes: ["action:*", "observe:*"] as BAPScope[],
      };
      const result = validateTokenClaims(claims);
      expect(result).toBeUndefined();
    });
  });
});

describe("ScopeProfiles", () => {
  it("readonly profile has observe and page:read scopes", () => {
    const readonly = ScopeProfiles.readonly;
    expect(readonly).toContain("page:read");
    expect(readonly).toContain("observe:*");
    expect(readonly.length).toBe(2);
  });

  it("standard profile includes browser, page, action, and observe scopes", () => {
    const standard = ScopeProfiles.standard;
    expect(standard).toContain("browser:launch");
    expect(standard).toContain("browser:close");
    expect(standard).toContain("page:*");
    expect(standard).toContain("action:click");
    expect(standard).toContain("observe:*");
  });

  it("full profile includes all category wildcards except storage/network", () => {
    const full = ScopeProfiles.full;
    expect(full).toContain("browser:*");
    expect(full).toContain("page:*");
    expect(full).toContain("action:*");
    expect(full).toContain("observe:*");
    expect(full).toContain("emulate:*");
    expect(full).toContain("trace:*");
  });

  it("privileged profile includes universal wildcard", () => {
    const privileged = ScopeProfiles.privileged;
    expect(privileged).toContain("*");
    expect(privileged.length).toBe(1);
  });

  it("full profile is a superset of standard profile scopes", () => {
    // Full uses wildcards, standard uses specifics
    // Check that full's wildcards cover standard's specifics
    const fullAllows = (method: string) => hasScope(ScopeProfiles.full, method);
    const standardAllows = (method: string) => hasScope(ScopeProfiles.standard, method);

    // If standard allows a method, full should too
    expect(standardAllows("action/click")).toBe(true);
    expect(fullAllows("action/click")).toBe(true);
    expect(standardAllows("observe/screenshot")).toBe(true);
    expect(fullAllows("observe/screenshot")).toBe(true);
  });
});

describe("MethodScopes", () => {
  it("defines scopes for action methods", () => {
    expect(MethodScopes["action/click"]).toBeDefined();
    expect(MethodScopes["action/fill"]).toBeDefined();
    expect(MethodScopes["action/type"]).toBeDefined();
  });

  it("defines scopes for observe methods", () => {
    expect(MethodScopes["observe/screenshot"]).toBeDefined();
    expect(MethodScopes["observe/accessibility"]).toBeDefined();
    expect(MethodScopes["observe/dom"]).toBeDefined();
  });

  it("defines scopes for page methods", () => {
    expect(MethodScopes["page/create"]).toBeDefined();
    expect(MethodScopes["page/navigate"]).toBeDefined();
    expect(MethodScopes["page/close"]).toBeDefined();
  });

  it("lifecycle methods have empty scope requirements", () => {
    expect(MethodScopes["initialize"]).toEqual([]);
    expect(MethodScopes["shutdown"]).toEqual([]);
  });

  it("action methods require action scopes", () => {
    const clickScopes = MethodScopes["action/click"];
    expect(clickScopes).toContain("action:click");
    expect(clickScopes).toContain("action:*");
    expect(clickScopes).toContain("*");
  });
});
