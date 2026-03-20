/**
 * @fileoverview Session trace recording — NDJSON trace files
 * @module @browseragentprotocol/server-playwright/recording/trace-recorder
 *
 * Records every BAP request/response as an NDJSON line to ~/.bap/traces/.
 * Enabled by default, disable with `recording: false` in server options.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface TraceEntry {
  ts: string;
  sessionId?: string;
  clientId: string;
  method: string;
  duration: number;
  status: "ok" | "error";
  error?: string;
  /** Abbreviated result shape for debugging (not the full payload) */
  resultSummary?: Record<string, unknown>;
}

export interface TraceRecorderOptions {
  /** Directory for trace files. Default: ~/.bap/traces */
  dir?: string;
  /** Enable/disable recording. Default: true */
  enabled?: boolean;
}

/**
 * Manages NDJSON trace files for a server instance.
 * Each client session gets its own trace file.
 */
export class TraceRecorder {
  private readonly dir: string;
  private readonly enabled: boolean;
  private streams = new Map<string, fs.WriteStream>();

  constructor(options: TraceRecorderOptions = {}) {
    this.dir = options.dir ?? path.join(os.homedir(), ".bap", "traces");
    this.enabled = options.enabled ?? true;

    if (this.enabled) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  /** Record a trace entry for a client session */
  record(entry: TraceEntry): void {
    if (!this.enabled) return;

    const key = entry.sessionId ?? entry.clientId;
    let stream = this.streams.get(key);

    if (!stream) {
      const filename = `${key}-${Date.now()}.jsonl`;
      const filepath = path.join(this.dir, filename);
      stream = fs.createWriteStream(filepath, { flags: "a" });
      this.streams.set(key, stream);
    }

    stream.write(JSON.stringify(entry) + "\n");
  }

  /** Create a summarized result for the trace (avoid huge payloads) */
  static summarizeResult(method: string, result: unknown): Record<string, unknown> | undefined {
    if (result === null || result === undefined) return undefined;
    if (typeof result !== "object") return { value: result };

    const obj = result as Record<string, unknown>;

    // Method-specific summaries
    if (method === "agent/observe") {
      return {
        elementCount: Array.isArray(obj.interactiveElements)
          ? obj.interactiveElements.length
          : undefined,
        hasScreenshot: !!obj.screenshot,
        url: (obj.metadata as Record<string, unknown>)?.url,
      };
    }

    if (method === "agent/act") {
      return {
        completed: obj.completed,
        total: obj.total,
        success: obj.success,
        duration: obj.duration,
      };
    }

    if (method === "observe/screenshot") {
      return {
        format: obj.format,
        width: obj.width,
        height: obj.height,
        sizeKB:
          typeof obj.data === "string"
            ? Math.round(((obj.data as string).length * 0.75) / 1024)
            : undefined,
      };
    }

    if (method === "page/navigate") {
      return { url: obj.url, status: obj.status };
    }

    if (method === "page/create") {
      return { id: obj.id, url: obj.url };
    }

    if (method === "page/list") {
      return { count: Array.isArray(obj.pages) ? obj.pages.length : undefined };
    }

    // Default: return keys only
    return { keys: Object.keys(obj) };
  }

  /** Close all open streams */
  close(): void {
    for (const stream of this.streams.values()) {
      stream.end();
    }
    this.streams.clear();
  }

  /** Get recent trace entries for a session (reads from file) */
  async getRecent(sessionId: string, limit = 10): Promise<TraceEntry[]> {
    const files = fs
      .readdirSync(this.dir)
      .filter((f) => f.startsWith(sessionId) && f.endsWith(".jsonl"))
      .sort()
      .reverse();

    if (files.length === 0) return [];

    const filepath = path.join(this.dir, files[0]!);
    const content = fs.readFileSync(filepath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as TraceEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is TraceEntry => e !== null);
  }

  /** List all trace sessions */
  listSessions(): Array<{ sessionId: string; file: string; size: number; modified: Date }> {
    if (!fs.existsSync(this.dir)) return [];

    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const stat = fs.statSync(path.join(this.dir, f));
        const sessionId = f.replace(/-\d+\.jsonl$/, "");
        return { sessionId, file: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }
}
