#!/usr/bin/env node
/**
 * BAP Server CLI
 *
 * Starts a Browser Agent Protocol server using Playwright.
 *
 * Usage:
 *   npx bap-server                    # Start with defaults
 *   npx bap-server --port 9333        # Custom port
 *   npx bap-server --headless=false   # Visible browser
 *   npx bap-server --browser firefox  # Use Firefox
 */

import {
  Logger,
  banner,
  table,
  icons,
  pc,
} from "@browseragentprotocol/logger";
import { BAPPlaywrightServer, BAPServerOptions } from "./server.js";

const log = new Logger({ prefix: "BAP Server" });

// Parse command line arguments
function parseArgs(): Partial<BAPServerOptions> {
  const args = process.argv.slice(2);
  const config: Partial<BAPServerOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === "--port" || arg === "-p") {
      const nextArg = args[++i];
      if (nextArg) config.port = parseInt(nextArg, 10);
    } else if (arg.startsWith("--port=")) {
      const value = arg.split("=")[1];
      if (value) config.port = parseInt(value, 10);
    } else if (arg === "--host" || arg === "-h") {
      const nextArg = args[++i];
      if (nextArg) config.host = nextArg;
    } else if (arg.startsWith("--host=")) {
      const value = arg.split("=")[1];
      if (value) config.host = value;
    } else if (arg === "--headless") {
      config.headless = true;
    } else if (arg === "--headless=false" || arg === "--no-headless") {
      config.headless = false;
    } else if (arg === "--headless=true") {
      config.headless = true;
    } else if (arg === "--browser" || arg === "-b") {
      const nextArg = args[++i];
      if (nextArg)
        config.defaultBrowser = nextArg as "chromium" | "firefox" | "webkit";
    } else if (arg.startsWith("--browser=")) {
      const value = arg.split("=")[1];
      if (value)
        config.defaultBrowser = value as "chromium" | "firefox" | "webkit";
    } else if (arg === "--timeout" || arg === "-t") {
      const nextArg = args[++i];
      if (nextArg) config.timeout = parseInt(nextArg, 10);
    } else if (arg.startsWith("--timeout=")) {
      const value = arg.split("=")[1];
      if (value) config.timeout = parseInt(value, 10);
    } else if (arg === "--debug" || arg === "-d") {
      config.debug = true;
    } else if (arg === "--token") {
      const nextArg = args[++i];
      if (nextArg) config.authToken = nextArg;
    } else if (arg.startsWith("--token=")) {
      const value = arg.split("=")[1];
      if (value) config.authToken = value;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log(
        `${icons.server} BAP Playwright Server ${pc.dim("v0.1.0-alpha.1")}`
      );
      process.exit(0);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
${pc.bold("BAP Playwright Server")} ${pc.dim("- Browser Agent Protocol implementation")}

${pc.cyan("USAGE")}
  ${pc.dim("$")} npx @browseragentprotocol/server-playwright ${pc.dim("[OPTIONS]")}

${pc.cyan("OPTIONS")}
  ${pc.yellow("-p, --port")} ${pc.dim("<number>")}       WebSocket port ${pc.dim("(default: 9222)")}
  ${pc.yellow("-h, --host")} ${pc.dim("<host>")}         Host to bind to ${pc.dim("(default: localhost)")}
  ${pc.yellow("-b, --browser")} ${pc.dim("<browser>")}   Browser: chromium, firefox, webkit ${pc.dim("(default: chromium)")}
  ${pc.yellow("--headless")}                Run in headless mode ${pc.dim("(default: true)")}
  ${pc.yellow("--no-headless")}             Run with visible browser window
  ${pc.yellow("-t, --timeout")} ${pc.dim("<ms>")}        Default action timeout ${pc.dim("(default: 30000)")}
  ${pc.yellow("-d, --debug")}               Enable debug logging
  ${pc.yellow("--token")} ${pc.dim("<token>")}           Authentication token for client connections
  ${pc.yellow("--help")}                    Show this help message
  ${pc.yellow("-v, --version")}             Show version

${pc.cyan("EXAMPLES")}
  ${pc.dim("# Start with defaults (headless Chromium on port 9222)")}
  ${pc.dim("$")} npx @browseragentprotocol/server-playwright

  ${pc.dim("# Start with visible browser on custom port")}
  ${pc.dim("$")} npx @browseragentprotocol/server-playwright --port 9333 --no-headless

  ${pc.dim("# Start Firefox with debug logging")}
  ${pc.dim("$")} npx @browseragentprotocol/server-playwright --browser firefox --debug

  ${pc.dim("# Start with authentication enabled")}
  ${pc.dim("$")} npx @browseragentprotocol/server-playwright --token my-secret-token

${pc.cyan("CONNECTING")}
  Once the server is running, connect via WebSocket:

  ${pc.dim("TypeScript:")}
    import { BAPClient } from '@browseragentprotocol/client';
    const client = new BAPClient("ws://localhost:9222");

${pc.dim("For more information:")} ${pc.cyan("https://github.com/browseragentprotocol/bap")}
`);
}

async function main(): Promise<void> {
  const config = parseArgs();

  const server = new BAPPlaywrightServer({
    port: config.port ?? 9222,
    host: config.host ?? "localhost",
    defaultBrowser: config.defaultBrowser ?? "chromium",
    headless: config.headless ?? true,
    debug: config.debug ?? false,
    timeout: config.timeout ?? 30000,
    authToken: config.authToken,
  });

  const hasAuth = !!(config.authToken || process.env["BAP_AUTH_TOKEN"]);

  // Handle shutdown signals
  const shutdown = async (signal: string): Promise<void> => {
    console.log();
    log.info(`${signal} received, shutting down...`);
    await server.stop();
    log.success("Server stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start the server
  try {
    await server.start();

    const url = `ws://${config.host ?? "localhost"}:${config.port ?? 9222}`;
    const browserName = config.defaultBrowser ?? "chromium";

    // Print startup banner
    console.log();
    console.log(
      banner({
        title: "BAP Playwright Server",
        version: "0.1.0-alpha.1",
        subtitle: "Browser Agent Protocol",
      })
    );
    console.log();

    // Print server info table
    console.log(
      table([
        { icon: icons.play, label: "Status", value: pc.green("Running") },
        { icon: icons.connection, label: "URL", value: pc.cyan(url) },
        { icon: icons.browser, label: "Browser", value: browserName },
        {
          icon: config.headless !== false ? icons.server : icons.browser,
          label: "Headless",
          value: config.headless !== false ? "Yes" : pc.yellow("No"),
        },
        {
          icon: hasAuth ? icons.lock : icons.unlock,
          label: "Auth",
          value: hasAuth ? pc.green("Enabled") : pc.dim("Disabled"),
        },
      ])
    );
    console.log();
    console.log(pc.dim(`  Press ${pc.white("Ctrl+C")} to stop`));
    console.log();
  } catch (error) {
    log.error("Failed to start server", error);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error("Fatal error", error);
  process.exit(1);
});
