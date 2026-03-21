/**
 * @fileoverview Performance profiling handlers via CDP
 * @module @browseragentprotocol/server-playwright/handlers/perf
 *
 * Provides Web Vitals metrics, Chrome trace recording, and JS/CSS coverage
 * via direct CDP access. Chromium only — returns error for Firefox/WebKit.
 */

import type { HandlerContext, ClientState } from "../types.js";
import { BAPServerError } from "../errors.js";
import { ErrorCodes } from "@browseragentprotocol/protocol";

function requireCDP(ctx: HandlerContext, state: ClientState, pageId?: string) {
  const page = ctx.getPage(state, pageId);
  const session = ctx.getCDPSession(page);
  if (!session) {
    throw new BAPServerError(
      ErrorCodes.InvalidParams,
      "Performance profiling requires Chromium. Firefox and WebKit do not support CDP.",
      false,
      undefined,
      undefined,
      "Launch with browser: 'chromium' to use performance profiling"
    );
  }
  return { page, session };
}

// =============================================================================
// perf/metrics — Web Vitals and browser metrics
// =============================================================================

export interface PerfMetricsResult {
  metrics: Record<string, number>;
  webVitals: {
    /** First Contentful Paint (ms) */
    fcp?: number;
    /** Largest Contentful Paint (ms) */
    lcp?: number;
    /** Total Blocking Time (ms) */
    tbt?: number;
    /** Cumulative Layout Shift */
    cls?: number;
    /** DOM nodes count */
    domNodes?: number;
    /** JS heap size (bytes) */
    jsHeapUsed?: number;
    /** JS heap total (bytes) */
    jsHeapTotal?: number;
  };
}

export async function handlePerfMetrics(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<PerfMetricsResult> {
  const { session } = requireCDP(ctx, state, params.pageId as string | undefined);

  const { metrics: rawMetrics } = await session.send("Performance.getMetrics");
  const metrics: Record<string, number> = {};
  for (const m of rawMetrics as Array<{ name: string; value: number }>) {
    metrics[m.name] = m.value;
  }

  const webVitals: PerfMetricsResult["webVitals"] = {};

  // Extract Web Vitals from Performance API via evaluate
  const { page } = requireCDP(ctx, state, params.pageId as string | undefined);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vitals = await page.evaluate(() => {
      const entries = (globalThis as any).performance?.getEntriesByType?.("paint") ?? [];
      const fcp = entries.find((e: { name: string }) => e.name === "first-contentful-paint");
      const nav = (globalThis as any).performance?.getEntriesByType?.("navigation")?.[0];
      return {
        fcp: fcp?.startTime,
        domInteractive: nav?.domInteractive,
        domComplete: nav?.domComplete,
      };
    });
    if (vitals.fcp) webVitals.fcp = Math.round(vitals.fcp);
  } catch {
    // page.evaluate may fail in some contexts
  }

  // DOM node count and heap from CDP metrics
  webVitals.domNodes = metrics["Nodes"];
  webVitals.jsHeapUsed = metrics["JSHeapUsedSize"];
  webVitals.jsHeapTotal = metrics["JSHeapTotalSize"];

  return { metrics, webVitals };
}

// =============================================================================
// perf/trace — Chrome trace recording
// =============================================================================

export interface PerfTraceResult {
  /** Base64-encoded trace data (JSON) */
  data?: string;
  /** Status message */
  status: string;
}

const activeTraces = new Map<string, boolean>();

