/**
 * @fileoverview Server lifecycle management
 *
 * Manages the BAP Playwright server as a detached background daemon.
 * Reuses existing server if one is already running on the target port.
 * Extracted and adapted from packages/mcp/src/cli.ts.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type BAPClient } from "@browseragentprotocol/client";
import type { BrowserLaunchParams } from "@browseragentprotocol/protocol";

// =============================================================================
// Types
// =============================================================================

export interface ServerManagerOptions {
  port: number;
  host?: string;
  browser: string;
  headless: boolean;
  verbose: boolean;
  timeout?: number;
  sessionId?: string;
  profile?: string;
}

export interface LaunchBrowserOptions {
  browser: string;
  headless: boolean;
  profile?: string;
  userDataDir?: string;
}

// =============================================================================
// Server Discovery
// =============================================================================

/**
 * Check if a port is in use by attempting a TCP connection.
 */
export function isPortInUse(port: number, host: string = "localhost"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for a server to become available on the given port.
 */
async function waitForServer(
  port: number,
  host: string = "localhost",
  timeoutMs: number = 15000,
  intervalMs: number = 150
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `BAP server did not start within ${timeoutMs / 1000}s on port ${port}. ` +
      `Ensure Playwright browsers are installed: npx playwright install chromium`
  );
}

/**
 * Resolve the command to start server-playwright.
 * In monorepo dev, uses sibling package directly. Otherwise falls back to npx.
 */
function resolveServerCommand(): { command: string; args: string[] } {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const siblingCli = path.resolve(__dirname, "../../server-playwright/dist/cli.js");

    if (fs.existsSync(siblingCli)) {
      return { command: "node", args: [siblingCli] };
    }
  } catch {
    // import.meta.url resolution failed, fall through
  }

  return { command: "npx", args: ["-y", "@browseragentprotocol/server-playwright"] };
}

// =============================================================================
// PID File Management
// =============================================================================

function getPidDir(): string {
  return path.join(os.homedir(), ".bap");
}

function getPidPath(): string {
  return path.join(getPidDir(), "server.pid");
}

function writePidFile(pid: number): void {
  const dir = getPidDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getPidPath(), pid.toString(), "utf-8");
}

