/**
 * @fileoverview DBAR (Deterministic Browser Agent Runtime) method param/result types
 * @module @browseragentprotocol/protocol/types/dbar
 */

import { z } from "zod";

// ── dbar/capture.start ──────────────────────────────────────────────────────

/**
 * Parameters for dbar/capture.start — begins a deterministic capture session.
 *
 * @example
 * ```ts
 * const params: DBARCaptureStartParams = {
 *   stepBudgetMs: 5000,
 *   seeds: { initialTime: Date.now() },
 * };
 * ```
 */
export const DBARCaptureStartParamsSchema = z.object({
  /** Virtual time budget per step in ms */
  stepBudgetMs: z.number().int().positive().optional(),
  /** Initial seeds for determinism */
  seeds: z
    .object({
      initialTime: z.number().optional(),
      rngSeed: z.string().optional(),
      orderingSeed: z.string().optional(),
    })
    .optional(),
  /** Policy for unmatched requests during replay */
  unmatchedRequestPolicy: z.enum(["block", "continue"]).optional(),
  /** CSS selectors of dynamic content to mask in screenshots */
  screenshotMasks: z.array(z.string()).optional(),
});
export type DBARCaptureStartParams = z.infer<typeof DBARCaptureStartParamsSchema>;

/**
 * Result for dbar/capture.start — returns the session ID and locked-in environment.
 */
export const DBARCaptureStartResultSchema = z.object({
  sessionId: z.string(),
  environment: z.object({
    browserBuild: z.string(),
    locale: z.string(),
    timezone: z.string(),
    viewport: z.object({ width: z.number(), height: z.number() }),
    userAgent: z.string(),
  }),
});
export type DBARCaptureStartResult = z.infer<typeof DBARCaptureStartResultSchema>;

// ── dbar/capture.step ───────────────────────────────────────────────────────

/**
 * Parameters for dbar/capture.step — snapshots observables at the current step boundary.
 */
export const DBARCaptureStepParamsSchema = z.object({
  sessionId: z.string(),
  label: z.string().optional(),
});
export type DBARCaptureStepParams = z.infer<typeof DBARCaptureStepParamsSchema>;

/**
 * Result for dbar/capture.step — the observable hashes and any capture warnings.
 */
export const DBARCaptureStepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().optional(),
  observables: z.object({
    domSnapshotHash: z.string(),
    accessibilityHash: z.string(),
    screenshotHash: z.string(),
    networkDigest: z.string(),
  }),
  warnings: z.array(z.string()),
  captureMs: z.number().nonnegative(),
});
export type DBARCaptureStepResult = z.infer<typeof DBARCaptureStepResultSchema>;

// ── dbar/capture.finish ─────────────────────────────────────────────────────

/**
 * Parameters for dbar/capture.finish — finalises and packages the capsule.
 */
export const DBARCaptureFinishParamsSchema = z.object({
  sessionId: z.string(),
});
export type DBARCaptureFinishParams = z.infer<typeof DBARCaptureFinishParamsSchema>;

/**
 * Result for dbar/capture.finish — the completed capsule as a base64-encoded ZIP archive.
 */
export const DBARCaptureFinishResultSchema = z.object({
  capsuleId: z.string().uuid(),
  totalSteps: z.number().int().nonnegative(),
  totalNetworkRequests: z.number().int().nonnegative(),
  capsuleSizeBytes: z.number().int().nonnegative(),
  /** Base64-encoded ZIP archive of the capsule */
  capsuleArchive: z.string(),
});
export type DBARCaptureFinishResult = z.infer<typeof DBARCaptureFinishResultSchema>;

// ── dbar/capture.abort ──────────────────────────────────────────────────────

/**
 * Parameters for dbar/capture.abort — cancels an in-progress capture session.
 */
export const DBARCaptureAbortParamsSchema = z.object({
  sessionId: z.string(),
});
export type DBARCaptureAbortParams = z.infer<typeof DBARCaptureAbortParamsSchema>;

/**
 * Result for dbar/capture.abort — confirms the session was aborted.
 */
