import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs and os to avoid reading real config files
vi.mock("node:fs", () => ({
  default: {
    existsSync: () => false,
    readFileSync: () => "{}",
    writeFileSync: () => {},
    mkdirSync: () => {},
  },
}));

vi.mock("node:os", () => ({
  default: {
    homedir: () => "/tmp/test-home",
  },
}));

// Import after mocks
const { parseArgs } = await import("../src/config/state.js");

describe("parseArgs session flags", () => {
  describe("-s (session)", () => {
    it("parses -s=name session flag", () => {
      const flags = parseArgs(["-s=my-session", "open", "https://example.com"]);
      expect(flags.session).toBe("my-session");
      expect(flags.command).toBe("open");
    });

    it("parses -s name session flag (space-separated)", () => {
      const flags = parseArgs(["-s", "my-session", "open", "https://example.com"]);
      expect(flags.session).toBe("my-session");
      expect(flags.command).toBe("open");
    });

    it("defaults session to undefined when not set", () => {
      const flags = parseArgs(["open", "https://example.com"]);
      expect(flags.session).toBeUndefined();
    });
  });
});

describe("parseArgs profile flags", () => {
  describe("--profile", () => {
    it("defaults profile to auto from config", () => {
      const flags = parseArgs(["goto", "https://example.com"]);
      expect(flags.profile).toBe("auto");
    });

    it("parses --no-profile to none", () => {
      const flags = parseArgs(["goto", "https://example.com", "--no-profile"]);
      expect(flags.profile).toBe("none");
    });

    it("parses --profile=<path>", () => {
      const flags = parseArgs(["goto", "https://example.com", "--profile=/custom/path"]);
      expect(flags.profile).toBe("/custom/path");
    });

    it("parses --profile <path> (space-separated)", () => {
      const flags = parseArgs(["goto", "https://example.com", "--profile", "/custom/path"]);
      expect(flags.profile).toBe("/custom/path");
    });

    it("parses --profile auto explicitly", () => {
      const flags = parseArgs(["--no-profile", "goto", "https://example.com", "--profile", "auto"]);
      expect(flags.profile).toBe("auto");
    });
  });
});

describe("parseArgs timeout flags", () => {
  it("defaults timeout from config", () => {
    const flags = parseArgs(["open", "https://example.com"]);
    expect(flags.timeout).toBe(30000);
  });

  it("parses --timeout=<ms>", () => {
    const flags = parseArgs(["open", "https://example.com", "--timeout=120000"]);
    expect(flags.timeout).toBe(120000);
  });

  it("parses --timeout <ms> (space-separated)", () => {
    const flags = parseArgs(["open", "https://example.com", "--timeout", "45000"]);
    expect(flags.timeout).toBe(45000);
  });
});

describe("parseArgs default browser behavior", () => {
  it("defaults to visible Chrome with auto profile", () => {
    const flags = parseArgs(["open", "https://example.com"]);
    expect(flags.browser).toBe("chrome");
    expect(flags.headless).toBe(false);
    expect(flags.profile).toBe("auto");
    expect(flags.timeout).toBe(30000);
  });
});

describe("parseArgs fusion flags", () => {
  describe("--observe", () => {
    it("parses --observe flag", () => {
      const flags = parseArgs(["act", "click:e1", "--observe"]);
      expect(flags.observe).toBe(true);
      expect(flags.command).toBe("act");
    });

    it("defaults observe to undefined when not set", () => {
      const flags = parseArgs(["act", "click:e1"]);
      expect(flags.observe).toBeUndefined();
    });
  });

  describe("--diff", () => {
    it("parses --diff flag", () => {
      const flags = parseArgs(["observe", "--diff"]);
      expect(flags.diff).toBe(true);
      expect(flags.command).toBe("observe");
    });

    it("defaults diff to undefined when not set", () => {
      const flags = parseArgs(["observe"]);
      expect(flags.diff).toBeUndefined();
    });
  });

  describe("--tier", () => {
    it("parses --tier=minimal", () => {
      const flags = parseArgs(["observe", "--tier=minimal"]);
      expect(flags.tier).toBe("minimal");
    });

    it("parses --tier=interactive", () => {
      const flags = parseArgs(["observe", "--tier=interactive"]);
      expect(flags.tier).toBe("interactive");
    });

    it("parses --tier=full", () => {
      const flags = parseArgs(["act", "click:e1", "--observe", "--tier=full"]);
      expect(flags.tier).toBe("full");
      expect(flags.observe).toBe(true);
    });

    it("parses --tier as separate arg", () => {
      const flags = parseArgs(["observe", "--tier", "minimal"]);
      expect(flags.tier).toBe("minimal");
    });

    it("defaults tier to undefined when not set", () => {
      const flags = parseArgs(["observe"]);
      expect(flags.tier).toBeUndefined();
    });
  });

  describe("--pixels (scroll)", () => {
    it("parses --pixels=500", () => {
      const flags = parseArgs(["scroll", "down", "--pixels=500"]);
      expect(flags.pixels).toBe(500);
      expect(flags.command).toBe("scroll");
    });

    it("parses --pixels as separate arg", () => {
      const flags = parseArgs(["scroll", "down", "--pixels", "1000"]);
      expect(flags.pixels).toBe(1000);
    });

    it("defaults pixels to undefined when not set", () => {
      const flags = parseArgs(["scroll", "down"]);
      expect(flags.pixels).toBeUndefined();
    });
  });

  describe("combined flags", () => {
    it("parses --observe with --max", () => {
      const flags = parseArgs(["act", "click:e1", "--observe", "--max=20"]);
      expect(flags.observe).toBe(true);
      expect(flags.max).toBe(20);
    });

    it("parses --diff with --max", () => {
      const flags = parseArgs(["observe", "--diff", "--max=10"]);
      expect(flags.diff).toBe(true);
      expect(flags.max).toBe(10);
    });

    it("parses goto --observe with --tier", () => {
      const flags = parseArgs(["goto", "https://example.com", "--observe", "--tier=interactive"]);
      expect(flags.command).toBe("goto");
      expect(flags.args).toEqual(["https://example.com"]);
      expect(flags.observe).toBe(true);
      expect(flags.tier).toBe("interactive");
    });
  });
});
