#!/usr/bin/env node
/**
 * @fileoverview BAP CLI - CLI-first browser automation for coding agents
 *
 * Like playwright-cli but with superpowers:
 * - Composite actions (bap act) — fewer commands and tokens
 * - Semantic selectors — resilient to layout changes
 * - Structured extraction — validated JSON output
 *
 * Usage:
 *   bap open https://example.com
 *   bap act fill:e5="user@example.com" fill:e8="pass" click:e12
 *   bap observe --forms --max=20
 *   bap extract --fields="title,price"
 */

import { pc } from "@browseragentprotocol/logger";
import { parseArgs } from "./config/state.js";
import { getCommand } from "./commands/index.js";
import { ServerManager } from "./server/manager.js";

// =============================================================================
// Help & Version
// =============================================================================

function printHelp(): void {
  console.log(`
${pc.bold("BAP CLI")} ${pc.dim("- CLI-first browser automation for coding agents")}

${pc.yellow("ESSENTIALS")} ${pc.dim("(start here)")}
  bap goto <url>                    Navigate to URL
  bap observe                       See interactive elements with refs
  bap act <step1> <step2> ...       Multi-step actions in one call
  bap extract --fields="a,b"        Extract structured data
  bap screenshot                    Take screenshot

${pc.cyan("ACTIONS")}
  bap click <ref|selector>          Click element
  bap fill <ref|selector> <value>   Fill input field
  bap type <text>                   Type text into focused element
  bap press <key>                   Press keyboard key
  bap select <ref|selector> <val>   Select dropdown option
  bap check <ref|selector>          Check checkbox
  bap uncheck <ref|selector>        Uncheck checkbox
  bap hover <ref|selector>          Hover over element
  bap scroll [dir] [--pixels=N]    Scroll page (up/down/left/right)
  bap snapshot                      Accessibility tree snapshot

${pc.cyan("NAVIGATION")}
  bap open [url]                    Open browser (optionally navigate)
  bap back                          Go back
  bap forward                       Go forward
  bap reload                        Reload page
  bap close                         Close browser
  bap close-all                     Close all sessions and server

${pc.cyan("COMPOSITE ACTIONS")}
  bap act <step1> <step2> ...       Execute multiple steps atomically

  ${pc.dim("Steps: action:selector=value or action:selector")}
  ${pc.dim("Example:")}
    bap act fill:e5="user@example.com" fill:e8="pass" click:e12
    bap act fill:role:textbox:"Email"="user@example.com" \\
            fill:role:textbox:"Password"="secret" \\
            click:role:button:"Sign in"

${pc.cyan("SEMANTIC SELECTORS")}
  role:<role>:"<name>"              By ARIA role and name
  text:"<content>"                  By visible text content
  label:"<text>"                    By associated label
  placeholder:"<text>"              By placeholder text
  testid:"<id>"                     By data-testid attribute
  e<N>                              By snapshot ref (compat)

${pc.cyan("SMART OBSERVATION")}
  bap observe                       Interactive elements (default max 50)
  bap observe --full                Full accessibility tree
  bap observe --forms               Form fields only
  bap observe --navigation          Navigation elements only
  bap observe --max=<N>             Limit elements

${pc.cyan("STRUCTURED EXTRACTION")}
  bap extract --fields="title,price"         Quick field extraction
  bap extract --schema=schema.json           JSON Schema extraction
  bap extract --list="product"               Extract item list

${pc.cyan("SESSIONS & TABS")}
  bap -s=<name> <command>           Named session
  bap sessions                      List sessions
  bap tabs                          List tabs
  bap tab-new [url]                 New tab
  bap tab-select <N>                Switch tab

${pc.cyan("RECIPES")}
  bap recipe login <url> --user=<u> --pass=<p>
  bap recipe fill-form <url> --data=data.json
  bap recipe wait-for <selector> [--timeout=ms]

${pc.cyan("TRACING")}
  bap trace                         Show last 10 steps from most recent trace
  bap trace --all                   Show all steps
  bap trace --sessions              List all trace sessions
  bap trace --session=<id>          Show trace for a specific session
  bap trace --replay                Generate HTML timeline viewer
  bap trace --export=<file>         Export trace as JSON
  bap trace --limit=<N>             Show last N entries (default: 10)

${pc.cyan("DEBUGGING")}
  bap watch                         Stream live browser events
  bap watch --filter=console        Filter by event type
  bap demo                          Guided walkthrough for first-time users

${pc.cyan("CONFIGURATION")}
  bap config [key] [value]          View/set configuration
  bap install-skill                 Install skill to all detected agents
  bap skill init                    Install skill to project

${pc.cyan("GLOBAL OPTIONS")}
  -s=<name>                         Named session
  -p, --port <N>                    Server port (default: 9222)
  -b, --browser <name>              Browser: chrome, chromium, firefox, webkit, edge
  --headless / --no-headless        Browser visibility (default: visible)
  --profile <path>                  Chrome profile dir (default: auto-detect)
  --no-profile                      Fresh browser, no user profile
  --format <mode>                    Output: pretty (TTY), json (pipe), agent (default)
  -v, --verbose                     Verbose output
  -h, --help                        Show this help
  -V, --version                     Show version

${pc.dim("Docs:")} ${pc.cyan("https://github.com/browseragentprotocol/bap")}
`);
}

