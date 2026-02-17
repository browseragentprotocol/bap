/**
 * @fileoverview Global flags parsing and configuration management
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// =============================================================================
// Types
// =============================================================================

export interface GlobalFlags {
  command: string;
  args: string[];
  session?: string;
  port: number;
  host: string;
  browser: string;
  headless: boolean;
  verbose: boolean;
  help: boolean;
  version: boolean;
  // observe flags
  full?: boolean;
  forms?: boolean;
  navigation?: boolean;
  max?: number;
  // extract flags
  fields?: string;
  schema?: string;
  list?: string;
  // install-skill flags
  project?: boolean;
  global?: boolean;
  dryRun?: boolean;
  // output flags
  file?: string;
  // recipe flags
  user?: string;
  pass?: string;
  data?: string;
  timeout?: number;
  userField?: string;
  passField?: string;
}

export interface BAPConfig {
  browser: string;
  headless: boolean;
  timeout: number;
  port: number;
}

const DEFAULT_CONFIG: BAPConfig = {
  browser: "chrome",
  headless: true,
  timeout: 30000,
  port: 9222,
};

// =============================================================================
// Config File Management
// =============================================================================

function getConfigDir(): string {
  return path.join(os.homedir(), ".bap");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function loadConfig(): BAPConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<BAPConfig>): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), "utf-8");
}

// =============================================================================
// Argument Parsing
// =============================================================================

export function parseArgs(argv: string[]): GlobalFlags {
  const config = loadConfig();

  const flags: GlobalFlags = {
    command: "",
    args: [],
    port: config.port,
    host: "localhost",
    browser: config.browser,
    headless: config.headless,
    verbose: false,
    help: false,
    version: false,
  };

  const remaining: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    // Global flags
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--version" || arg === "-V") {
      flags.version = true;
    } else if (arg === "--verbose" || arg === "-v") {
      flags.verbose = true;
    } else if (arg === "--port" || arg === "-p") {
      flags.port = parseInt(argv[++i] ?? "9222", 10);
    } else if (arg.startsWith("--port=")) {
      flags.port = parseInt(arg.slice(7), 10);
    } else if (arg === "--browser" || arg === "-b") {
      flags.browser = argv[++i] ?? "chrome";
    } else if (arg.startsWith("--browser=")) {
      flags.browser = arg.slice(10);
    } else if (arg === "--headless") {
      flags.headless = true;
    } else if (arg === "--no-headless") {
      flags.headless = false;
    } else if (arg.startsWith("-s=")) {
      flags.session = arg.slice(3);
    } else if (arg === "-s") {
      flags.session = argv[++i];
    }
    // observe flags
    else if (arg === "--full") {
      flags.full = true;
    } else if (arg === "--forms") {
      flags.forms = true;
    } else if (arg === "--navigation") {
      flags.navigation = true;
    } else if (arg.startsWith("--max=")) {
      flags.max = parseInt(arg.slice(6), 10);
    } else if (arg === "--max") {
      flags.max = parseInt(argv[++i] ?? "50", 10);
    }
    // extract flags
    else if (arg.startsWith("--fields=")) {
      flags.fields = arg.slice(9);
    } else if (arg === "--fields") {
      flags.fields = argv[++i];
    } else if (arg.startsWith("--schema=")) {
      flags.schema = arg.slice(9);
    } else if (arg === "--schema") {
      flags.schema = argv[++i];
    } else if (arg.startsWith("--list=")) {
      flags.list = arg.slice(7);
    } else if (arg === "--list") {
      flags.list = argv[++i];
    }
    // install-skill flags
    else if (arg === "--project") {
      flags.project = true;
    } else if (arg === "--global") {
      flags.global = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    }
    // output flags
    else if (arg.startsWith("--file=")) {
      flags.file = arg.slice(7);
    } else if (arg === "--file") {
      flags.file = argv[++i];
    }
    // recipe flags
    else if (arg.startsWith("--user=")) {
      flags.user = arg.slice(7);
    } else if (arg === "--user") {
      flags.user = argv[++i];
    } else if (arg.startsWith("--pass=")) {
      flags.pass = arg.slice(7);
    } else if (arg === "--pass") {
      flags.pass = argv[++i];
    } else if (arg.startsWith("--data=")) {
      flags.data = arg.slice(7);
    } else if (arg === "--data") {
      flags.data = argv[++i];
    } else if (arg.startsWith("--timeout=")) {
      flags.timeout = parseInt(arg.slice(10), 10);
    } else if (arg === "--timeout") {
      flags.timeout = parseInt(argv[++i] ?? "30000", 10);
    } else if (arg.startsWith("--user-field=")) {
      flags.userField = arg.slice(13);
    } else if (arg.startsWith("--pass-field=")) {
      flags.passField = arg.slice(13);
    }
    // positional args
    else {
      remaining.push(arg);
    }
  }

  // First positional arg is the command
  if (remaining.length > 0) {
    flags.command = remaining[0]!;
    flags.args = remaining.slice(1);
  }

  return flags;
}