export const DBARCaptureAbortResultSchema = z.object({
  aborted: z.literal(true),
});
export type DBARCaptureAbortResult = z.infer<typeof DBARCaptureAbortResultSchema>;

// ── dbar/replay.start ───────────────────────────────────────────────────────

/**
 * Parameters for dbar/replay.start — loads a capsule and prepares for step-by-step replay.
 */
export const DBARReplayStartParamsSchema = z.object({
  /** Base64-encoded capsule ZIP archive */
  capsuleArchive: z.string(),
  /** Policy for unmatched requests */
  unmatchedRequestPolicy: z.enum(["block", "continue"]).optional(),
});
export type DBARReplayStartParams = z.infer<typeof DBARReplayStartParamsSchema>;

/**
 * Result for dbar/replay.start — the replay session ID and total step count.
 */
export const DBARReplayStartResultSchema = z.object({
  sessionId: z.string(),
  totalSteps: z.number().int().nonnegative(),
});
export type DBARReplayStartResult = z.infer<typeof DBARReplayStartResultSchema>;

// ── dbar/replay.step ────────────────────────────────────────────────────────

/**
 * Parameters for dbar/replay.step — advances the replay by one step and compares observables.
 */
export const DBARReplayStepParamsSchema = z.object({
  sessionId: z.string(),
});
export type DBARReplayStepParams = z.infer<typeof DBARReplayStepParamsSchema>;

/**
 * Result for dbar/replay.step — per-observable pass/fail comparison and any divergences.
 */
export const DBARReplayStepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  passed: z.boolean(),
  observables: z.object({
    domSnapshotHash: z.object({ expected: z.string(), actual: z.string(), match: z.boolean() }),
    accessibilityHash: z.object({ expected: z.string(), actual: z.string(), match: z.boolean() }),
    networkDigest: z.object({ expected: z.string(), actual: z.string(), match: z.boolean() }),
    /** Screenshot hashes are recorded but not compared for pass/fail (visual reference only) */
    screenshotHash: z.object({ expected: z.string(), actual: z.string() }),
  }),
  divergences: z.array(
    z.object({
      type: z.string(),
      expected: z.string().optional(),
      actual: z.string().optional(),
      details: z.string().optional(),
    })
  ),
});
export type DBARReplayStepResult = z.infer<typeof DBARReplayStepResultSchema>;

// ── dbar/replay.finish ──────────────────────────────────────────────────────

/**
 * Parameters for dbar/replay.finish — ends the replay session and returns aggregate results.
 */
export const DBARReplayFinishParamsSchema = z.object({
  sessionId: z.string(),
});
export type DBARReplayFinishParams = z.infer<typeof DBARReplayFinishParamsSchema>;

/**
 * Result for dbar/replay.finish — aggregate replay metrics and all divergence events.
 */
export const DBARReplayFinishResultSchema = z.object({
  success: z.boolean(),
  replaySuccessRate: z.number().min(0).max(1),
  determinismViolationRate: z.number().min(0).max(1),
  timeToDivergence: z.number().int().nonnegative().optional(),
  totalSteps: z.number().int().nonnegative(),
  divergences: z.array(
    z.object({
      step: z.number().int().nonnegative(),
      type: z.string(),
      expected: z.string().optional(),
      actual: z.string().optional(),
      details: z.string().optional(),
    })
  ),
  overheadMs: z.number().nonnegative(),
});
export type DBARReplayFinishResult = z.infer<typeof DBARReplayFinishResultSchema>;

// ── dbar/capsule.validate ───────────────────────────────────────────────────

/**
 * Parameters for dbar/capsule.validate — validates a capsule archive against the DBAR schema.
 */
export const DBARCapsuleValidateParamsSchema = z.object({
  /** Base64-encoded capsule ZIP archive */
  capsuleArchive: z.string(),
});
export type DBARCapsuleValidateParams = z.infer<typeof DBARCapsuleValidateParamsSchema>;

/**
 * Result for dbar/capsule.validate — validation outcome with structured errors and warnings.
 */
export const DBARCapsuleValidateResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    })
  ),
  warnings: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    })
  ),
});
export type DBARCapsuleValidateResult = z.infer<typeof DBARCapsuleValidateResultSchema>;