function printVersion(): void {
  console.log("bap-cli 0.8.0");
}

// =============================================================================
// Command routing
// =============================================================================

/** Commands that don't need a server connection at all */
const NO_SERVER_COMMANDS = new Set(["config", "install-skill", "skill", "trace", "--help", "-h"]);

/**
 * Commands that need a server connection but manage their own browser/page
 * lifecycle. These use ensureClient() (WebSocket only), not ensureReady().
 */
const CLIENT_ONLY_COMMANDS = new Set([
  "open", // explicitly launches browser + creates page
  "close", // tears down browser — don't auto-create one
  "close-all", // tears down everything — don't auto-create
  "sessions", // informational — just lists contexts
  "tabs", // informational — just lists pages
  "watch", // long-running event stream — don't auto-create browser
]);

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  // Set output format: explicit flag > TTY detection > "agent"
  const { setOutputFormat } = await import("./output/formatter.js");
  if (flags.format) {
    setOutputFormat(flags.format);
  } else if (process.stdout.isTTY) {
    setOutputFormat("pretty");
  }

  let serverManager: ServerManager | null = null;
  let shuttingDown = false;

  const cleanupAndExit = (code: number) => async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    try {
      await serverManager?.disconnect();
    } catch {
      // Best effort during shutdown
    }

    process.exit(code);
  };

  const handleSigint = cleanupAndExit(130);
  const handleSigterm = cleanupAndExit(143);

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  if (!flags.command && process.argv.length <= 2) {
    console.log(`
${pc.bold("BAP")} ${pc.dim("— Browser Agent Protocol")}

${pc.cyan("Quick start:")}
  ${pc.green("bap goto")} https://example.com    Navigate to a page
  ${pc.green("bap observe")}                      See interactive elements
  ${pc.green("bap click")} e5                      Click an element by ref
  ${pc.green("bap act")} fill:e5="hi" click:e12   Multi-step actions
  ${pc.green("bap trace")}                        View session history

${pc.dim("Run")} bap demo ${pc.dim("for a guided walkthrough")}
${pc.dim("Run")} bap --help ${pc.dim("for all commands")}
`);
    process.exit(0);
  }

  if (flags.version) {
    printVersion();
    process.exit(0);
  }

  if (!flags.command) {
    printHelp();
    process.exit(1);
  }

  const handler = getCommand(flags.command);
  if (!handler) {
    console.error(`Unknown command: ${flags.command}`);
    console.error("Run 'bap --help' for usage.");
    process.exit(1);
  }

  // Some commands don't need a server (config, install-skill)
  if (NO_SERVER_COMMANDS.has(flags.command)) {
    // Pass a dummy client — these commands don't use it
    await handler(flags.args, flags, {} as never);
    return;
  }

  // All other commands need a BAP server
  const sessionId = flags.session ?? `cli-${flags.port}`;
  serverManager = new ServerManager({
    port: flags.port,
    host: flags.host,
    browser: flags.browser,
    headless: flags.headless,
    verbose: flags.verbose,
    timeout: flags.timeout,
    sessionId,
    profile: flags.profile,
  });

  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  try {
    const client = CLIENT_ONLY_COMMANDS.has(flags.command)
      ? await serverManager.ensureClient()
      : await serverManager.ensureReady();
    await handler(flags.args, flags, client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  } finally {
    await serverManager.disconnect();
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
  }
}

main();
