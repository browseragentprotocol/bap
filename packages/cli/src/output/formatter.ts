/**
 * @fileoverview CLI output formatting
 *
 * Three output modes:
 * - "agent" (default): Concise markdown for AI agents
 * - "json": Raw JSON for piping/scripting
 * - "pretty": Human-readable with colors (auto-detected for TTY)
 */

import { pc } from "@browseragentprotocol/logger";
import type {
  AgentActResult,
  AgentObserveResult,
  AgentExtractResult,
  ObserveChanges,
  TrustSurface,
} from "@browseragentprotocol/protocol";

export type RiskClass =
  | "observe"
  | "navigate"
  | "mutate"
  | "submit"
  | "upload/download"
  | "credential-affecting";

export interface StatusSummary {
  server: "running" | "stopped";
  sessionId: string;
  lifecycle: "active" | "dormant" | "handoff" | "stopped";
  browser?: string;
  channel?: string;
  headless?: boolean;
  pageCount?: number;
  activePageUrl?: string;
  activePageTitle?: string;
  handoffPending?: boolean;
  expiresAt?: number;
  trust?: TrustSurface;
}

export interface SessionListEntry {
  sessionId: string;
  lifecycle: "active" | "dormant" | "handoff" | "recorded";
  pageCount?: number;
  browser?: string;
  channel?: string;
  headless?: boolean;
  activePageUrl?: string;
  activePageTitle?: string;
  handoffPending?: boolean;
  lastSeenAt?: number;
  expiresAt?: number;
  isCurrent?: boolean;
  traceEntries?: number;
  sources?: string[];
  trust?: TrustSurface;
}

export interface TraceSessionSummary {
  sessionId: string;
  entries: number;
  size: number;
  modified: Date;
}

export interface TraceEntrySummary {
  ts: string;
  method: string;
  duration: number;
  status: "ok" | "error";
  error?: string;
  resultSummary?: Record<string, unknown>;
}

export interface ActPlanSummary {
  fusedObserve: boolean;
  steps: Array<{
    action: string;
    target?: string;
    valuePreview?: string;
    riskClasses: RiskClass[];
  }>;
  overallRisk: RiskClass[];
  trust?: TrustSurface;
}

export interface ActAuditSummary {
  trust?: TrustSurface;
  overallRisk: RiskClass[];
  delta?: string;
  steps: Array<{
    index: number;
    action: string;
    status: "ok" | "error";
    durationMs?: number;
    riskClasses: RiskClass[];
    error?: string;
    recovery?: string;
  }>;
}

export type OutputFormat = "pretty" | "json" | "agent";

let currentFormat: OutputFormat = "agent";

/** Set the output format. Call before any print functions. */
export function setOutputFormat(format: OutputFormat): void {
  currentFormat = format;
}

/** Get the current output format. */
export function getOutputFormat(): OutputFormat {
  return currentFormat;
}

/**
 * Print any result as JSON (used when --format=json).
 * Collects all output into a single JSON object.
 */
