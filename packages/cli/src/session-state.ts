import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GlobalFlags } from "./config/state.js";

export interface PendingHandoffLaunch {
  browser: string;
  headless: boolean;
  userDataDir?: string;
}

export interface PendingHandoff {
  version: 2;
  sessionId: string;
  port: number;
  launch: PendingHandoffLaunch;
  createdAt: string;
  reason?: string;
}

interface LegacyPendingHandoff {
  version: 1;
  sessionId: string;
  port: number;
  browser: string;
  profile: string;
  resumeHeadless: boolean;
  createdAt: string;
  reason?: string;
}

export interface KnownSessionSummary {
  sessionId: string;
  traceEntries?: number;
  traceSize?: number;
  lastSeenAt?: number;
  handoff?: PendingHandoff;
  sources: Array<"trace" | "handoff">;
}

export function getCliSessionId(flags: Pick<GlobalFlags, "session" | "port">): string {
  return flags.session ?? `cli-${flags.port}`;
}

export function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getHandoffDir(): string {
  return path.join(os.homedir(), ".bap", "handoff");
}

export function getTraceDir(): string {
  return path.join(os.homedir(), ".bap", "traces");
}

export function getHandoffPath(sessionId: string, port: number): string {
  return path.join(getHandoffDir(), `${sanitizeSessionId(sessionId)}-p${port}.json`);
}

export function getLegacyHandoffPath(sessionId: string): string {
  return path.join(getHandoffDir(), `${sanitizeSessionId(sessionId)}.json`);
}

export function normalizePendingHandoff(
  data: PendingHandoff | LegacyPendingHandoff,
  resolveProfile: (profile: string, browser: string) => string | undefined
): PendingHandoff {
  if ("launch" in data) {
    return data;
  }

  return {
    version: 2,
    sessionId: data.sessionId,
    port: data.port,
    launch: {
      browser: data.browser,
      headless: data.resumeHeadless,
      ...(data.profile !== "none"
        ? {
            userDataDir: data.profile === "auto"
              ? resolveProfile("auto", data.browser)
              : data.profile,
          }
        : {}),
    },
    createdAt: data.createdAt,
    ...(data.reason ? { reason: data.reason } : {}),
  };
}

export function savePendingHandoff(data: PendingHandoff): void {
  fs.mkdirSync(getHandoffDir(), { recursive: true });
  fs.writeFileSync(getHandoffPath(data.sessionId, data.port), JSON.stringify(data, null, 2), "utf-8");
}

export function loadPendingHandoff(
  sessionId: string,
  port: number,
  resolveProfile: (profile: string, browser: string) => string | undefined
): PendingHandoff | null {
  for (const filePath of [getHandoffPath(sessionId, port), getLegacyHandoffPath(sessionId)]) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return normalizePendingHandoff(
        JSON.parse(raw) as PendingHandoff | LegacyPendingHandoff,
        resolveProfile
      );
    } catch {
      // Try next location.
    }
  }

  return null;
}

export function clearPendingHandoff(sessionId: string, port: number): void {
  for (const filePath of [getHandoffPath(sessionId, port), getLegacyHandoffPath(sessionId)]) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore missing file.
    }
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

export function listKnownSessions(
  resolveProfile: (profile: string, browser: string) => string | undefined
): KnownSessionSummary[] {
  const summaries = new Map<string, KnownSessionSummary>();

  const remember = (sessionId: string): KnownSessionSummary => {
    const existing = summaries.get(sessionId);
    if (existing) {
      return existing;
    }

    const created: KnownSessionSummary = {
      sessionId,
      sources: [],
    };
    summaries.set(sessionId, created);
    return created;
  };

  if (fs.existsSync(getTraceDir())) {
    for (const filename of fs.readdirSync(getTraceDir()).filter((name) => name.endsWith(".jsonl"))) {
      const filepath = path.join(getTraceDir(), filename);
      const stat = fs.statSync(filepath);
      const sessionId = filename.replace(/-\d+\.jsonl$/, "");
      const summary = remember(sessionId);
      summary.traceEntries = countLines(filepath);
      summary.traceSize = stat.size;
      summary.lastSeenAt = Math.max(summary.lastSeenAt ?? 0, stat.mtimeMs);
      if (!summary.sources.includes("trace")) {
        summary.sources.push("trace");
      }
    }
  }

  if (fs.existsSync(getHandoffDir())) {
    for (const filename of fs.readdirSync(getHandoffDir()).filter((name) => name.endsWith(".json"))) {
      const filepath = path.join(getHandoffDir(), filename);
      try {
        const raw = fs.readFileSync(filepath, "utf-8");
        const pending = normalizePendingHandoff(
          JSON.parse(raw) as PendingHandoff | LegacyPendingHandoff,
          resolveProfile
        );
        const summary = remember(pending.sessionId);
        summary.handoff = pending;
        summary.lastSeenAt = Math.max(
          summary.lastSeenAt ?? 0,
          Date.parse(pending.createdAt) || 0
        );
        if (!summary.sources.includes("handoff")) {
          summary.sources.push("handoff");
        }
      } catch {
        // Ignore malformed local handoff files.
      }
    }
  }

  return Array.from(summaries.values()).sort(
    (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0)
  );
}
