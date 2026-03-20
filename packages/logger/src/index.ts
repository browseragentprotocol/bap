/**
 * @browseragentprotocol/logger
 *
 * Pretty logging utilities for BAP packages with colors and icons.
 */

import pc from "picocolors";

// =============================================================================
// Icons
// =============================================================================

export const icons = {
  // Status
  success: "\u2713", // ✓
  error: "\u2717", // ✗
  warning: "\u26a0", // ⚠
  info: "\u2139", // ℹ
  debug: "\u2022", // •

  // Actions
  arrow: "\u2192", // →
  arrowDown: "\u2193", // ↓
  pointer: "\u276f", // ❯
  bullet: "\u25cf", // ●

  // Objects
  browser: "\ud83c\udf10", // 🌐
  server: "\ud83d\udda5\ufe0f", // 🖥️
  connection: "\ud83d\udd17", // 🔗
  lock: "\ud83d\udd12", // 🔒
  unlock: "\ud83d\udd13", // 🔓
  key: "\ud83d\udd11", // 🔑

  // Status indicators
  play: "\u25b6", // ▶
  stop: "\u25a0", // ■
  pause: "\u23f8", // ⏸
  loading: "\u25e6", // ◦

  // Misc
  sparkle: "\u2728", // ✨
  rocket: "\ud83d\ude80", // 🚀
  check: "\u2705", // ✅
  cross: "\u274c", // ❌
  clock: "\ud83d\udd52", // 🕒
} as const;

// =============================================================================
// Types
// =============================================================================

export type LogLevel = "debug" | "info" | "success" | "warn" | "error";

export interface LoggerOptions {
  /** Prefix shown before messages (e.g., "BAP Server") */
  prefix?: string;
  /** Minimum log level to display */
  level?: LogLevel;
  /** Enable/disable logging entirely */
  enabled?: boolean;
  /** Use stderr for all output (useful for MCP servers) */
  stderr?: boolean;
  /** Show timestamps */
  timestamps?: boolean;
  /** Output format: "pretty" for human-readable, "json" for NDJSON (structured logging) */
  format?: "pretty" | "json";
}

// =============================================================================
// Log Level Utilities
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 2,
  warn: 3,
  error: 4,
};

function shouldLog(current: LogLevel, minimum: LogLevel): boolean {
  return LOG_LEVELS[current] >= LOG_LEVELS[minimum];
}

// =============================================================================
// Logger Class
// =============================================================================

