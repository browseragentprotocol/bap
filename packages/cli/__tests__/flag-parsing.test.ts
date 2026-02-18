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