export async function handlePerfTraceStart(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<{ status: string }> {
  const { session } = requireCDP(ctx, state, params.pageId as string | undefined);

  if (activeTraces.get(state.clientId)) {
    return { status: "trace already recording" };
  }

  await session.send("Tracing.start", {
    categories:
      (params.categories as string) ??
      "-*,devtools.timeline,v8.execute,disabled-by-default-devtools.timeline",
    transferMode: "ReturnAsStream",
  });

  activeTraces.set(state.clientId, true);
  return { status: "recording" };
}

export async function handlePerfTraceStop(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<PerfTraceResult> {
  const { session } = requireCDP(ctx, state, params.pageId as string | undefined);

  if (!activeTraces.get(state.clientId)) {
    return { status: "no active trace", data: undefined };
  }

  // Collect trace data
  const chunks: string[] = [];
  const traceComplete = new Promise<void>((resolve) => {
    session.on("Tracing.tracingComplete", () => resolve());
    session.on("Tracing.dataCollected", (event: { value: Array<Record<string, unknown>> }) => {
      chunks.push(JSON.stringify(event.value));
    });
  });

  await session.send("Tracing.end");
  await Promise.race([
    traceComplete,
    new Promise<void>((resolve) => setTimeout(resolve, 10000)), // 10s timeout
  ]);

  activeTraces.delete(state.clientId);

  const traceJson = `[${chunks.join(",")}]`;
  return {
    status: "complete",
    data: Buffer.from(traceJson).toString("base64"),
  };
}

// =============================================================================
// perf/coverage — JS/CSS usage coverage
// =============================================================================

export interface PerfCoverageResult {
  js: { url: string; usedBytes: number; totalBytes: number; usedPercent: number }[];
  css: { url: string; usedBytes: number; totalBytes: number; usedPercent: number }[];
  summary: {
    jsUsedPercent: number;
    cssUsedPercent: number;
    totalJsBytes: number;
    totalCssBytes: number;
  };
}

export async function handlePerfCoverage(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<PerfCoverageResult> {
  const { session } = requireCDP(ctx, state, params.pageId as string | undefined);

  // Start precise JS coverage
  await session.send("Profiler.enable");
  await session.send("Profiler.startPreciseCoverage", {
    callCount: false,
    detailed: true,
  });

  // Start CSS coverage
  await session.send("CSS.enable");
  await session.send("CSS.startRuleUsageTracking");

  // Brief pause to collect coverage data
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Collect JS coverage
  const { result: jsCoverage } = await session.send("Profiler.takePreciseCoverage");
  await session.send("Profiler.stopPreciseCoverage");
  await session.send("Profiler.disable");

  // Collect CSS coverage
  const { ruleUsage } = await session.send("CSS.stopRuleUsageTracking");
  await session.send("CSS.disable");

  // Process JS coverage
  const js = (
    jsCoverage as Array<{
      url: string;
      functions: Array<{
        ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
      }>;
    }>
  )
    .filter((entry) => entry.url && !entry.url.startsWith("extensions://"))
    .map((entry) => {
      let totalBytes = 0;
      let usedBytes = 0;
      for (const fn of entry.functions) {
        for (const range of fn.ranges) {
          const size = range.endOffset - range.startOffset;
          totalBytes += size;
          if (range.count > 0) usedBytes += size;
        }
      }
      return {
        url: entry.url,
        usedBytes,
        totalBytes,
        usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
      };
    });

  // Process CSS coverage
  const cssMap = new Map<string, { used: number; total: number }>();
  for (const rule of ruleUsage as Array<{
    styleSheetId: string;
    used: boolean;
    startOffset: number;
    endOffset: number;
  }>) {
    const key = rule.styleSheetId;
    if (!cssMap.has(key)) cssMap.set(key, { used: 0, total: 0 });
    const entry = cssMap.get(key)!;
    const size = rule.endOffset - rule.startOffset;
    entry.total += size;
    if (rule.used) entry.used += size;
  }

  const css = [...cssMap.entries()].map(([url, { used, total }]) => ({
    url,
    usedBytes: used,
    totalBytes: total,
    usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
  }));

  // Summary
  const totalJsBytes = js.reduce((s, e) => s + e.totalBytes, 0);
  const usedJsBytes = js.reduce((s, e) => s + e.usedBytes, 0);
  const totalCssBytes = css.reduce((s, e) => s + e.totalBytes, 0);
  const usedCssBytes = css.reduce((s, e) => s + e.usedBytes, 0);

  return {
    js,
    css,
    summary: {
      jsUsedPercent: totalJsBytes > 0 ? Math.round((usedJsBytes / totalJsBytes) * 100) : 0,
      cssUsedPercent: totalCssBytes > 0 ? Math.round((usedCssBytes / totalCssBytes) * 100) : 0,
      totalJsBytes,
      totalCssBytes,
    },
  };
}
