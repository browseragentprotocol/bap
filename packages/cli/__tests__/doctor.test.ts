import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDoctorReport, formatDoctorReport, type DoctorDeps } from "../src/doctor.js";

function createTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bap-doctor-"));
}

function createDeps(homeDir: string, platform: NodeJS.Platform, lookupCommand?: (command: string) => string | undefined): DoctorDeps {
  return {
    existsSync: fs.existsSync,
    readdirSync: (candidate: string) => fs.readdirSync(candidate),
    homeDir,
    env: {},
    platform,
    lookupCommand: lookupCommand ?? (() => undefined),
  };
}

function getChromeProfilePath(homeDir: string, platform: NodeJS.Platform): string | undefined {
  switch (platform) {
    case "darwin":
      return path.join(homeDir, "Library", "Application Support", "Google", "Chrome");
    case "linux":
      return path.join(homeDir, ".config", "google-chrome");
    case "win32":
      return path.join(homeDir, "AppData", "Local", "Google", "Chrome", "User Data");
    default:
      return undefined;
  }
}

function getPlaywrightCachePath(homeDir: string, platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return path.join(homeDir, "Library", "Caches", "ms-playwright");
    case "win32":
      return path.join(homeDir, "AppData", "Local", "ms-playwright");
    default:
      return path.join(homeDir, ".cache", "ms-playwright");
  }
}

describe("buildDoctorReport", () => {
  it("reports a usable fallback when Chrome is missing but Playwright Chromium exists", () => {
    const homeDir = createTempHome();
    const platform: NodeJS.Platform = "linux";
    const profilePath = getChromeProfilePath(homeDir, platform);
    if (!profilePath) {
      return;
    }

    fs.mkdirSync(profilePath, { recursive: true });
    fs.writeFileSync(path.join(profilePath, "SingletonLock"), "");

    const cacheDir = getPlaywrightCachePath(homeDir, platform);
    fs.mkdirSync(path.join(cacheDir, "chromium-1234"), { recursive: true });

    const report = buildDoctorReport({
      command: "doctor",
      args: [],
      port: 9222,
      host: "localhost",
      browser: "chrome",
      headless: false,
      profile: "auto",
      timeout: 30000,
      verbose: false,
      help: false,
      version: false,
    }, createDeps(homeDir, platform));

    expect(report.launchPlan.ready).toBe(true);
    expect(report.launchPlan.primary).toBe("Fall back to Playwright Chromium");
    expect(report.launchPlan.fallbacks.some((fallback) => fallback.includes("fresh automation profile"))).toBe(true);
    expect(report.checks.some((check) => check.label === "Auto Profile" && check.status === "warn")).toBe(true);
    expect(report.checks.some((check) => check.label === "Playwright Chromium" && check.status === "ok")).toBe(true);
    expect(formatDoctorReport(report)).toContain("### BAP Doctor");
  });

  it("fails clearly when no browser path is available", () => {
    const homeDir = createTempHome();
    const platform: NodeJS.Platform = "linux";

    const report = buildDoctorReport({
      command: "doctor",
      args: [],
      port: 9222,
      host: "localhost",
      browser: "chrome",
      headless: false,
      profile: "none",
      timeout: 30000,
      verbose: false,
      help: false,
      version: false,
    }, createDeps(homeDir, platform));

    expect(report.launchPlan.ready).toBe(false);
    expect(report.checks.some((check) => check.status === "fail" && check.label === "Playwright Chromium")).toBe(true);
    expect(report.nextSteps.some((step) => step.includes("playwright install chromium"))).toBe(true);
  });

  it("does not warn Firefox users about Chrome profile locks", () => {
    const homeDir = createTempHome();
    const platform: NodeJS.Platform = "linux";
    const cacheDir = getPlaywrightCachePath(homeDir, platform);
    fs.mkdirSync(path.join(cacheDir, "firefox-1234"), { recursive: true });

    const report = buildDoctorReport({
      command: "doctor",
      args: [],
      port: 9222,
      host: "localhost",
      browser: "firefox",
      headless: true,
      profile: "auto",
      timeout: 30000,
      verbose: false,
      help: false,
      version: false,
    }, createDeps(homeDir, platform));

    expect(report.launchPlan.ready).toBe(true);
    expect(report.checks.some((check) => check.label === "Profile" && check.detail.includes("Playwright-managed profile"))).toBe(true);
    expect(report.checks.some((check) => check.label === "Auto Profile")).toBe(false);
  });
});
