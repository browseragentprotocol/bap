#!/usr/bin/env node
/**
 * @fileoverview BAP CLI - AI-native browser automation
 *
 * Like playwright-cli but with superpowers:
 * - Composite actions (bap act) — 40x token reduction
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
${pc.bold("BAP CLI")} ${pc.dim("- AI-native browser automation")}

${pc.cyan("BASIC COMMANDS")} ${pc.dim("(playwright-cli compatible)")}
  bap open [url]                    Open browser (optionally navigate)
  bap goto <url>                    Navigate to URL
  bap click <ref|selector>          Click element
  bap fill <ref|selector> <value>   Fill input field
  bap type <text>                   Type text into focused element
  bap press <key>                   Press keyboard key
  bap select <ref|selector> <val>   Select dropdown option
  bap check <ref|selector>          Check checkbox
  bap uncheck <ref|selector>        Uncheck checkbox
  bap hover <ref|selector>          Hover over element
  bap screenshot [--file=F]         Take screenshot
  bap snapshot [--file=F]           Save accessibility snapshot (YAML)
  bap close                         Close browser
  bap close-all                     Close all sessions and server

${pc.cyan("NAVIGATION")}
  bap back                          Go back
  bap forward                       Go forward
  bap reload                        Reload page

${pc.cyan("COMPOSITE ACTIONS")} ${pc.dim("(the killer feature)")}
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

${pc.cyan("CONFIGURATION")}
  bap config [key] [value]          View/set configuration
  bap install-skill                 Install skill to all detected agents
  bap skill init                    Install skill to project

${pc.cyan("GLOBAL OPTIONS")}
  -s=<name>                         Named session
  -p, --port <N>                    Server port (default: 9222)
  -b, --browser <name>              Browser: chrome, firefox, webkit, edge
  --headless / --no-headless        Headless mode
  -v, --verbose                     Verbose output
  -h, --help                        Show this help
  -V, --version                     Show version

${pc.dim("Docs:")} ${pc.cyan("https://github.com/browseragentprotocol/bap")}
`);
}

function printVersion(): void {
  console.log("bap-cli 0.2.0");
}

// =============================================================================
// Commands that don't need a server connection
// =============================================================================

const NO_SERVER_COMMANDS = new Set([
  "config", "install-skill", "skill", "--help", "-h",
]);

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || (!flags.command && process.argv.length <= 2)) {
    printHelp();
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
  const serverManager = new ServerManager({
    port: flags.port,
    host: flags.host,
    browser: flags.browser,
    headless: flags.headless,
    verbose: flags.verbose,
  });

  try {
    const client = await serverManager.ensureClient();
    await handler(flags.args, flags, client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  } finally {
    await serverManager.disconnect();
  }
}

main();
