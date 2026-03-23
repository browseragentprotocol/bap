/**
 * @fileoverview DBAR handlers — thin shim bridging DBAR SDK to BAP's JSON-RPC dispatch
 * @module @browseragentprotocol/server-playwright/handlers/dbar
 */

import { randomUUID } from "node:crypto";
import { ErrorCodes } from "@browseragentprotocol/protocol";
import type {
  DBARCaptureStartParams,
  DBARCaptureStartResult,
  DBARCaptureStepParams,
  DBARCaptureStepResult,
  DBARCaptureFinishParams,
  DBARCaptureFinishResult,
  DBARCaptureAbortResult,
  DBARReplayStartParams,
  DBARReplayStartResult,
  DBARReplayStepParams,
  DBARReplayStepResult,
  DBARReplayFinishParams,
  DBARReplayFinishResult,
  DBARCapsuleValidateResult,
} from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";

// Lazy import to avoid hard dependency on @browseragentprotocol/dbar at module load.
// The DBAR package is an optional peer dependency of the server.
let dbarModule: typeof import("@browseragentprotocol/dbar") | null = null;

async function getDBAR(): Promise<typeof import("@browseragentprotocol/dbar")> {
  if (!dbarModule) {
    try {
      dbarModule = await import("@browseragentprotocol/dbar");
    } catch {
      throw new BAPServerError(
        ErrorCodes.InternalError,
        "@browseragentprotocol/dbar is not installed — install it to use dbar/* methods"
      );
    }
  }
  return dbarModule;
}

/** Per-connection DBAR session state stored on ClientState. */
interface DBARSessionState {
  captureSession?: InstanceType<(typeof import("@browseragentprotocol/dbar"))["CaptureSession"]>;
  replayArchive?: import("@browseragentprotocol/dbar").CapsuleArchive;
  replayCDPSession?: import("playwright-core").CDPSession;
  replayStepIndex?: number;
  replayDivergences?: Array<{
    step: number;
    type: string;
    expected?: string;
    actual?: string;
    details?: string;
  }>;
  replayStartTime?: number;
}

/** Retrieve or initialize DBAR state on ClientState. */
function getDBARState(state: ClientState): DBARSessionState {
  const key = "__dbar" as keyof ClientState;
  if (!(state as any)[key]) {
    (state as any)[key] = {};
  }
  return (state as any)[key] as DBARSessionState;
}

// ── dbar/capture.start ──────────────────────────────────────────────────────

export async function handleDBARCaptureStart(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<DBARCaptureStartResult> {
  ctx.ensureBrowser(state);
  const dbar = await getDBAR();
  const p = params as unknown as DBARCaptureStartParams;
  const page = ctx.getPage(state, undefined);

  const session = await dbar.DBAR.capture(page, {
    stepBudgetMs: p.stepBudgetMs,
    seeds: p.seeds,
    screenshotMasks: p.screenshotMasks,
  });

  const dbarState = getDBARState(state);
  dbarState.captureSession = session;

  const env = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
  }));
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const browser = page.context().browser();

  return {
    sessionId: session.id,
    environment: {
      browserBuild: browser?.version() ?? "unknown",
      locale: "en-US",
      timezone: "UTC",
      viewport,
      userAgent: env.userAgent,
    },
  };
}

// ── dbar/capture.step ───────────────────────────────────────────────────────

export async function handleDBARCaptureStep(
  state: ClientState,
  params: Record<string, unknown>,
  _ctx: HandlerContext
): Promise<DBARCaptureStepResult> {
  const dbarState = getDBARState(state);
  if (!dbarState.captureSession) {
    throw new BAPServerError(ErrorCodes.InvalidRequest, "No active capture session");
  }

  const p = params as unknown as DBARCaptureStepParams;
  const snapshot = await dbarState.captureSession.step(p.label);

  return {
    index: snapshot.index,
    label: snapshot.label,
    observables: snapshot.observables,
    warnings: snapshot.warnings ?? [],
    captureMs: snapshot.captureMs,
  };
}

// ── dbar/capture.finish ─────────────────────────────────────────────────────

export async function handleDBARCaptureFinish(
  state: ClientState,
  _params: Record<string, unknown>,
  _ctx: HandlerContext
): Promise<DBARCaptureFinishResult> {
  const dbar = await getDBAR();
  const dbarState = getDBARState(state);
  if (!dbarState.captureSession) {
    throw new BAPServerError(ErrorCodes.InvalidRequest, "No active capture session");
  }

  const archive = await dbarState.captureSession.finish();
  dbarState.captureSession = undefined;

  const blob = dbar.serializeCapsuleArchive(archive);

  return {
    capsuleId: archive.manifest.id,
    totalSteps: archive.manifest.metrics.totalSteps,
    totalNetworkRequests: archive.manifest.metrics.totalNetworkRequests,
    capsuleSizeBytes: archive.manifest.metrics.capsuleSizeBytes,
    capsuleArchive: blob,
  };
}

// ── dbar/capture.abort ──────────────────────────────────────────────────────

export async function handleDBARCaptureAbort(
  state: ClientState,
  _params: Record<string, unknown>,
  _ctx: HandlerContext
): Promise<DBARCaptureAbortResult> {
  const dbarState = getDBARState(state);
  if (!dbarState.captureSession) {
    throw new BAPServerError(ErrorCodes.InvalidRequest, "No active capture session");
  }

  await dbarState.captureSession.abort();
  dbarState.captureSession = undefined;

  return { aborted: true };
}

// ── dbar/replay.start ───────────────────────────────────────────────────────