function readPidFile(): number | null {
  try {
    const pidStr = fs.readFileSync(getPidPath(), "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function removePidFile(): void {
  try {
    fs.unlinkSync(getPidPath());
  } catch {
    // Ignore
  }
}

// =============================================================================
// Browser Name Mapping
// =============================================================================

/** Map user-facing browser names to Playwright browser types */
export const BROWSER_MAP: Record<string, "chromium" | "firefox" | "webkit"> = {
  chrome: "chromium",
  chromium: "chromium",
  firefox: "firefox",
  webkit: "webkit",
  edge: "chromium",
};

/** Map user-facing browser names to Playwright channels (e.g., system Chrome) */
export const CHANNEL_MAP: Record<string, string> = {
  chrome: "chrome",
  edge: "msedge",
};

// =============================================================================
// Profile Detection
// =============================================================================

/** Browsers that support persistent user data directories */
const PROFILE_BROWSERS = new Set(["chrome", "chromium", "edge"]);

/** Detect Chrome user data dir for current platform */
export function getDefaultChromeProfileDir(): string | undefined {
  const home = os.homedir();
  let profileDir: string;

  switch (process.platform) {
    case "darwin":
      profileDir = path.join(home, "Library", "Application Support", "Google", "Chrome");
      break;
    case "linux":
      profileDir = path.join(home, ".config", "google-chrome");
      break;
    case "win32":
      profileDir = path.join(
        process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
        "Google",
        "Chrome",
        "User Data"
      );
      break;
    default:
      return undefined;
  }

  return fs.existsSync(profileDir) ? profileDir : undefined;
}

/** Resolve profile setting to concrete userDataDir path */
export function resolveProfile(profile: string, browser: string): string | undefined {
  // Only Chrome/Edge support persistent profiles
  if (!PROFILE_BROWSERS.has(browser)) {
    return undefined;
  }

  if (profile === "none") {
    return undefined;
  }

  if (profile === "auto") {
    return getDefaultChromeProfileDir();
  }

  // Explicit path — validate it exists
  if (fs.existsSync(profile)) {
    return profile;
  }

  process.stderr.write(`[bap] Warning: profile path does not exist: ${profile}\n`);
  return undefined;
}

function buildLaunchParams(options: LaunchBrowserOptions): BrowserLaunchParams {
  const browserType = BROWSER_MAP[options.browser] ?? "chromium";
  const channel = CHANNEL_MAP[options.browser];
  const userDataDir = options.userDataDir
    ?? (options.profile ? resolveProfile(options.profile, options.browser) : undefined);

  return {
    browser: browserType,
    channel,
    headless: options.headless,
    ...(userDataDir ? { userDataDir } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProfileConflictError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already using that profile") ||
    lower.includes("singletonlock") ||
    lower.includes("already running") ||
    (lower.includes("profile") && lower.includes("lock"))
  );
}

function isMissingChannelBrowserError(message: string, channel?: string): boolean {
  if (!channel) {
    return false;
  }

  const lower = message.toLowerCase();
  return (
    lower.includes(`distribution '${channel.toLowerCase()}'`) ||
    lower.includes(`distribution "${channel.toLowerCase()}"`) ||
    lower.includes("browser distribution") ||
    lower.includes("channel") ||
    lower.includes("executable doesn't exist")
  );
}

function isMissingBrowserExecutableError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("executable doesn't exist") || lower.includes("please run the following command");
}

function getMissingBrowserInstallHint(browser: string): string {
  switch (browser) {
    case "firefox":
      return "No compatible browser executable was found. Run `npx playwright install firefox`.";
    case "webkit":
      return "No compatible browser executable was found. Run `npx playwright install webkit`.";
    case "chromium":
      return "No compatible browser executable was found. Run `npx playwright install chromium`.";
    default:
      return "No compatible browser executable was found. Install Chrome/Edge or run `npx playwright install chromium`.";
  }
}

function printLaunchFallbackNote(note: string): void {
  process.stderr.write(`[bap] ${note}\n`);
}

export async function launchBrowserWithFallback(
  client: BAPClient,
  options: LaunchBrowserOptions
): Promise<void> {
  const initialParams = buildLaunchParams(options);
  const attempts: Array<{ params: BrowserLaunchParams; note?: string }> = [{ params: initialParams }];
  const seen = new Set<string>([JSON.stringify(initialParams)]);

  const addAttempt = (params: BrowserLaunchParams, note: string): void => {
    const key = JSON.stringify(params);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    attempts.push({ params, note });
    printLaunchFallbackNote(note);
  };

  let lastError: unknown;

  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index]!;

    try {
      await client.launch(attempt.params);
      return;
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);

      if (
        options.profile === "auto" &&
        attempt.params.userDataDir &&
        isProfileConflictError(message)
      ) {
        addAttempt(
          {
            ...attempt.params,
            userDataDir: undefined,
          },
          "Auto-detected browser profile is busy. Retrying with a fresh automation profile."
        );
      }

      if (
        (options.browser === "chrome" || options.browser === "edge") &&
        attempt.params.channel &&
        isMissingChannelBrowserError(message, attempt.params.channel)
      ) {
        addAttempt(
          {
            browser: "chromium",
            headless: attempt.params.headless ?? options.headless,
            channel: undefined,
            userDataDir: undefined,
          },
          `${
            options.browser === "edge" ? "Microsoft Edge" : "Chrome"
          } is not installed. Retrying with Playwright Chromium and a fresh automation profile.`
        );
      }
    }
  }

  const finalMessage = errorMessage(lastError);
  if (isMissingBrowserExecutableError(finalMessage)) {
    throw new Error(getMissingBrowserInstallHint(options.browser));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(finalMessage);
}

function pickUsablePage(
  pages: Array<{ id: string; url: string }>,
  activePage: string
): { id: string; url: string } | null {
  const usablePages = pages.filter((page) => page.url && page.url !== "about:blank");
  if (usablePages.length === 0) {
    return null;
  }

  return usablePages.find((page) => page.id === activePage) ?? usablePages[0]!;
}

function pickExistingPage(
  pages: Array<{ id: string; url: string }>,
  activePage: string
): { id: string; url: string } | null {
  if (pages.length === 0) {
    return null;
  }

  return pages.find((page) => page.id === activePage) ?? pages[0]!;
}

