import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultChromeProfileDir, launchBrowserWithFallback } from "../src/server/manager.js";

function createTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bap-cli-home-"));
}

describe("launchBrowserWithFallback smoke", () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
  });

  it("retries without the auto profile using the real profile resolver", async () => {
    const tempHome = createTempHome();
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    const chromeProfileDir = (() => {
      switch (process.platform) {
        case "darwin":
          return path.join(tempHome, "Library", "Application Support", "Google", "Chrome");
        case "linux":
          return path.join(tempHome, ".config", "google-chrome");
        case "win32":
          return path.join(
            process.env.LOCALAPPDATA ?? path.join(tempHome, "AppData", "Local"),
            "Google",
            "Chrome",
            "User Data"
          );
        default:
          return undefined;
      }
    })();

    if (!chromeProfileDir) {
      return;
    }

    fs.mkdirSync(chromeProfileDir, { recursive: true });

    expect(getDefaultChromeProfileDir()).toBe(chromeProfileDir);

    const client = {
      launch: vi.fn()
        .mockRejectedValueOnce(new Error("Chrome is already using that profile."))
        .mockResolvedValueOnce({ browserId: "browser-1" }),
    };

    await launchBrowserWithFallback(client as never, {
      browser: "chrome",
      headless: true,
      profile: "auto",
    });

    expect(client.launch).toHaveBeenNthCalledWith(1, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
      userDataDir: chromeProfileDir,
    });
    expect(client.launch).toHaveBeenNthCalledWith(2, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
    });
  });

  it("falls back from missing system Chrome to Playwright Chromium", async () => {
    const client = {
      launch: vi.fn()
        .mockRejectedValueOnce(new Error("Chromium distribution 'chrome' is not found"))
        .mockResolvedValueOnce({ browserId: "browser-1" }),
    };

    await launchBrowserWithFallback(client as never, {
      browser: "chrome",
      headless: false,
      profile: "none",
    });

    expect(client.launch).toHaveBeenNthCalledWith(1, {
      browser: "chromium",
      channel: "chrome",
      headless: false,
    });
    expect(client.launch).toHaveBeenNthCalledWith(2, {
      browser: "chromium",
      channel: undefined,
      headless: false,
    });
  });

  it("does not reuse the auto-detected Chrome profile with Playwright Chromium fallback", async () => {
    const tempHome = createTempHome();
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    const chromeProfileDir = (() => {
      switch (process.platform) {
        case "darwin":
          return path.join(tempHome, "Library", "Application Support", "Google", "Chrome");
        case "linux":
          return path.join(tempHome, ".config", "google-chrome");
        case "win32":
          return path.join(
            process.env.LOCALAPPDATA ?? path.join(tempHome, "AppData", "Local"),
            "Google",
            "Chrome",
            "User Data"
          );
        default:
          return undefined;
      }
    })();

    if (!chromeProfileDir) {
      return;
    }

    fs.mkdirSync(chromeProfileDir, { recursive: true });

    const client = {
      launch: vi.fn()
        .mockRejectedValueOnce(new Error("Chromium distribution 'chrome' is not found"))
        .mockResolvedValueOnce({ browserId: "browser-1" }),
    };

    await launchBrowserWithFallback(client as never, {
      browser: "chrome",
      headless: true,
      profile: "auto",
    });

    expect(client.launch).toHaveBeenNthCalledWith(1, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
      userDataDir: chromeProfileDir,
    });
    expect(client.launch).toHaveBeenNthCalledWith(2, {
      browser: "chromium",
      channel: undefined,
      headless: true,
      userDataDir: undefined,
    });
  });
});
