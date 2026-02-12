#!/usr/bin/env node
/**
 * @fileoverview BAP MCP Server CLI
 *
 * Run the BAP MCP server from the command line.
 * By default, auto-starts a BAP Playwright server (standalone mode).
 * Use --url to connect to an existing BAP server instead.
 *
 * Usage:
 *   bap-mcp                          # Standalone: auto-starts BAP server
 *   bap-mcp --url ws://host:port     # Connect to existing BAP server
 *   bap-mcp --browser firefox        # Use Firefox
 *   bap-mcp --verbose                # Enable verbose logging
 *   bap-mcp --allowed-domains example.com,api.example.com
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger, icons, pc } from "@browseragentprotocol/logger";
import { BAPMCPServer, type BrowserChoice } from "./index.js";

// MCP servers should log to stderr to avoid interfering with stdio transport
const log = new Logger({ prefix: "BAP MCP", stderr: true });

// =============================================================================
// Argument Parsing
// =============================================================================

interface CLIArgs {
  url?: string;
  port?: number;
  browser?: string;
  verbose?: boolean;
  headless?: boolean;
  allowedDomains?: string[];
  help?: boolean;
  version?: boolean;
}

function parseArgs(): CLIArgs {
  const args: CLIArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--version") {
      args.version = true;
    } else if (arg === "--url" || arg === "-u" || arg === "--bap-url") {
      args.url = argv[++i];
    } else if (arg === "--port" || arg === "-p") {
      args.port = parseInt(argv[++i] ?? "9222", 10);
    } else if (arg === "--browser" || arg === "-b") {
      args.browser = argv[++i];
    } else if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
    } else if (arg === "--headless") {
      args.headless = true;
    } else if (arg === "--headless=true") {
      args.headless = true;
    } else if (arg === "--headless=false" || arg === "--no-headless") {
      args.headless = false;
    } else if (arg === "--allowed-domains") {
      args.allowedDomains = argv[++i]?.split(",").map((d) => d.trim());
    }
  }

  return args;
}

function printHelp(): void {
  console.error(`
${pc.bold("BAP MCP Server")} ${pc.dim("- Browser Agent Protocol as MCP")}

${pc.cyan("USAGE")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp ${pc.dim("[OPTIONS]")}

  By default, auto-starts a local BAP Playwright server (standalone mode).
  Pass ${pc.yellow("--url")} to connect to an existing BAP server instead.

${pc.cyan("OPTIONS")}
  ${pc.yellow("-b, --browser")} ${pc.dim("<name>")}        Browser: chrome ${pc.dim("(default)")}, chromium, firefox, webkit, edge
  ${pc.yellow("-u, --url")} ${pc.dim("<url>")}             Connect to existing BAP server ${pc.dim("(skips auto-start)")}
  ${pc.yellow("-p, --port")} ${pc.dim("<number>")}         Port for auto-started server ${pc.dim("(default: 9222)")}
  ${pc.yellow("--headless")}                Run browser in headless mode ${pc.dim("(default: true)")}
  ${pc.yellow("--no-headless")}             Run with visible browser window
  ${pc.yellow("-v, --verbose")}               Enable verbose logging to stderr
  ${pc.yellow("--allowed-domains")} ${pc.dim("<list>")}   Comma-separated list of allowed domains
  ${pc.yellow("-h, --help")}                  Show this help message
  ${pc.yellow("--version")}                   Show version

${pc.cyan("EXAMPLES")}
  ${pc.dim("# Standalone mode (auto-starts server, uses local Chrome)")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp

  ${pc.dim("# Use Firefox")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --browser firefox

  ${pc.dim("# Visible browser window")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --no-headless

  ${pc.dim("# Connect to a remote BAP server (skips auto-start)")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --url ws://192.168.1.100:9222

  ${pc.dim("# Domain allowlist")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --allowed-domains example.com,api.example.com

${pc.cyan("MCP CLIENT SETUP")}
  ${pc.dim("Add to any MCP-compatible client (config examples):")}

  ${pc.dim("JSON config:")}
  ${pc.dim("{")}
    ${pc.dim('"mcpServers"')}: {
      ${pc.green('"bap-browser"')}: {
        "command": "npx",
        "args": ["-y", "@browseragentprotocol/mcp"]
      }
    }
  ${pc.dim("}")}

  ${pc.dim("CLI:")}
  ${pc.dim("$")} ${pc.dim("<client>")} mcp add --transport stdio bap-browser -- npx -y @browseragentprotocol/mcp

${pc.dim("Docs:")} ${pc.cyan("https://github.com/browseragentprotocol/bap")}
`);
}

// =============================================================================
// Standalone Server Management
// =============================================================================

/**
 * Check if a port is available by attempting a TCP connection.
 * Returns true if something is already listening on the port.
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
 * Polls with the specified interval until timeout.
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
 * Resolve the command to start the server-playwright CLI.
 *
 * In monorepo development, the sibling package's built CLI is used directly
 * to avoid npx overhead. In published (npm install) usage, falls back to npx.
 */