// =============================================================================
// Server Manager
// =============================================================================

export class ServerManager {
  private options: Required<Omit<ServerManagerOptions, "sessionId" | "profile">> &
    Pick<ServerManagerOptions, "sessionId" | "profile">;
  private client: BAPClient | null = null;

  constructor(options: ServerManagerOptions) {
    this.options = {
      host: "localhost",
      timeout: 30000,
      ...options,
    };
  }

  /**
   * Get a connected client, starting the server if needed.
   */
  async ensureClient(): Promise<BAPClient> {
    if (this.client) return this.client;

    const { port, host, browser, headless, verbose } = this.options;
    const url = `ws://${host}:${port}`;

    // Try to connect to existing server first
    if (await isPortInUse(port, host)) {
      if (verbose) {
        process.stderr.write(`[bap] Reusing server on ${host}:${port}\n`);
      }
      this.client = await createClient(url, {
        name: "bap-cli",
        sessionId: this.options.sessionId,
        timeout: this.options.timeout,
      });
      return this.client;
    }

    // Start server as detached background process
    if (verbose) {
      process.stderr.write(`[bap] Starting server on port ${port}...\n`);
    }

    const { command, args } = resolveServerCommand();
    const serverArgs = [
      ...args,
      "--port",
      port.toString(),
      "--host",
      host,
      headless ? "--headless" : "--no-headless",
      "--browser",
      BROWSER_MAP[browser] ?? "chromium",
    ];

    if (verbose) {
      serverArgs.push("--debug");
    }

    const child = spawn(command, serverArgs, {
      stdio: verbose ? ["ignore", "pipe", "pipe"] : "ignore",
      detached: true,
      env: { ...process.env },
    });

    if (verbose && child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        process.stderr.write(`[bap-server] ${data.toString()}`);
      });
    }
    if (verbose && child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        process.stderr.write(`[bap-server] ${data.toString()}`);
      });
    }

    child.unref();

    if (child.pid) {
      writePidFile(child.pid);
    }

    // Wait for server to be ready
    await waitForServer(port, host);

    if (verbose) {
      process.stderr.write(`[bap] Server ready on ws://${host}:${port}\n`);
    }

    this.client = await createClient(url, {
      name: "bap-cli",
      sessionId: this.options.sessionId,
      timeout: this.options.timeout,
    });
    return this.client;
  }

  /**
   * Get a ready-to-use client with browser and page auto-initialized.
   *
   * Ensures a browser is launched and at least one page exists.
   * Reuses existing pages from session persistence when available.
   * Falls back to ensureClient() semantics (WebSocket only) for
   * commands that manage their own lifecycle (open, close, sessions).
   */
  async ensureReady(): Promise<BAPClient> {
    const client = await this.ensureClient();

    // Check if pages already exist (e.g., from session persistence)
    const { pages, activePage } = await client.listPages();

    const usablePage = pickUsablePage(pages, activePage);
    if (usablePage) {
      // Sync client's active page tracking with server state
      await client.activatePage(usablePage.id);
      return client;
    }

    // No pages — auto-initialize browser + page
    await launchBrowserWithFallback(client, {
      browser: this.options.browser,
      headless: this.options.headless,
      profile: this.options.profile,
    });

    const launchedPages = await client.listPages();
    const launchPage = pickExistingPage(launchedPages.pages, launchedPages.activePage);
    if (launchPage) {
      await client.activatePage(launchPage.id);
      return client;
    }

    await client.createPage();

    return client;
  }

  /**
   * Disconnect the WebSocket client (server keeps running).
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  /**
   * Kill the background server process.
   */
  static killServer(): void {
    const pid = readPidFile();
    if (pid !== null) {
      try {
        process.kill(pid, "SIGTERM");
        setTimeout(() => {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // Already dead
          }
        }, 500);
      } catch {
        // Process already gone
      }
      removePidFile();
    }
  }
}

export async function connectIfServerRunning(options: {
  port: number;
  host?: string;
  timeout?: number;
}): Promise<BAPClient | null> {
  const host = options.host ?? "localhost";

  if (!(await isPortInUse(options.port, host))) {
    return null;
  }

  return createClient(`ws://${host}:${options.port}`, {
    name: "bap-cli",
    timeout: options.timeout,
  });
}