export function printJson(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print page summary with optional snapshot/screenshot links.
 */
export function printPageSummary(
  url?: string,
  title?: string,
  snapshotPath?: string,
  screenshotPath?: string
): void {
  if (currentFormat === "json") {
    printJson({ type: "page", url, title, snapshotPath, screenshotPath });
    return;
  }

  if (currentFormat === "pretty") {
    if (url) console.log(`${pc.cyan("URL")}   ${url}`);
    if (title) console.log(`${pc.cyan("Title")} ${title}`);
    if (snapshotPath) console.log(`${pc.dim("Snapshot:")} ${snapshotPath}`);
    if (screenshotPath) console.log(`${pc.dim("Screenshot:")} ${screenshotPath}`);
    return;
  }

  // agent format (default)
  console.log("### Page");
  if (url) console.log(`- URL: ${url}`);
  if (title) console.log(`- Title: ${title}`);

  if (snapshotPath) {
    console.log("### Snapshot");
    console.log(`[Snapshot](${snapshotPath})`);
  }

  if (screenshotPath) {
    console.log("### Screenshot");
    console.log(`[Screenshot](${screenshotPath})`);
  }
}

function formatRelativeTime(timestampMs?: number): string | undefined {
  if (!timestampMs || Number.isNaN(timestampMs)) {
    return undefined;
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  if (ageSeconds < 3600) {
    return `${Math.round(ageSeconds / 60)}m ago`;
  }
  if (ageSeconds < 86400) {
    return `${Math.round(ageSeconds / 3600)}h ago`;
  }
  return `${Math.round(ageSeconds / 86400)}d ago`;
}

function formatFutureTime(timestampMs?: number): string | undefined {
  if (!timestampMs || Number.isNaN(timestampMs)) {
    return undefined;
  }

  const deltaSeconds = Math.max(0, Math.round((timestampMs - Date.now()) / 1000));
  if (deltaSeconds < 60) {
    return `in ${deltaSeconds}s`;
  }
  if (deltaSeconds < 3600) {
    return `in ${Math.round(deltaSeconds / 60)}m`;
  }
  return `in ${Math.round(deltaSeconds / 3600)}h`;
}

function lifecycleLabel(lifecycle: SessionListEntry["lifecycle"] | StatusSummary["lifecycle"]): string {
  switch (lifecycle) {
    case "active":
      return "active";
    case "dormant":
      return "dormant";
    case "handoff":
      return "handoff";
    case "recorded":
      return "recorded";
    case "stopped":
      return "stopped";
  }
}

function summarizeTrustSurface(trust?: TrustSurface): {
  approvalMode?: string;
  domains?: string;
  redaction?: string;
} {
  if (!trust) {
    return {};
  }

  return {
    approvalMode: trust.approvalMode,
    domains: trust.allowedDomains && trust.allowedDomains.length > 0
      ? trust.allowedDomains.join(", ")
      : "all domains",
    redaction: [
      `content:${trust.redaction.content ? "on" : "off"}`,
      `password-values:${trust.redaction.passwordValues ? "blocked" : "open"}`,
      `screenshots:${trust.redaction.screenshots ? "redacted" : "raw"}`,
      `storage:${trust.redaction.storageState ? "blocked" : "open"}`,
    ].join(" • "),
  };
}

/**
 * Print act result summary.
 */
export function printActResult(
  result: AgentActResult,
  url?: string,
  title?: string,
  snapshotPath?: string
): void {
  if (currentFormat === "json") {
    printJson({ type: "act", url, title, snapshotPath, ...result });
    return;
  }

  if (currentFormat === "pretty") {
    if (url) console.log(`${pc.cyan("URL")}   ${url}`);
    const status = result.success ? pc.green("OK") : pc.red("FAILED");
    console.log(`${status} ${result.completed}/${result.total} steps completed`);
    if (!result.success && result.results) {
      const failed = result.results.find((r) => !r.success);
      if (failed?.error) {
        console.log(`${pc.red("Error:")} ${failed.error.message ?? "Unknown error"}`);
      }
    }
    if (snapshotPath) console.log(`${pc.dim("Snapshot:")} ${snapshotPath}`);
    return;
  }

  // agent format (default)
  console.log("### Page");
  if (url) console.log(`- URL: ${url}`);
  if (title) console.log(`- Title: ${title}`);

  console.log(`### Result: ${result.completed}/${result.total} steps completed`);

  if (!result.success && result.results) {
    const failed = result.results.find((r) => !r.success);
    if (failed?.error) {
      console.log(`### Error: ${failed.error.message ?? "Unknown error"}`);
    }
  }

  if (snapshotPath) {
    console.log("### Snapshot");
    console.log(`[Snapshot](${snapshotPath})`);
  }
}

/**
 * Print observe result — compact list of interactive elements.
 */
export function printObserveResult(result: AgentObserveResult): void {
  if (currentFormat === "json") {
    printJson({ type: "observe", ...result });
    return;
  }

  if (currentFormat === "pretty") {
    if (result.metadata) {
      console.log(`${pc.cyan("URL")}   ${result.metadata.url}`);
      console.log(`${pc.cyan("Title")} ${result.metadata.title}`);
    }
    if (result.interactiveElements && result.interactiveElements.length > 0) {
      console.log(`\n${pc.bold(`Interactive Elements (${result.interactiveElements.length})`)}`);
      for (const el of result.interactiveElements) {
        const ref = pc.yellow(el.ref ?? "");
        const role = pc.dim(el.role);
        const name = el.name ? ` ${pc.green(`"${el.name}"`)}` : "";
        const value = el.value ? ` ${pc.dim(`[${el.value}]`)}` : "";
        console.log(`  ${ref} ${role}${name}${value}`);
      }
    } else {
      console.log(pc.dim("No interactive elements found"));
    }
    return;
  }

  // agent format (default)
  if (result.metadata) {
    console.log("### Page");
    console.log(`- URL: ${result.metadata.url}`);
    console.log(`- Title: ${result.metadata.title}`);
  }

  if (result.interactiveElements && result.interactiveElements.length > 0) {
    console.log(`### Interactive Elements (${result.interactiveElements.length})`);
    for (const el of result.interactiveElements) {
      const ref = el.ref ?? "";
      const name = el.name ? ` "${el.name}"` : "";
      const value = el.value ? ` [${el.value}]` : "";
      console.log(`  ${ref} ${el.role}${name}${value}`);
    }
  } else {
    console.log("### No interactive elements found");
  }
}

export function printObserveDeltaResult(result: AgentObserveResult): void {
  if (currentFormat === "json") {
    printJson({ type: "observe-diff", ...result });
    return;
  }

  if (result.metadata) {
    printPageSummary(result.metadata.url, result.metadata.title);
  }

  if (result.changes) {
    printObserveChanges(result.changes);
    return;
  }

  if (currentFormat === "pretty") {
    console.log(pc.dim("(no delta available)"));
    return;
  }

  console.log("### Changes");
  console.log("  (no delta available)");
}

/**
 * Print extraction result.
 */
export function printExtractionResult(result: AgentExtractResult, filepath: string): void {
  if (currentFormat === "json") {
    printJson({ type: "extract", filepath, ...result });
    return;
  }

  if (currentFormat === "pretty") {
    console.log(`${pc.cyan("Extracted")} → ${filepath}`);
    if (result.data) {
      const preview = JSON.stringify(result.data);
      if (preview.length <= 200) {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(pc.dim(`(${preview.length} bytes — see file)`));
      }
    }
    return;
  }

  // agent format (default)
  console.log("### Extraction");
  console.log(`[Data](${filepath})`);

  if (result.data) {
    const preview = JSON.stringify(result.data);
    if (preview.length <= 200) {
      console.log(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``);
    } else {
      console.log(`(${preview.length} bytes — see file for full data)`);
    }
  }
}

/**
 * Print a snapshot summary (used by snapshot/snapshot commands).
 */
export function printSnapshotSummary(snapshotPath: string): void {
  if (currentFormat === "json") {
    printJson({ type: "snapshot", path: snapshotPath });
    return;
  }
  if (currentFormat === "pretty") {
    console.log(`${pc.dim("Snapshot:")} ${snapshotPath}`);
    return;
  }
  console.log("### Snapshot");
  console.log(`[Snapshot](${snapshotPath})`);
}

/**
 * Print incremental observation changes (--diff mode).
 */
export function printObserveChanges(changes: ObserveChanges): void {
  if (currentFormat === "json") {
    printJson({
      type: "changes",
      added: changes.added.length,
      updated: changes.updated.length,
      removed: changes.removed.length,
      details: changes,
    });
    return;
  }

  if (currentFormat === "pretty") {
    if (changes.added.length > 0) {
      console.log(`${pc.green(`+ ${changes.added.length} added`)}`);
      for (const el of changes.added) {
        console.log(
          `  ${pc.green("+")} ${pc.yellow(el.ref)} ${el.role}${el.name ? ` "${el.name}"` : ""}`
        );
      }
    }
    if (changes.updated.length > 0) {
      console.log(`${pc.yellow(`~ ${changes.updated.length} updated`)}`);
      for (const el of changes.updated) {
        console.log(
          `  ${pc.yellow("~")} ${pc.yellow(el.ref)} ${el.role}${el.name ? ` "${el.name}"` : ""}`
        );
      }
    }
    if (changes.removed.length > 0) {
      console.log(`${pc.red(`- ${changes.removed.length} removed`)}`);
      for (const ref of changes.removed) {
        console.log(`  ${pc.red("-")} ${ref}`);
      }
    }
    if (
      changes.added.length === 0 &&
      changes.updated.length === 0 &&
      changes.removed.length === 0
    ) {
      console.log(pc.dim("(no changes)"));
    }
    return;
  }

  // agent format
  console.log("### Changes");

  if (changes.added.length > 0) {
    console.log(`  + ${changes.added.length} added`);
    for (const el of changes.added) {
      const name = el.name ? ` "${el.name}"` : "";
      console.log(`    + ${el.ref} ${el.role}${name}`);
    }
  }

  if (changes.updated.length > 0) {
    console.log(`  ~ ${changes.updated.length} updated`);
    for (const el of changes.updated) {
      const name = el.name ? ` "${el.name}"` : "";
      console.log(`    ~ ${el.ref} ${el.role}${name}`);
    }
  }

  if (changes.removed.length > 0) {
    console.log(`  - ${changes.removed.length} removed`);
    for (const ref of changes.removed) {
      console.log(`    - ${ref}`);
    }
  }

  if (changes.added.length === 0 && changes.updated.length === 0 && changes.removed.length === 0) {
    console.log("  (no changes)");
  }
}

export function printStatusSummary(summary: StatusSummary): void {
  if (currentFormat === "json") {
    printJson({ type: "status", ...summary });
    return;
  }

  const headless = summary.headless === undefined ? undefined : summary.headless ? "headless" : "visible";
  const expires = formatFutureTime(summary.expiresAt);
  const trust = summarizeTrustSurface(summary.trust);

  if (currentFormat === "pretty") {
    console.log(`${pc.cyan("Server")} ${summary.server === "running" ? pc.green("running") : pc.yellow("stopped")}`);
    console.log(`${pc.cyan("Session")} ${summary.sessionId}`);
    console.log(`${pc.cyan("Lifecycle")} ${lifecycleLabel(summary.lifecycle)}`);
    if (summary.browser) {
      console.log(`${pc.cyan("Browser")} ${summary.browser}${summary.channel ? ` (${summary.channel})` : ""}${headless ? ` • ${headless}` : ""}`);
    }
    if (summary.pageCount !== undefined) {
      console.log(`${pc.cyan("Pages")} ${summary.pageCount}`);
    }
    if (summary.activePageUrl) {
      console.log(`${pc.cyan("Active")} ${summary.activePageUrl}`);
      if (summary.activePageTitle) {
        console.log(`${pc.cyan("Title")} ${summary.activePageTitle}`);
      }
    }
    if (summary.handoffPending) {
      console.log(`${pc.yellow("Handoff")} pending${expires ? ` (${expires})` : ""}`);
    }
    if (trust.approvalMode) {
      console.log(`${pc.cyan("Approval")} ${trust.approvalMode}`);
    }
    if (trust.domains) {
      console.log(`${pc.cyan("Domains")} ${trust.domains}`);
    }
    if (trust.redaction) {
      console.log(`${pc.cyan("Redaction")} ${trust.redaction}`);
    }
    return;
  }

  console.log("### Status");
  console.log(`- Server: ${summary.server}`);
  console.log(`- Session: ${summary.sessionId}`);
  console.log(`- Lifecycle: ${lifecycleLabel(summary.lifecycle)}`);
  if (summary.browser) {
    console.log(`- Browser: ${summary.browser}${summary.channel ? ` (${summary.channel})` : ""}${headless ? ` • ${headless}` : ""}`);
  }
  if (summary.pageCount !== undefined) {
    console.log(`- Pages: ${summary.pageCount}`);
  }
  if (summary.activePageUrl) {
    console.log(`- Active URL: ${summary.activePageUrl}`);
  }
  if (summary.activePageTitle) {
    console.log(`- Active Title: ${summary.activePageTitle}`);
  }
  if (summary.handoffPending) {
    console.log(`- Handoff: pending${expires ? ` (${expires})` : ""}`);
  }
  if (trust.approvalMode) {
    console.log(`- Approval: ${trust.approvalMode}`);
  }
  if (trust.domains) {
    console.log(`- Domains: ${trust.domains}`);
  }
  if (trust.redaction) {
    console.log(`- Redaction: ${trust.redaction}`);
  }
}

export function printSessionList(entries: SessionListEntry[]): void {
  if (currentFormat === "json") {
    printJson({ type: "sessions", sessions: entries });
    return;
  }

  if (currentFormat === "pretty") {
    console.log(pc.bold(`Sessions (${entries.length})`));
    if (entries.length === 0) {
      console.log(pc.dim("No known sessions"));
      return;
    }

    for (const entry of entries) {
      const marker = entry.isCurrent ? pc.green("●") : pc.dim("○");
      const age = formatRelativeTime(entry.lastSeenAt);
      const expires = formatFutureTime(entry.expiresAt);
      const trust = summarizeTrustSurface(entry.trust);
      const pageInfo = entry.pageCount !== undefined ? ` • ${entry.pageCount} page${entry.pageCount === 1 ? "" : "s"}` : "";
      const browserInfo = entry.browser
        ? ` • ${entry.browser}${entry.channel ? `/${entry.channel}` : ""}${entry.headless === undefined ? "" : entry.headless ? " • headless" : " • visible"}`
        : "";
      const trustInfo = trust.approvalMode ? ` • ${trust.approvalMode}` : "";
      console.log(`${marker} ${entry.sessionId} • ${lifecycleLabel(entry.lifecycle)}${pageInfo}${browserInfo}${trustInfo}${age ? ` • ${age}` : ""}${expires ? ` • expires ${expires}` : ""}`);
      if (entry.activePageUrl) {
        console.log(`    ${entry.activePageUrl}${entry.activePageTitle ? ` — ${entry.activePageTitle}` : ""}`);
      } else if (entry.traceEntries !== undefined) {
        console.log(`    ${entry.traceEntries} trace entr${entry.traceEntries === 1 ? "y" : "ies"}${entry.sources?.length ? ` • ${entry.sources.join(", ")}` : ""}`);
      }
      if (trust.domains || trust.redaction) {
        console.log(`    trust: ${trust.domains ?? "all domains"} • ${trust.redaction ?? "redaction unknown"}`);
      }
    }
    return;
  }

  console.log(`### Sessions (${entries.length})`);
  if (entries.length === 0) {
    console.log("  No known sessions");
    return;
  }

  for (const entry of entries) {
    const current = entry.isCurrent ? " (current)" : "";
    const age = formatRelativeTime(entry.lastSeenAt);
    const expires = formatFutureTime(entry.expiresAt);
    const trust = summarizeTrustSurface(entry.trust);
    console.log(`- ${entry.sessionId}${current}: ${lifecycleLabel(entry.lifecycle)}`);
    if (entry.pageCount !== undefined) {
      console.log(`  - Pages: ${entry.pageCount}`);
    }
    if (entry.browser) {
      console.log(`  - Browser: ${entry.browser}${entry.channel ? ` (${entry.channel})` : ""}${entry.headless === undefined ? "" : entry.headless ? " • headless" : " • visible"}`);
    }
    if (entry.activePageUrl) {
      console.log(`  - Active URL: ${entry.activePageUrl}`);
    }
    if (entry.activePageTitle) {
      console.log(`  - Active Title: ${entry.activePageTitle}`);
    }
    if (entry.traceEntries !== undefined) {
      console.log(`  - Trace entries: ${entry.traceEntries}`);
    }
    if (age) {
      console.log(`  - Last seen: ${age}`);
    }
    if (expires) {
      console.log(`  - Expires: ${expires}`);
    }
    if (trust.approvalMode) {
      console.log(`  - Approval: ${trust.approvalMode}`);
    }
    if (trust.domains) {
      console.log(`  - Domains: ${trust.domains}`);
    }
    if (trust.redaction) {
      console.log(`  - Redaction: ${trust.redaction}`);
    }
  }
}

export function printTabList(
  pages: Array<{ id: string; url: string; title?: string }>,
  activePageId: string
): void {
  if (currentFormat === "json") {
    printJson({ type: "tabs", activePageId, pages });
    return;
  }

  if (currentFormat === "pretty") {
    console.log(pc.bold(`Tabs (${pages.length})`));
    if (pages.length === 0) {
      console.log(pc.dim("No open tabs"));
      return;
    }

    pages.forEach((page, index) => {
      const marker = page.id === activePageId ? pc.green("●") : pc.dim("○");
      console.log(`${marker} [${index}] ${page.url || "about:blank"}${page.title ? ` — ${page.title}` : ""}`);
    });
    return;
  }

  console.log(`### Tabs (${pages.length})`);
  if (pages.length === 0) {
    console.log("  No open tabs");
    return;
  }

  pages.forEach((page, index) => {
    const active = page.id === activePageId ? " *" : "";
    console.log(`  [${index}] ${page.url || "about:blank"}${page.title ? ` — ${page.title}` : ""}${active}`);
  });
}

export function printHandoffSummary(summary: {
  page?: { url?: string; title?: string };
  reason?: string;
  outcome: string;
  preserved?: string[];
  warnings?: string[];
  next?: string[];
}): void {
  if (currentFormat === "json") {
    printJson({ type: "handoff", ...summary });
    return;
  }

  if (summary.page) {
    printPageSummary(summary.page.url, summary.page.title);
  }

  if (currentFormat === "pretty") {
    console.log(pc.bold("Handoff"));
    console.log(`- ${summary.outcome}`);
    if (summary.reason) {
      console.log(`- Reason: ${summary.reason}`);
    }
    for (const preserved of summary.preserved ?? []) {
      console.log(`- Preserved: ${preserved}`);
    }
    for (const warning of summary.warnings ?? []) {
      console.log(`- Note: ${warning}`);
    }
    for (const next of summary.next ?? []) {
      console.log(`- Next: ${next}`);
    }
    return;
  }

  console.log("### Handoff");
  console.log(`- Outcome: ${summary.outcome}`);
  if (summary.reason) {
    console.log(`- Reason: ${summary.reason}`);
  }
  for (const preserved of summary.preserved ?? []) {
    console.log(`- Preserved: ${preserved}`);
  }
  for (const warning of summary.warnings ?? []) {
    console.log(`- Note: ${warning}`);
  }
  for (const next of summary.next ?? []) {
    console.log(`- Next: ${next}`);
  }
}

export function printTraceSessionList(sessions: TraceSessionSummary[]): void {
  if (currentFormat === "json") {
    printJson({ type: "trace-sessions", sessions });
    return;
  }

  if (currentFormat === "pretty") {
    console.log(pc.bold(`Trace Sessions (${sessions.length})`));
    if (sessions.length === 0) {
      console.log(pc.dim("No trace sessions found"));
      return;
    }

    for (const session of sessions) {
      const age = formatRelativeTime(session.modified.getTime());
      console.log(`- ${session.sessionId} • ${session.entries} entries • ${(session.size / 1024).toFixed(1)}KB${age ? ` • ${age}` : ""}`);
    }
    return;
  }

  console.log(`### Trace Sessions (${sessions.length})`);
  if (sessions.length === 0) {
    console.log("  No trace sessions found");
    return;
  }

  for (const session of sessions) {
    const age = formatRelativeTime(session.modified.getTime());
    console.log(`- ${session.sessionId}: ${session.entries} entries, ${(session.size / 1024).toFixed(1)}KB${age ? `, ${age}` : ""}`);
  }
}

export function printTraceSummary(summary: {
  sessionId: string;
  entries: TraceEntrySummary[];
  skipped: number;
  totalEntries: number;
  totalDurationLabel: string;
  errorCount: number;
  formatEntry: (entry: TraceEntrySummary, index: number) => string;
}): void {
  if (currentFormat === "json") {
    printJson({
      type: "trace",
      sessionId: summary.sessionId,
      skipped: summary.skipped,
      totalEntries: summary.totalEntries,
      totalDuration: summary.totalDurationLabel,
      errorCount: summary.errorCount,
      entries: summary.entries,
    });
    return;
  }

  console.log(`### Trace: ${summary.sessionId}`);
  if (summary.skipped > 0) {
    console.log(`  (${summary.skipped} earlier entries hidden — use --all to show all)`);
  }
  console.log("");
  summary.entries.forEach((entry, index) => {
    console.log(summary.formatEntry(entry, index));
  });
  console.log("");
  console.log(
    `  Total: ${summary.totalEntries} requests, ${summary.totalDurationLabel}, ${summary.errorCount} errors`
  );
}

export function printActPlan(summary: ActPlanSummary): void {
  if (currentFormat === "json") {
    printJson({ type: "act-plan", ...summary });
    return;
  }

  const trust = summarizeTrustSurface(summary.trust);

  console.log("### Act Plan");
  console.log(`- Fused observe: ${summary.fusedObserve ? "yes" : "no"}`);
  console.log(`- Risk classes: ${summary.overallRisk.join(", ") || "none"}`);
  if (trust.approvalMode) {
    console.log(`- Approval: ${trust.approvalMode}`);
  }
  if (trust.domains) {
    console.log(`- Domains: ${trust.domains}`);
  }
  if (trust.redaction) {
    console.log(`- Redaction: ${trust.redaction}`);
  }
  console.log("### Steps");
  summary.steps.forEach((step, index) => {
    const target = step.target ? ` ${step.target}` : "";
    const value = step.valuePreview ? ` = ${step.valuePreview}` : "";
    console.log(`- [${index + 1}] ${step.action}${target}${value}`);
    console.log(`  - Risk: ${step.riskClasses.join(", ") || "none"}`);
  });
}

export function printActAudit(summary: ActAuditSummary): void {
  if (currentFormat === "json") {
    printJson({ type: "act-audit", ...summary });
    return;
  }

  const trust = summarizeTrustSurface(summary.trust);

  console.log("### Act Mini-Trace");
  console.log(`- Risk classes: ${summary.overallRisk.join(", ") || "none"}`);
  if (summary.delta) {
    console.log(`- Delta: ${summary.delta}`);
  }
  if (trust.approvalMode) {
    console.log(`- Approval: ${trust.approvalMode}`);
  }
  if (trust.domains) {
    console.log(`- Domains: ${trust.domains}`);
  }
  if (trust.redaction) {
    console.log(`- Redaction: ${trust.redaction}`);
  }
  console.log("### Step Outcomes");
  summary.steps.forEach((step) => {
    console.log(`- [${step.index + 1}] ${step.action}: ${step.status}`);
    console.log(`  - Risk: ${step.riskClasses.join(", ") || "none"}`);
    if (step.durationMs !== undefined) {
      console.log(`  - Duration: ${step.durationMs}ms`);
    }
    if (step.error) {
      console.log(`  - Error: ${step.error}`);
    }
    if (step.recovery) {
      console.log(`  - Recover: ${step.recovery}`);
    }
  });
}