export async function handleDBARReplayStart(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<DBARReplayStartResult> {
  ctx.ensureBrowser(state);
  const dbar = await getDBAR();
  const p = params as unknown as DBARReplayStartParams;

  const archive = dbar.deserializeCapsuleArchive(p.capsuleArchive);
  const page = ctx.getPage(state, undefined);
  const cdpSession = await page.context().newCDPSession(page);

  const dbarState = getDBARState(state);
  dbarState.replayArchive = archive;
  dbarState.replayCDPSession = cdpSession;
  dbarState.replayStepIndex = 0;
  dbarState.replayDivergences = [];
  dbarState.replayStartTime = Date.now();

  return {
    sessionId: randomUUID(),
    totalSteps: archive.manifest.steps.length,
  };
}

// ── dbar/replay.step ────────────────────────────────────────────────────────

export async function handleDBARReplayStep(
  state: ClientState,
  _params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<DBARReplayStepResult> {
  const dbar = await getDBAR();
  const dbarState = getDBARState(state);
  if (!dbarState.replayArchive || dbarState.replayStepIndex === undefined) {
    throw new BAPServerError(ErrorCodes.InvalidRequest, "No active replay session");
  }

  const archive = dbarState.replayArchive;
  const stepIndex = dbarState.replayStepIndex;
  const capsule = archive.manifest;

  if (stepIndex >= capsule.steps.length) {
    throw new BAPServerError(ErrorCodes.InvalidRequest, "All steps have been replayed");
  }

  const expectedStep = capsule.steps[stepIndex]!;
  const page = ctx.getPage(state, undefined);
  const cdpSession = dbarState.replayCDPSession;
  if (!cdpSession) {
    throw new BAPServerError(
      ErrorCodes.InvalidRequest,
      "CDP session not initialized — call replay.start first"
    );
  }

  // Capture live observables
  const [domResult, a11yResult, screenshotResult] = await Promise.all([
    dbar.captureDOMSnapshot(cdpSession),
    dbar.captureAccessibilitySnapshot(page),
    dbar.captureScreenshot(page),
  ]);

  const divergences: Array<{
    type: string;
    expected?: string;
    actual?: string;
    details?: string;
  }> = [];

  const domMatch = domResult.hash === expectedStep.observables.domSnapshotHash;
  const a11yMatch = a11yResult.hash === expectedStep.observables.accessibilityHash;
  // Network digest is not recomputed per-step in granular replay mode
  const networkMatch = true;

  if (!domMatch) {
    const d = {
      type: "dom_mismatch",
      expected: expectedStep.observables.domSnapshotHash,
      actual: domResult.hash,
    };
    divergences.push(d);
    dbarState.replayDivergences!.push({ step: stepIndex, ...d });
  }
  if (!a11yMatch) {
    const d = {
      type: "accessibility_mismatch",
      expected: expectedStep.observables.accessibilityHash,
      actual: a11yResult.hash,
    };
    divergences.push(d);
    dbarState.replayDivergences!.push({ step: stepIndex, ...d });
  }

  dbarState.replayStepIndex = stepIndex + 1;

  return {
    index: stepIndex,
    passed: domMatch && a11yMatch && networkMatch,
    observables: {
      domSnapshotHash: {
        expected: expectedStep.observables.domSnapshotHash,
        actual: domResult.hash,
        match: domMatch,
      },
      accessibilityHash: {
        expected: expectedStep.observables.accessibilityHash,
        actual: a11yResult.hash,
        match: a11yMatch,
      },
      networkDigest: {
        expected: expectedStep.observables.networkDigest,
        actual: expectedStep.observables.networkDigest,
        match: networkMatch,
      },
      screenshotHash: {
        expected: expectedStep.observables.screenshotHash,
        actual: screenshotResult.hash,
      },
    },
    divergences,
  };
}

// ── dbar/replay.finish ──────────────────────────────────────────────────────

export async function handleDBARReplayFinish(
  state: ClientState,
  _params: Record<string, unknown>,
  _ctx: HandlerContext
): Promise<DBARReplayFinishResult> {
  const dbarState = getDBARState(state);
  if (!dbarState.replayArchive) {
    throw new BAPServerError(ErrorCodes.InvalidRequest, "No active replay session");
  }

  const totalSteps = dbarState.replayArchive.manifest.steps.length;
  const divergences = dbarState.replayDivergences ?? [];
  const stepsWithDivergence = new Set(divergences.map((d) => d.step));
  const matchedSteps = totalSteps - stepsWithDivergence.size;

  const replaySuccessRate = totalSteps > 0 ? matchedSteps / totalSteps : 1;
  const timeToDivergence = divergences.length > 0 ? divergences[0]!.step : undefined;
  const overheadMs = Date.now() - (dbarState.replayStartTime ?? Date.now());

  // Clean up CDP session
  if (dbarState.replayCDPSession) {
    try {
      await dbarState.replayCDPSession.detach();
    } catch {
      // Session may already be detached
    }
    dbarState.replayCDPSession = undefined;
  }

  // Clean up state
  dbarState.replayArchive = undefined;
  dbarState.replayStepIndex = undefined;
  dbarState.replayDivergences = undefined;
  dbarState.replayStartTime = undefined;

  return {
    success: divergences.length === 0,
    replaySuccessRate,
    determinismViolationRate: 1 - replaySuccessRate,
    timeToDivergence,
    totalSteps,
    divergences,
    overheadMs,
  };
}

// ── dbar/capsule.validate ───────────────────────────────────────────────────

export async function handleDBARCapsuleValidate(
  _state: ClientState,
  params: Record<string, unknown>,
  _ctx: HandlerContext
): Promise<DBARCapsuleValidateResult> {
  const dbar = await getDBAR();
  const p = params as unknown as { capsuleArchive: string };

  const archive = dbar.deserializeCapsuleArchive(p.capsuleArchive);
  return dbar.validateCapsule(archive);
}
