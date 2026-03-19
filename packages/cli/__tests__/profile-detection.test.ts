import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs and os before imports
const mockExistsSync = vi.fn();

vi.mock("node:fs", () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: () => "{}",
    writeFileSync: () => {},
    mkdirSync: () => {},
    unlinkSync: () => {},
  },
}));

vi.mock("node:os", () => ({
  default: {
    homedir: () => "/Users/testuser",
  },
}));

vi.mock("node:net", () => ({
  default: {
    createConnection: () => {
      const socket = {
        setTimeout: vi.fn(),
        destroy: vi.fn(),
        on: () => socket,
      };
      return socket;
    },
  },
}));

vi.mock("@browseragentprotocol/client", () => ({
  createClient: vi.fn(),
}));

const { getDefaultChromeProfileDir, resolveProfile } = await import("../src/server/manager.js");

describe("getDefaultChromeProfileDir", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it("should return macOS Chrome profile path when it exists", () => {
    // On macOS (the test environment), check if the path is correct
    if (process.platform === "darwin") {
      mockExistsSync.mockImplementation((p: string) => {
        return p === "/Users/testuser/Library/Application Support/Google/Chrome";
      });
      const result = getDefaultChromeProfileDir();
      expect(result).toBe("/Users/testuser/Library/Application Support/Google/Chrome");
    }
  });

  it("should return undefined when Chrome profile dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = getDefaultChromeProfileDir();
    expect(result).toBeUndefined();
  });
});

describe("resolveProfile", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it("should return undefined for firefox regardless of profile setting", () => {
    expect(resolveProfile("auto", "firefox")).toBeUndefined();
    expect(resolveProfile("/some/path", "firefox")).toBeUndefined();
  });

  it("should return undefined for webkit regardless of profile setting", () => {
    expect(resolveProfile("auto", "webkit")).toBeUndefined();
  });

  it("should return undefined when profile is none", () => {
    expect(resolveProfile("none", "chrome")).toBeUndefined();
    expect(resolveProfile("none", "edge")).toBeUndefined();
  });

  it("should return explicit path when it exists", () => {
    mockExistsSync.mockImplementation((p: string) => p === "/custom/chrome/profile");
    expect(resolveProfile("/custom/chrome/profile", "chrome")).toBe("/custom/chrome/profile");
  });

  it("should return undefined with warning when explicit path does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = resolveProfile("/nonexistent/path", "chrome");
    expect(result).toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Warning: profile path does not exist")
    );
    stderrSpy.mockRestore();
  });

  it("should resolve auto for chrome to detected profile dir", () => {
    if (process.platform === "darwin") {
      mockExistsSync.mockImplementation((p: string) => {
        return p === "/Users/testuser/Library/Application Support/Google/Chrome";
      });
      const result = resolveProfile("auto", "chrome");
      expect(result).toBe("/Users/testuser/Library/Application Support/Google/Chrome");
    }
  });

  it("should resolve auto for edge to undefined (edge uses different profile dir)", () => {
    // Edge uses a different profile dir than Chrome, so auto-detect won't find it
    mockExistsSync.mockReturnValue(false);
    const result = resolveProfile("auto", "edge");
    expect(result).toBeUndefined();
  });
});