export class Logger {
  private prefix: string;
  private level: LogLevel;
  private enabled: boolean;
  private stderr: boolean;
  private timestamps: boolean;
  private format: "pretty" | "json";

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix ?? "BAP";
    this.level = options.level ?? "info";
    this.enabled = options.enabled ?? true;
    this.stderr = options.stderr ?? false;
    this.timestamps = options.timestamps ?? false;
    this.format = options.format ?? "pretty";
  }

  private formatPrefix(): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(pc.dim(new Date().toISOString()));
    }

    parts.push(pc.cyan(`[${this.prefix}]`));

    return parts.join(" ");
  }

  private write(message: string): void {
    if (this.stderr) {
      console.error(message);
    } else {
      console.log(message);
    }
  }

  /** Write context object respecting stderr setting */
  private writeContext(context: Record<string, unknown>): void {
    const output = JSON.stringify(context, null, 2);
    if (this.stderr) {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  /** Write a structured JSON log line to stderr */
  private writeJson(level: string, message: string, context?: Record<string, unknown>): void {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      component: this.prefix,
      msg: message,
    };
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        entry[k] = v;
      }
    }
    // Always stderr for JSON — safe for MCP stdio transport
    process.stderr.write(JSON.stringify(entry) + "\n");
  }

  /** Debug level - gray, shown only when level is debug */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled || !shouldLog("debug", this.level)) return;
    if (this.format === "json") {
      this.writeJson("debug", message, context);
      return;
    }
    const formatted = `${this.formatPrefix()} ${pc.dim(icons.debug)} ${pc.dim(message)}`;
    this.write(formatted);
    if (context) {
      this.writeContext(context);
    }
  }

  /** Info level - cyan icon */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled || !shouldLog("info", this.level)) return;
    if (this.format === "json") {
      this.writeJson("info", message, context);
      return;
    }
    const formatted = `${this.formatPrefix()} ${pc.cyan(icons.info)} ${message}`;
    this.write(formatted);
    if (context) {
      this.writeContext(context);
    }
  }

  /** Success level - green checkmark */
  success(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled || !shouldLog("success", this.level)) return;
    if (this.format === "json") {
      this.writeJson("success", message, context);
      return;
    }
    const formatted = `${this.formatPrefix()} ${pc.green(icons.success)} ${pc.green(message)}`;
    this.write(formatted);
    if (context) {
      this.writeContext(context);
    }
  }

  /** Warning level - yellow warning sign */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled || !shouldLog("warn", this.level)) return;
    if (this.format === "json") {
      this.writeJson("warn", message, context);
      return;
    }
    const formatted = `${this.formatPrefix()} ${pc.yellow(icons.warning)} ${pc.yellow(message)}`;
    this.write(formatted);
    if (context) {
      this.writeContext(context);
    }
  }

  /** Error level - red X */
  error(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled || !shouldLog("error", this.level)) return;
    if (this.format === "json") {
      this.writeJson("error", message, context);
      return;
    }
    const formatted = `${this.formatPrefix()} ${pc.red(icons.error)} ${pc.red(message)}`;
    console.error(formatted);
    if (context) {
      this.writeContext(context);
    }
  }

  /** Log a step in a process */
  step(stepNumber: number, total: number, message: string): void {
    if (!this.enabled || !shouldLog("info", this.level)) return;
    if (this.format === "json") {
      this.writeJson("info", message, { step: stepNumber, total });
      return;
    }
    const progress = pc.dim(`[${stepNumber}/${total}]`);
    const formatted = `${this.formatPrefix()} ${progress} ${message}`;
    this.write(formatted);
  }

  /** Log with a custom icon */
  log(icon: string, message: string, color?: (s: string) => string): void {
    if (!this.enabled || !shouldLog("info", this.level)) return;
    if (this.format === "json") {
      this.writeJson("info", message);
      return;
    }
    const colorFn = color ?? ((s: string) => s);
    const formatted = `${this.formatPrefix()} ${icon} ${colorFn(message)}`;
    this.write(formatted);
  }

  /** Create a child logger with a different prefix */
  child(prefix: string): Logger {
    return new Logger({
      prefix: `${this.prefix}:${prefix}`,
      level: this.level,
      enabled: this.enabled,
      stderr: this.stderr,
      timestamps: this.timestamps,
      format: this.format,
    });
  }

  /** Update the enabled state */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Update the log level */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// =============================================================================
// Box Drawing Utilities
// =============================================================================

export interface BoxOptions {
  /** Title for the box (centered at top) */
  title?: string;
  /** Padding inside the box */
  padding?: number;
  /** Border color */
  borderColor?: (s: string) => string;
  /** Title color */
  titleColor?: (s: string) => string;
}

/** Draw a box around content */
export function box(lines: string[], options: BoxOptions = {}): string {
  const padding = options.padding ?? 1;
  const borderColor = options.borderColor ?? pc.cyan;
  const titleColor = options.titleColor ?? pc.bold;

  // Calculate max width
  const contentWidth = Math.max(
    ...lines.map((l) => stripAnsi(l).length),
    options.title ? stripAnsi(options.title).length : 0
  );
  const innerWidth = contentWidth + padding * 2;

  // Box characters
  const h = "\u2500"; // ─
  const v = "\u2502"; // │
  const tl = "\u256d"; // ╭
  const tr = "\u256e"; // ╮
  const bl = "\u2570"; // ╰
  const br = "\u256f"; // ╯

  const result: string[] = [];

  // Top border with optional title
  if (options.title) {
    const title = ` ${options.title} `;
    const titleLen = stripAnsi(title).length;
    const leftPad = Math.floor((innerWidth - titleLen) / 2);
    const rightPad = innerWidth - titleLen - leftPad;
    result.push(
      borderColor(tl + h.repeat(leftPad)) + titleColor(title) + borderColor(h.repeat(rightPad) + tr)
    );
  } else {
    result.push(borderColor(tl + h.repeat(innerWidth) + tr));
  }

  // Content lines
  for (const line of lines) {
    const lineLen = stripAnsi(line).length;
    const rightPad = contentWidth - lineLen;
    result.push(
      borderColor(v) + " ".repeat(padding) + line + " ".repeat(rightPad + padding) + borderColor(v)
    );
  }

  // Bottom border
  result.push(borderColor(bl + h.repeat(innerWidth) + br));

  return result.join("\n");
}