function resolveServerCommand(): { command: string; args: string[] } {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const siblingCli = path.resolve(__dirname, "../../server-playwright/dist/cli.js");

    if (fs.existsSync(siblingCli)) {
      return { command: "node", args: [siblingCli] };
    }
  } catch {
    // import.meta.url resolution failed — not in ESM context, fall through
  }

  return { command: "npx", args: ["-y", "@browseragentprotocol/server-playwright"] };
}

interface StandaloneServerOptions {
  port: number;
  host: string;
  browser: string;
  headless: boolean;
  verbose: boolean;
}

/**
 * Start the BAP Playwright server as a child process.
 *
 * If a server is already listening on the target port, reuses it and returns
 * null (caller should not attempt to kill it on shutdown).
 *
 * Otherwise, spawns the server-playwright CLI, waits for it to be ready,
 * and returns the ChildProcess handle for lifecycle management.
 */
async function startStandaloneServer(
  options: StandaloneServerOptions,
): Promise<ChildProcess | null> {
  const { port, host, browser, headless, verbose } = options;

  // Reuse an existing server if one is already on this port
  if (await isPortInUse(port, host)) {
    log.info(`BAP server already running on ${host}:${port}, reusing`);
    return null;
  }

  log.info(`Starting BAP Playwright server on port ${port}...`);

  const { command, args } = resolveServerCommand();
  const serverArgs = [
    ...args,
    "--port", port.toString(),
    "--host", host,
    headless ? "--headless" : "--no-headless",
  ];

  // Map MCP-level browser names to server-playwright's accepted values
  const browserMap: Record<string, string> = {
    chrome: "chromium",
    chromium: "chromium",
    firefox: "firefox",
    webkit: "webkit",
    edge: "chromium",
  };
  serverArgs.push("--browser", browserMap[browser] ?? "chromium");

  if (verbose) {
    serverArgs.push("--debug");
  }

  const child = spawn(command, serverArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    env: { ...process.env },
  });

  // Pipe server output to stderr when verbose (MCP uses stdout for stdio transport)
  if (verbose) {
    child.stdout?.on("data", (data: Buffer) => {
      process.stderr.write(`[BAP Server] ${data.toString()}`);
    });
    child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[BAP Server] ${data.toString()}`);
    });
  }

  child.on("error", (err) => {
    log.error("Failed to start BAP server", err);
  });

  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      log.error(`BAP server exited with code ${code}`);
    } else if (signal && verbose) {
      log.info(`BAP server stopped (${signal})`);
    }
  });

  // Wait for the server to become available
  try {
    await waitForServer(port, host);
    log.info(`BAP server ready on ws://${host}:${port}`);
  } catch (err) {
    child.kill("SIGTERM");
    throw err;
  }

  return child;
}

/**
 * Kill a child process gracefully (SIGTERM), escalating to SIGKILL after 500ms.
 */
async function killServer(child: ChildProcess): Promise<void> {
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    console.error(
      `${icons.connection} BAP MCP Server ${pc.dim("v0.2.0")}`
    );
    process.exit(0);
  }

  if (args.verbose) {
    log.setLevel("debug");
  }

  // Determine mode: standalone (auto-start server) vs connect to existing
  const isStandalone = !args.url;
  const port = args.port ?? 9222;
  const host = "localhost";
  const bapServerUrl = args.url ?? `ws://${host}:${port}`;
  let serverProcess: ChildProcess | null = null;

  try {
    if (isStandalone) {
      if (args.verbose) {
        log.info("Standalone mode: auto-starting BAP Playwright server");
      }

      serverProcess = await startStandaloneServer({
        port,
        host,
        browser: args.browser ?? "chrome",
        headless: args.headless ?? true,
        verbose: args.verbose ?? false,
      });
    }

    const server = new BAPMCPServer({
      bapServerUrl,
      browser: args.browser as BrowserChoice | undefined,
      verbose: args.verbose,
      allowedDomains: args.allowedDomains,
    });

    // Graceful shutdown — clean up MCP server and child process
    const shutdown = async (signal: string) => {
      if (args.verbose) {
        log.info(`${signal} received, shutting down...`);
      }

      await server.close();

      if (serverProcess) {
        await killServer(serverProcess);
      }

      if (args.verbose) {
        log.success("Server stopped");
      }
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    process.on("uncaughtException", (error) => {
      log.error("Uncaught exception", error);
      serverProcess?.kill("SIGTERM");
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      log.error("Unhandled rejection", reason);
      serverProcess?.kill("SIGTERM");
      process.exit(1);
    });

    if (args.verbose) {
      log.info(`Connecting to BAP server at ${bapServerUrl}`);
    }
    await server.run();
  } catch (error) {
    serverProcess?.kill("SIGTERM");
    log.error("Failed to start server", error);
    process.exit(1);
  }
}

main();
