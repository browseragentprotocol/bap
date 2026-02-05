#!/usr/bin/env node
/**
 * @fileoverview BAP MCP Server CLI
 *
 * Run the BAP MCP server from the command line.
 *
 * Usage:
 *   bap-mcp                          # Use defaults (ws://localhost:9222)
 *   bap-mcp --url ws://host:port     # Custom BAP server URL
 *   bap-mcp --verbose                # Enable verbose logging
 *   bap-mcp --allowed-domains example.com,api.example.com
 */

import { Logger, icons, pc } from "@browseragentprotocol/logger";
import { BAPMCPServer } from "./index.js";

// MCP servers should log to stderr to avoid interfering with stdio transport
const log = new Logger({ prefix: "BAP MCP", stderr: true });

// =============================================================================
// Argument Parsing
// =============================================================================

interface CLIArgs {
  url?: string;
  verbose?: boolean;
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
    } else if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
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

${pc.cyan("OPTIONS")}
  ${pc.yellow("-u, --url")} ${pc.dim("<url>")}             BAP server WebSocket URL ${pc.dim("(default: ws://localhost:9222)")}
  ${pc.yellow("-v, --verbose")}               Enable verbose logging to stderr
  ${pc.yellow("--allowed-domains")} ${pc.dim("<list>")}   Comma-separated list of allowed domains
  ${pc.yellow("-h, --help")}                  Show this help message
  ${pc.yellow("--version")}                   Show version

${pc.cyan("EXAMPLES")}
  ${pc.dim("# Start with defaults (connect to localhost:9222)")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp

  ${pc.dim("# Connect to a remote BAP server")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --url ws://192.168.1.100:9222

  ${pc.dim("# Enable verbose logging")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --verbose

  ${pc.dim("# Restrict to specific domains (security)")}
  ${pc.dim("$")} npx @browseragentprotocol/mcp --allowed-domains example.com,api.example.com

${pc.cyan("CLAUDE DESKTOP")}
  Add to ${pc.dim("claude_desktop_config.json")}:

  ${pc.dim("{")}
    ${pc.dim('"mcpServers"')}: {
      ${pc.green('"bap-browser"')}: {
        "command": "npx",
        "args": ["@browseragentprotocol/mcp"]
      }
    }
  ${pc.dim("}")}

${pc.cyan("CLAUDE CODE")}
  ${pc.dim("$")} claude mcp add --transport stdio bap-browser -- npx @browseragentprotocol/mcp

${pc.dim("For more information:")} ${pc.cyan("https://github.com/browseragentprotocol/bap")}
`);
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
      `${icons.connection} BAP MCP Server ${pc.dim("v0.1.0-alpha.1")}`
    );
    process.exit(0);
  }

  // Set log level based on verbose flag
  if (args.verbose) {
    log.setLevel("debug");
  }

  const server = new BAPMCPServer({
    bapServerUrl: args.url,
    verbose: args.verbose,
    allowedDomains: args.allowedDomains,
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    if (args.verbose) {
      log.info(`${signal} received, shutting down...`);
    }
    await server.close();
    if (args.verbose) {
      log.success("Server stopped");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", reason);
    process.exit(1);
  });

  try {
    if (args.verbose) {
      log.info(`Connecting to BAP server at ${args.url ?? "ws://localhost:9222"}`);
    }
    await server.run();
  } catch (error) {
    log.error("Failed to start server", error);
    process.exit(1);
  }
}

main();