// =============================================================================
// Table Utilities
// =============================================================================

export interface TableRow {
  label: string;
  value: string;
  icon?: string;
}

/** Create a formatted key-value table */
export function table(rows: TableRow[], labelColor?: (s: string) => string): string {
  const color = labelColor ?? pc.dim;
  const maxLabelLen = Math.max(...rows.map((r) => r.label.length));

  return rows
    .map((row) => {
      const icon = row.icon ? `${row.icon} ` : "";
      const label = color(row.label.padEnd(maxLabelLen));
      return `  ${icon}${label}  ${row.value}`;
    })
    .join("\n");
}

// =============================================================================
// Spinner (Simple)
// =============================================================================

const SPINNER_FRAMES = [
  "\u280b",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283c",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280f",
];

export class Spinner {
  private frameIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;
  private stream: NodeJS.WriteStream;

  constructor(message: string, stderr = false) {
    this.message = message;
    this.stream = stderr ? process.stderr : process.stdout;
  }

  start(): void {
    this.interval = setInterval(() => {
      const frame = pc.cyan(SPINNER_FRAMES[this.frameIndex]);
      this.stream.write(`\r${frame} ${this.message}`);
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
    }, 80);
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Clear the line
    this.stream.write("\r" + " ".repeat(this.message.length + 4) + "\r");
    if (finalMessage) {
      this.stream.write(finalMessage + "\n");
    }
  }

  succeed(message?: string): void {
    this.stop(`${pc.green(icons.success)} ${message ?? this.message}`);
  }

  fail(message?: string): void {
    this.stop(`${pc.red(icons.error)} ${message ?? this.message}`);
  }
}

// =============================================================================
// Banner Utilities
// =============================================================================

export interface BannerOptions {
  title: string;
  subtitle?: string;
  version?: string;
  borderColor?: (s: string) => string;
}

/** Create a startup banner */
export function banner(options: BannerOptions): string {
  const borderColor = options.borderColor ?? pc.cyan;
  const lines: string[] = [];

  // Title line with optional version
  let titleLine = pc.bold(options.title);
  if (options.version) {
    titleLine += ` ${pc.dim(`v${options.version}`)}`;
  }
  lines.push(titleLine);

  // Subtitle
  if (options.subtitle) {
    lines.push(pc.dim(options.subtitle));
  }

  return box(lines, { padding: 2, borderColor });
}

// =============================================================================
// Status Line Utilities
// =============================================================================

/** Format a status line with icon and color */
export function status(
  state: "running" | "stopped" | "error" | "warning" | "connected" | "disconnected",
  message: string
): string {
  switch (state) {
    case "running":
      return `${pc.green(icons.play)} ${pc.green(message)}`;
    case "stopped":
      return `${pc.dim(icons.stop)} ${pc.dim(message)}`;
    case "error":
      return `${pc.red(icons.error)} ${pc.red(message)}`;
    case "warning":
      return `${pc.yellow(icons.warning)} ${pc.yellow(message)}`;
    case "connected":
      return `${pc.green(icons.connection)} ${pc.green(message)}`;
    case "disconnected":
      return `${pc.dim(icons.connection)} ${pc.dim(message)}`;
  }
}

/** Format a key-value pair */
export function kv(key: string, value: string, keyColor?: (s: string) => string): string {
  const color = keyColor ?? pc.dim;
  return `${color(key)}: ${value}`;
}

// =============================================================================
// Utilities
// =============================================================================

/** Strip ANSI codes from a string (for length calculation) */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Re-export picocolors for direct use */
export { pc };

// =============================================================================
// Default Logger Instance
// =============================================================================

/** Default logger instance */
export const logger = new Logger();
