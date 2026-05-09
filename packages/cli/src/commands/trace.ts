/**
 * bap trace               — Show task/story summaries from the most recent trace
 * bap trace --requests    — Show recent raw requests
 * bap trace --all         — Show all raw requests
 * bap trace --session=<s> — Show trace for a specific session
 * bap trace --sessions    — List all trace sessions
 * bap trace --export=<f>  — Export trace to JSON file
 * bap trace --replay      — Generate self-contained HTML timeline viewer
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printTraceSessionList, printTraceSummary } from "../output/formatter.js";
import { register } from "./registry.js";

interface TraceEntry {
  ts: string;
  sessionId?: string;
  clientId: string;
  method: string;
  duration: number;
  status: "ok" | "error";
  error?: string;
  recoveryHint?: string;
  resultSummary?: Record<string, unknown>;
}

interface TraceStory {
  ts: string;
  label: string;
  status: "ok" | "error";
  duration: number;
  summary?: string;
  delta?: string;
  recovery?: string;
}

const TRACE_DIR = path.join(os.homedir(), ".bap", "traces");

function readTraceFile(filepath: string): TraceEntry[] {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TraceEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is TraceEntry => e !== null);
  } catch {
    return [];
  }
}

function countLines(filepath: string): number {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    return content.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function listTraceSessions(): Array<{
  sessionId: string;
  file: string;
  entries: number;
  size: number;
  modified: Date;
}> {
  if (!fs.existsSync(TRACE_DIR)) return [];

  return fs
    .readdirSync(TRACE_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const stat = fs.statSync(path.join(TRACE_DIR, f));
      const sessionId = f.replace(/-\d+\.jsonl$/, "");
      // Count lines without JSON parsing — O(n) string scan vs O(n*m) parse
      const entries = countLines(path.join(TRACE_DIR, f));
      return { sessionId, file: f, entries, size: stat.size, modified: stat.mtime };
    })
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatEntry(entry: TraceEntry, index: number): string {
  const status = entry.status === "ok" ? "\u2713" : "\u2717";
  const time = new Date(entry.ts).toLocaleTimeString();
  const dur = formatDuration(entry.duration);
  let summary = "";

  if (entry.error) {
    summary = ` error="${entry.error}"`;
    if (entry.recoveryHint) {
      summary += ` recover="${entry.recoveryHint}"`;
    }
  } else if (entry.resultSummary) {
    const rs = entry.resultSummary;
    if (rs.url) summary += ` url=${rs.url}`;
    if (rs.elementCount !== undefined) summary += ` elements=${rs.elementCount}`;
    if (rs.status !== undefined) summary += ` status=${rs.status}`;
    if (rs.sizeKB !== undefined) summary += ` ${rs.sizeKB}KB`;
    if (rs.completed !== undefined) summary += ` ${rs.completed}/${rs.total}`;
    if (rs.count !== undefined) summary += ` count=${rs.count}`;
    if (
      rs.added !== undefined ||
      rs.updated !== undefined ||
      rs.removed !== undefined
    ) {
      summary += ` delta=+${rs.added ?? 0}/~${rs.updated ?? 0}/-${rs.removed ?? 0}`;
    }
    if (rs.recoveryHint !== undefined) summary += ` recover="${rs.recoveryHint}"`;
  }

  return `  ${String(index + 1).padStart(3)} ${status} ${time} ${entry.method.padEnd(25)} ${dur.padStart(7)}${summary}`;
}

function isStoryCandidate(method: string): boolean {
  return (
    method === "agent/act" ||
    method === "agent/extract" ||
    method === "agent/observe" ||
    method === "page/navigate" ||
    method.startsWith("action/")
  );
}

function storyLabel(method: string): string {
  switch (method) {
    case "agent/act":
      return "act";
    case "agent/extract":
      return "extract";
    case "agent/observe":
      return "observe";
    case "page/navigate":
      return "navigate";
    default:
      return method.replace(/^action\//, "");
  }
}

function buildTraceStories(entries: TraceEntry[]): TraceStory[] {
  return entries
    .filter((entry) => isStoryCandidate(entry.method))
    .map((entry) => {
      const rs = entry.resultSummary ?? {};
      let summary: string | undefined;
      let delta: string | undefined;

      if (entry.method === "agent/act") {
        const parts = [];
        if (rs.completed !== undefined && rs.total !== undefined) {
          parts.push(`${rs.completed}/${rs.total} steps`);
        }
        if (rs.url) {
          parts.push(String(rs.url));
        }
        summary = parts.length > 0 ? parts.join(" • ") : undefined;
      } else if (entry.method === "page/navigate") {
        const parts = [];
        if (rs.url) {
          parts.push(String(rs.url));
        }
        if (rs.status !== undefined) {
          parts.push(`status ${rs.status}`);
        }
        summary = parts.length > 0 ? parts.join(" • ") : undefined;
      } else if (entry.method === "agent/observe") {
        const parts = [];
        if (rs.url) {
          parts.push(String(rs.url));
        }
        if (rs.elementCount !== undefined) {
          parts.push(`${rs.elementCount} elements`);
        }
        summary = parts.length > 0 ? parts.join(" • ") : undefined;
      } else if (entry.method === "agent/extract") {
        if (rs.count !== undefined) {
          summary = `${rs.count} items`;
        }
      } else if (entry.method.startsWith("action/") && rs.url) {
        summary = String(rs.url);
      }

      if (rs.added !== undefined || rs.updated !== undefined || rs.removed !== undefined) {
        delta = `+${rs.added ?? 0} ~${rs.updated ?? 0} -${rs.removed ?? 0}`;
      }

      return {
        ts: entry.ts,
        label: storyLabel(entry.method),
        status: entry.status,
        duration: entry.duration,
        summary,
        delta,
        recovery:
          entry.recoveryHint ??
          (typeof rs.recoveryHint === "string" ? rs.recoveryHint : undefined),
      };
    });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateHtmlReplay(entries: TraceEntry[], sessionId: string): string {
  const stories = buildTraceStories(entries);
  const storyRows = stories
    .map((story, index) => {
      const recovery = story.recovery
        ? `<div class="story-recovery">Recover: ${escapeHtml(story.recovery)}</div>`
        : "";
      const delta = story.delta
        ? `<div class="story-delta">Delta: ${escapeHtml(story.delta)}</div>`
        : "";
      return `<div class="story ${story.status}"><div class="story-index">${index + 1}</div><div><div class="story-label">${escapeHtml(story.label)}</div><div class="story-meta">${escapeHtml(story.summary ?? "")}</div>${delta}${recovery}</div><div class="story-duration">${formatDuration(story.duration)}</div></div>`;
    })
    .join("\n");
  const rows = entries
    .map((e, i) => {
      const cls = e.status === "error" ? "error" : "";
      const summary = e.error
        ? `<span class="err">${escapeHtml(e.error)}</span>`
        : escapeHtml(JSON.stringify(e.resultSummary ?? {}));
      return `<tr class="${cls}"><td>${i + 1}</td><td>${new Date(e.ts).toLocaleTimeString()}</td><td>${escapeHtml(e.method)}</td><td>${formatDuration(e.duration)}</td><td>${e.status}</td><td class="summary">${summary}</td></tr>`;
    })
    .join("\n");

  const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
  const errorCount = entries.filter((e) => e.status === "error").length;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>BAP Trace: ${escapeHtml(sessionId)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #1a1a2e; color: #e0e0e0; }
  h1 { color: #00d4ff; }
  .stats { display: flex; gap: 2rem; margin: 1rem 0; }
  .stat { background: #16213e; padding: 1rem; border-radius: 8px; }
  .stat-value { font-size: 1.5rem; font-weight: bold; color: #00d4ff; }
  .stories { display: grid; gap: 0.75rem; margin: 1.5rem 0; }
  .story { display: grid; grid-template-columns: 2rem 1fr auto; gap: 1rem; align-items: start; background: #16213e; padding: 0.9rem 1rem; border-radius: 8px; }
  .story.error { background: #2d1b1b; }
  .story-index { color: #888; font-family: monospace; }
  .story-label { font-weight: 700; color: #00d4ff; text-transform: capitalize; }
  .story-meta { color: #ddd; font-size: 0.9rem; margin-top: 0.15rem; }
  .story-delta, .story-recovery { color: #aaa; font-size: 0.85rem; margin-top: 0.25rem; }
  .story-duration { color: #aaa; font-family: monospace; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th { text-align: left; padding: 0.5rem; border-bottom: 2px solid #333; color: #888; }
  td { padding: 0.5rem; border-bottom: 1px solid #222; font-family: monospace; font-size: 0.85rem; }
  tr.error { background: #2d1b1b; }
  .err { color: #ff6b6b; }
  .summary { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
</style></head><body>
<h1>BAP Trace: ${escapeHtml(sessionId)}</h1>
<div class="stats">
  <div class="stat"><div class="stat-value">${entries.length}</div>Requests</div>
  <div class="stat"><div class="stat-value">${formatDuration(totalDuration)}</div>Total Time</div>
  <div class="stat"><div class="stat-value">${errorCount}</div>Errors</div>
</div>
<h2>Task Stories</h2>
<div class="stories">${storyRows || "<div class=\"story\"><div class=\"story-index\">-</div><div><div class=\"story-label\">No high-level stories</div><div class=\"story-meta\">Use the raw request table below for low-level forensics.</div></div><div class=\"story-duration\"></div></div>"}</div>
<h2>Raw Requests</h2>
<table>
<thead><tr><th>#</th><th>Time</th><th>Method</th><th>Duration</th><th>Status</th><th>Summary</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

export async function traceCommand(
  args: string[],
  _flags: GlobalFlags,
  _client: BAPClient
): Promise<void> {
  // Parse trace-specific flags
  const listFlag = args.includes("--sessions") || args.includes("-l");
  const allFlag = args.includes("--all") || args.includes("-a");
  const requestsFlag = args.includes("--requests");
  const replayFlag = args.includes("--replay");
  let sessionFilter: string | undefined;
  let exportFile: string | undefined;
  let limit = 10;

  for (const arg of args) {
    if (arg.startsWith("--session=")) sessionFilter = arg.slice("--session=".length);
    if (arg.startsWith("--export=")) exportFile = arg.slice("--export=".length);
    if (arg.startsWith("--limit=")) limit = parseInt(arg.slice("--limit=".length), 10) || 10;
  }

  if (!fs.existsSync(TRACE_DIR)) {
    console.log(
      "No traces found. Run some BAP commands first — traces are recorded automatically."
    );
    return;
  }

  // --list: show all sessions
  if (listFlag) {
    const sessions = listTraceSessions();
    printTraceSessionList(sessions);
    return;
  }

  // Find the right trace file
  const sessions = listTraceSessions();
  let targetFile: string | undefined;
  let targetSessionId: string | undefined;

  if (sessionFilter) {
    const match = sessions.find(
      (s) => s.sessionId === sessionFilter || s.file.includes(sessionFilter)
    );
    if (!match) {
      console.error(`No trace found for session: ${sessionFilter}`);
      console.error("Run 'bap trace --sessions' to see available sessions.");
      return;
    }
    targetFile = path.join(TRACE_DIR, match.file);
    targetSessionId = match.sessionId;
  } else if (sessions.length > 0) {
    targetFile = path.join(TRACE_DIR, sessions[0]!.file);
    targetSessionId = sessions[0]!.sessionId;
  } else {
    console.log("No traces found.");
    return;
  }

  const entries = readTraceFile(targetFile);

  // --export: save as JSON (validate path stays under cwd or ~/.bap)
  if (exportFile) {
    const resolved = path.resolve(exportFile);
    const cwd = process.cwd();
    const bapDir = path.join(os.homedir(), ".bap");
    if (
      !resolved.startsWith(cwd + path.sep) &&
      !resolved.startsWith(bapDir + path.sep) &&
      resolved !== cwd &&
      resolved !== bapDir
    ) {
      console.error(`Export path must be under current directory or ~/.bap/`);
      return;
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(entries, null, 2));
    console.log(`Exported ${entries.length} trace entries to ${exportFile}`);
    return;
  }

  // --replay: generate HTML (sanitize sessionId for filesystem safety)
  if (replayFlag) {
    const safeId = targetSessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const html = generateHtmlReplay(entries, targetSessionId);
    const outFile = `.bap/trace-replay-${safeId}.html`;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    console.log(`### Trace Replay`);
    console.log(`[Open replay](${outFile}) — ${entries.length} requests`);
    return;
  }

  if (!allFlag && !requestsFlag) {
    const stories = buildTraceStories(entries);
    const displayStories = stories.slice(-limit);
    const skippedStories = stories.length - displayStories.length;
    const totalDuration = stories.reduce((sum, story) => sum + story.duration, 0);
    const errorCount = stories.filter((story) => story.status === "error").length;

    console.log(`### Trace Story: ${targetSessionId}`);
    if (skippedStories > 0) {
      console.log(`  (${skippedStories} earlier stories hidden — use --all for raw requests)`);
    }
    if (displayStories.length === 0) {
      console.log("  No high-level task stories found. Use --requests to inspect raw trace entries.");
      return;
    }
    console.log("");
    displayStories.forEach((story, index) => {
      const badge = story.status === "ok" ? "✓" : "✗";
      const time = new Date(story.ts).toLocaleTimeString();
      const duration = formatDuration(story.duration);
      console.log(`  ${String(index + 1).padStart(3)} ${badge} ${time} ${story.label.padEnd(12)} ${duration.padStart(7)}${story.summary ? ` ${story.summary}` : ""}`);
      if (story.delta) {
        console.log(`      delta: ${story.delta}`);
      }
      if (story.recovery) {
        console.log(`      recover: ${story.recovery}`);
      }
    });
    console.log("");
    console.log(`  Total: ${stories.length} stories, ${formatDuration(totalDuration)}, ${errorCount} errors`);
    console.log("  Next: use `bap trace --requests` for raw request detail or `bap trace --replay` for the HTML timeline.");
    return;
  }

  // Raw request view
  const displayEntries = allFlag ? entries : entries.slice(-limit);
  const skipped = entries.length - displayEntries.length;

  const totalDuration = entries.reduce((s, e) => s + e.duration, 0);
  const errorCount = entries.filter((e) => e.status === "error").length;
  printTraceSummary({
    sessionId: targetSessionId,
    entries: displayEntries,
    skipped,
    totalEntries: entries.length,
    totalDurationLabel: formatDuration(totalDuration),
    errorCount,
    formatEntry: (entry, index) => formatEntry(entry as TraceEntry, (allFlag ? 0 : skipped) + index),
  });
}

register("trace", traceCommand);
