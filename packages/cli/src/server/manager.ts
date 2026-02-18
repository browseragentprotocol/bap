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
  intervalMs: number = 150,
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

const BROWSER_MAP: Record<string, string> = {
  chrome: "chromium",
  chromium: "chromium",
  firefox: "firefox",
  webkit: "webkit",
  edge: "chromium",
};

// =============================================================================
// Server Manager
// =============================================================================

export class ServerManager {
  private options: Required<ServerManagerOptions>;
  private client: BAPClient | null = null;

  constructor(options: ServerManagerOptions) {
    this.options = {
      host: "localhost",
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
      this.client = await createClient(url, { name: "bap-cli" });
      return this.client;
    }

    // Start server as detached background process
    if (verbose) {
      process.stderr.write(`[bap] Starting server on port ${port}...\n`);
    }

    const { command, args } = resolveServerCommand();
    const serverArgs = [
      ...args,
      "--port", port.toString(),
      "--host", host,
      headless ? "--headless" : "--no-headless",
      "--browser", BROWSER_MAP[browser] ?? "chromium",
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

    this.client = await createClient(url, { name: "bap-cli" });
    return this.client;
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
