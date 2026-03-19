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

// =============================================================================
// Server Discovery
// =============================================================================

/**
 * Check if a port is in use by attempting a TCP connection.
 */
function isPortInUse(port: number, host: string = "localhost"): Promise<boolean> {
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

    // Filter out about:blank pages — these are ghost pages from failed session
    // restores and shouldn't count as usable restored state.
    const usablePages = pages.filter((p) => p.url && p.url !== "about:blank");

    if (usablePages.length > 0) {
      // Sync client's active page tracking with server state
      const targetPage = activePage && activePage.length > 0 ? activePage : usablePages[0]!.id;
      await client.activatePage(targetPage);
      return client;
    }

    // No pages — auto-initialize browser + page
    const browserType = BROWSER_MAP[this.options.browser] ?? "chromium";
    const channel = CHANNEL_MAP[this.options.browser];
    const userDataDir = this.options.profile
      ? resolveProfile(this.options.profile, this.options.browser)
      : undefined;

    await client.launch({
      browser: browserType,
      channel,
      headless: this.options.headless,
      ...(userDataDir ? { userDataDir } : {}),
    });

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
