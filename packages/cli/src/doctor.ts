/**
 * @fileoverview Environment diagnostics for first-run BAP CLI issues.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { GlobalFlags } from "./config/state.js";

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  status: DoctorStatus;
  label: string;
  detail: string;
}

export interface DoctorReport {
  config: {
    browser: string;
    headless: boolean;
    profile: string;
    port: number;
    timeout: number;
  };
  launchPlan: {
    ready: boolean;
    primary: string;
    fallbacks: string[];
  };
  checks: DoctorCheck[];
  nextSteps: string[];
}

export interface DoctorDeps {
  existsSync: (candidate: string) => boolean;
  readdirSync: (candidate: string) => string[];
  homeDir: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  lookupCommand: (command: string) => string | undefined;
}

function defaultLookupCommand(command: string): string | undefined {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    return undefined;
  }

  const firstLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine || undefined;
}

function defaultDoctorDeps(): DoctorDeps {
  return {
    existsSync: fs.existsSync,
    readdirSync: (candidate: string) => fs.readdirSync(candidate),
    homeDir: os.homedir(),
    env: process.env,
    platform: process.platform,
    lookupCommand: defaultLookupCommand,
  };
}

function getChromeProfileDir(deps: DoctorDeps): string | undefined {
  let profileDir: string;

  switch (deps.platform) {
    case "darwin":
      profileDir = path.join(deps.homeDir, "Library", "Application Support", "Google", "Chrome");
      break;
    case "linux":
      profileDir = path.join(deps.homeDir, ".config", "google-chrome");
      break;
    case "win32":
      profileDir = path.join(
        deps.env.LOCALAPPDATA ?? path.join(deps.homeDir, "AppData", "Local"),
        "Google",
        "Chrome",
        "User Data"
      );
      break;
    default:
      return undefined;
  }

  return deps.existsSync(profileDir) ? profileDir : undefined;
}

function getPlaywrightCacheDir(deps: DoctorDeps): string {
  switch (deps.platform) {
    case "darwin":
      return path.join(deps.homeDir, "Library", "Caches", "ms-playwright");
    case "win32":
      return path.join(
        deps.env.LOCALAPPDATA ?? path.join(deps.homeDir, "AppData", "Local"),
        "ms-playwright"
      );
    default:
      return path.join(deps.homeDir, ".cache", "ms-playwright");
  }
}

function hasPlaywrightBrowser(browser: "chromium" | "firefox" | "webkit", deps: DoctorDeps): boolean {
  const cacheDir = getPlaywrightCacheDir(deps);
  if (!deps.existsSync(cacheDir)) {
    return false;
  }

  try {
    return deps.readdirSync(cacheDir).some((entry) => entry === browser || entry.startsWith(`${browser}-`));
  } catch {
    return false;
  }
}

function getProfileLockFiles(profileDir: string, deps: DoctorDeps): string[] {
  return ["SingletonLock", "SingletonSocket", "SingletonCookie"]
    .filter((name) => deps.existsSync(path.join(profileDir, name)));
}

function getSystemBrowserPath(browser: "chrome" | "edge", deps: DoctorDeps): string | undefined {
  const macPaths = browser === "chrome"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        path.join(deps.homeDir, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      ]
    : [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        path.join(deps.homeDir, "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
      ];

  const windowsPaths = browser === "chrome"
    ? [
        path.join(deps.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(
          deps.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe"
        ),
      ]
    : [
        path.join(
          deps.env.PROGRAMFILES ?? "C:\\Program Files",
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe"
        ),
        path.join(
          deps.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe"
        ),
      ];

  const commands = browser === "chrome"
    ? ["google-chrome", "google-chrome-stable", "chrome"]
    : ["microsoft-edge", "microsoft-edge-stable", "msedge"];

  const candidates = deps.platform === "darwin"
    ? macPaths
    : deps.platform === "win32"
      ? windowsPaths
      : [];

  const filePath = candidates.find((candidate) => deps.existsSync(candidate));
  if (filePath) {
    return filePath;
  }

  for (const command of commands) {
    const found = deps.lookupCommand(command);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function addProfileChecks(flags: GlobalFlags, deps: DoctorDeps, checks: DoctorCheck[], fallbacks: string[]): void {
  if (!["chrome", "chromium", "edge"].includes(flags.browser)) {
    checks.push({
      status: "ok",
      label: "Profile",
      detail: `${flags.browser} launches with a fresh Playwright-managed profile.`,
    });
    return;
  }

  if (flags.profile === "none") {
    checks.push({
      status: "ok",
      label: "Profile",
      detail: "Fresh automation profile requested with --no-profile.",
    });
    return;
  }

  if (flags.profile === "auto") {
    const autoProfileDir = getChromeProfileDir(deps);
    if (!autoProfileDir) {
      checks.push({
        status: "warn",
        label: "Auto Profile",
        detail: "No default Chrome profile was found. BAP will use a fresh automation profile.",
      });
      return;
    }

    const lockFiles = getProfileLockFiles(autoProfileDir, deps);
    if (lockFiles.length > 0) {
      checks.push({
        status: "warn",
        label: "Auto Profile",
        detail: `Found ${autoProfileDir} but it appears busy (${lockFiles.join(", ")}). BAP will retry without the profile.`,
      });
      fallbacks.push("Retry with a fresh automation profile if the auto-detected Chrome profile is busy");
      return;
    }

    checks.push({
      status: "ok",
      label: "Auto Profile",
      detail: `Found ${autoProfileDir}. If it becomes busy at launch time, BAP retries without it.`,
    });
    fallbacks.push("Retry with a fresh automation profile if the auto-detected Chrome profile is busy");
    return;
  }

  if (deps.existsSync(flags.profile)) {
    const lockFiles = getProfileLockFiles(flags.profile, deps);
    if (lockFiles.length > 0) {
      checks.push({
        status: "warn",
        label: "Configured Profile",
        detail: `Found ${flags.profile}, but it appears busy (${lockFiles.join(", ")}). Chrome may reject it.`,
      });
    } else {
      checks.push({
        status: "ok",
        label: "Configured Profile",
        detail: `Found ${flags.profile}.`,
      });
    }
    return;
  }

  checks.push({
    status: "warn",
    label: "Configured Profile",
    detail: `Profile path does not exist: ${flags.profile}. BAP will fall back to a fresh automation profile.`,
  });
  fallbacks.push("Use a fresh automation profile because the configured profile path does not exist");
}

export function buildDoctorReport(
  flags: GlobalFlags,
  deps: DoctorDeps = defaultDoctorDeps()
): DoctorReport {
  const checks: DoctorCheck[] = [];
  const fallbacks: string[] = [];
  const nextSteps: string[] = [];

  const playwrightChromium = hasPlaywrightBrowser("chromium", deps);
  const playwrightFirefox = hasPlaywrightBrowser("firefox", deps);
  const playwrightWebkit = hasPlaywrightBrowser("webkit", deps);

  addProfileChecks(flags, deps, checks, fallbacks);

  let ready = false;
  let primary = "";

  switch (flags.browser) {
    case "chrome":
    case "edge": {
      const systemPath = getSystemBrowserPath(flags.browser, deps);
      if (systemPath) {
        ready = true;
        primary = `Use installed ${flags.browser === "chrome" ? "Chrome" : "Edge"}`;
        checks.push({
          status: "ok",
          label: flags.browser === "chrome" ? "System Chrome" : "System Edge",
          detail: `Found at ${systemPath}.`,
        });
      } else {
        checks.push({
          status: playwrightChromium ? "warn" : "fail",
          label: flags.browser === "chrome" ? "System Chrome" : "System Edge",
          detail: playwrightChromium
            ? `Not found. BAP can fall back to Playwright Chromium.`
            : `Not found.`,
        });
      }

      checks.push({
        status: playwrightChromium ? "ok" : "fail",
        label: "Playwright Chromium",
        detail: playwrightChromium
          ? `Found in ${getPlaywrightCacheDir(deps)}.`
          : `Not found in ${getPlaywrightCacheDir(deps)}.`,
      });

      if (!systemPath && playwrightChromium) {
        ready = true;
        primary = "Fall back to Playwright Chromium";
        fallbacks.push(`Use Playwright Chromium because ${flags.browser} is not installed`);
      }

      if (!ready) {
        primary = `No available browser for ${flags.browser}`;
        nextSteps.push("Install Chrome or Edge, or run `npx playwright install chromium`.");
      }
      break;
    }

    case "chromium": {
      ready = playwrightChromium;
      primary = ready ? "Use Playwright Chromium" : "Playwright Chromium is required";
      checks.push({
        status: playwrightChromium ? "ok" : "fail",
        label: "Playwright Chromium",
        detail: playwrightChromium
          ? `Found in ${getPlaywrightCacheDir(deps)}.`
          : `Not found in ${getPlaywrightCacheDir(deps)}.`,
      });
      if (!ready) {
        nextSteps.push("Run `npx playwright install chromium`.");
      }
      break;
    }

    case "firefox": {
      ready = playwrightFirefox;
      primary = ready ? "Use Playwright Firefox" : "Playwright Firefox is required";
      checks.push({
        status: playwrightFirefox ? "ok" : "fail",
        label: "Playwright Firefox",
        detail: playwrightFirefox
          ? `Found in ${getPlaywrightCacheDir(deps)}.`
          : `Not found in ${getPlaywrightCacheDir(deps)}.`,
      });
      if (!ready) {
        nextSteps.push("Run `npx playwright install firefox`.");
      }
      break;
    }

    case "webkit": {
      ready = playwrightWebkit;
      primary = ready ? "Use Playwright WebKit" : "Playwright WebKit is required";
      checks.push({
        status: playwrightWebkit ? "ok" : "fail",
        label: "Playwright WebKit",
        detail: playwrightWebkit
          ? `Found in ${getPlaywrightCacheDir(deps)}.`
          : `Not found in ${getPlaywrightCacheDir(deps)}.`,
      });
      if (!ready) {
        nextSteps.push("Run `npx playwright install webkit`.");
      }
      break;
    }

    default: {
      primary = `Unknown browser configuration: ${flags.browser}`;
      checks.push({
        status: "fail",
        label: "Browser",
        detail: `Unsupported browser: ${flags.browser}.`,
      });
      nextSteps.push("Set a supported browser with `bap config browser <chrome|chromium|firefox|webkit|edge>`.");
      break;
    }
  }

  if (flags.profile !== "none" && ["chrome", "chromium", "edge"].includes(flags.browser)) {
    nextSteps.push("If browser startup is flaky, retry with `--no-profile` for a fresh automation browser.");
  }

  nextSteps.push("Smoke test with `bap goto https://example.com --observe`.");

  return {
    config: {
      browser: flags.browser,
      headless: flags.headless,
      profile: flags.profile,
      port: flags.port,
      timeout: flags.timeout ?? 30000,
    },
    launchPlan: {
      ready,
      primary,
      fallbacks,
    },
    checks,
    nextSteps,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    "### BAP Doctor",
    `- Browser: ${report.config.browser}`,
    `- Headless: ${report.config.headless}`,
    `- Profile: ${report.config.profile}`,
    `- Port: ${report.config.port}`,
    `- Timeout: ${report.config.timeout}`,
    "",
    "### Launch Plan",
    `- Ready: ${report.launchPlan.ready ? "yes" : "no"}`,
    `- Primary: ${report.launchPlan.primary}`,
  ];

  for (const fallback of report.launchPlan.fallbacks) {
    lines.push(`- Fallback: ${fallback}`);
  }

  lines.push("", "### Checks");

  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.label}: ${check.detail}`);
  }

  lines.push("", "### Next Steps");
  for (const step of report.nextSteps) {
    lines.push(`- ${step}`);
  }

  return lines.join("\n");
}
