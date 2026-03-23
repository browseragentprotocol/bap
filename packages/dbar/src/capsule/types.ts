import { z } from "zod";

/**
 * Describes the browser environment used during a capture session.
 * All fields must be reproduced exactly during replay for deterministic behavior.
 */
export const EnvironmentDescriptorSchema = z.object({
  browserBuild: z.string(),
  browserFlags: z.array(z.string()),
  osImageHash: z.string().optional(),
  locale: z.string(),
  timezone: z.string(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  deviceScaleFactor: z.number().positive(),
  userAgent: z.string(),
  geolocation: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      accuracy: z.number().optional(),
    })
    .optional(),
  offline: z.boolean(),
  extraHTTPHeaders: z.record(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  proxy: z
    .object({
      server: z.string(),
      bypass: z.string().optional(),
      username: z.string().optional(),
    })
    .optional(),
});
export type EnvironmentDescriptor = z.infer<typeof EnvironmentDescriptorSchema>;

/**
 * Time and RNG seeds that must be frozen during replay to prevent nondeterminism
 * from Date.now(), Math.random(), and response ordering.
 */
export const SeedPackageSchema = z.object({
  initialTime: z.number(),
  rngSeed: z.string().optional(),
  orderingSeed: z.string().optional(),
});
export type SeedPackage = z.infer<typeof SeedPackageSchema>;

/**
 * Cookie serialized for capsule storage. Mirrors Playwright's Cookie type
 * but with sameSite restricted to the three valid values.
 */
export const CapsuleCookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(["Strict", "Lax", "None"]),
});
export type CapsuleCookie = z.infer<typeof CapsuleCookieSchema>;

/**
 * Browser state at the start of a capture session: URL, cookies, and
 * localStorage entries needed to reproduce the starting context for replay.
 */
export const InitialStateSchema = z.object({
  url: z.string(),
  cookies: z.array(CapsuleCookieSchema),
  localStorage: z.array(
    z.object({
      origin: z.string(),
      entries: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      ),
    })
  ),
  unsupportedState: z.array(z.string()),
});
export type InitialState = z.infer<typeof InitialStateSchema>;

/**
 * A single recorded network request and its response (or error).
 * The requestHash + occurrenceIndex pair uniquely identifies which response
 * to serve during replay when the same URL is requested multiple times.
 */
export const NetworkEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  requestId: z.string(),
  url: z.string(),
  method: z.string(),
  headers: z.record(z.string()),
  postData: z.string().optional(),
  requestHash: z.string(),
  occurrenceIndex: z.number().int().nonnegative(),
  timestamp: z.number(),
  response: z
    .object({
      status: z.number().int(),
      headers: z.record(z.string()),
      body: z.string(), // base64
      bodyHash: z.string(),
    })
    .optional(),
  error: z
    .object({
      errorText: z.string(),
      canceled: z.boolean(),
      blockedReason: z.string().optional(),
    })
    .optional(),
});
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;

/**
 * The complete ordered log of network traffic captured during a session.
 * orderingPolicy controls whether replay serves responses in creation order
 * or in the exact sequence they were recorded.
 */
export const NetworkTranscriptSchema = z.object({
  orderingPolicy: z.enum(["creation", "recorded"]),
  entries: z.array(NetworkEntrySchema),
});
export type NetworkTranscript = z.infer<typeof NetworkTranscriptSchema>;

/**
 * A browser action taken during a capture step, e.g. click, fill, navigate.
 * All fields except type are optional because different action types use
 * different subsets of parameters.
 */
export const StepActionSchema = z.object({
  type: z.string(),
  selector: z.string().optional(),
  value: z.string().optional(),
  url: z.string().optional(),
  frameId: z.string().optional(),
  waitUntil: z.string().optional(),
});
export type StepAction = z.infer<typeof StepActionSchema>;

/**
 * Content hashes captured after each step for determinism verification.
 * Replay compares these hashes against live-computed values to detect divergence.
 */
export const StepObservablesSchema = z.object({
  domSnapshotHash: z.string(),
  accessibilityHash: z.string(),
  screenshotHash: z.string(),
  networkDigest: z.string(),
});
export type StepObservables = z.infer<typeof StepObservablesSchema>;

/**
 * Paths to snapshot files stored inside the capsule archive (relative to archive root).
 */
export const StepArtifactsSchema = z.object({
  domSnapshot: z.string(),
  accessibilityYaml: z.string(),
  screenshot: z.string(),
  traceSegment: z.string().optional(),
});
export type StepArtifacts = z.infer<typeof StepArtifactsSchema>;

/**
 * A single recorded step in the capsule: the action taken, the observable
 * hashes after it, and paths to the stored snapshot artifacts.
 */
export const CapsuleStepSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().optional(),
  action: StepActionSchema.optional(),
  observables: StepObservablesSchema,
  artifacts: StepArtifactsSchema,
  warnings: z.array(z.string()).optional(),
});
export type CapsuleStep = z.infer<typeof CapsuleStepSchema>;

/**
 * Aggregate performance and size statistics for a capsule.
 */
export const CapsuleMetricsSchema = z.object({
  totalSteps: z.number().int().nonnegative(),
  totalNetworkRequests: z.number().int().nonnegative(),
  unsupportedRequestCount: z.number().int().nonnegative(),
  captureOverheadMs: z.number().nonnegative(),
  capsuleSizeBytes: z.number().int().nonnegative(),
});
export type CapsuleMetrics = z.infer<typeof CapsuleMetricsSchema>;

/**
 * The root DBAR capsule document. Contains everything needed to deterministically
 * replay a browser session: environment, seeds, initial state, network transcript,
 * per-step snapshots, and verification hashes.
 *
 * @example
 * ```ts
 * const capsule = DeterminismCapsuleSchema.parse(rawJson);
 * console.log(capsule.version); // "1.0.0"
 * ```
 */
export const DeterminismCapsuleSchema = z.object({
  version: z.literal("1.0.0"),
  capsuleProfile: z.literal("replay"),
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  environment: EnvironmentDescriptorSchema,
  seeds: SeedPackageSchema,
  initialState: InitialStateSchema,
  networkTranscript: NetworkTranscriptSchema,
  steps: z.array(CapsuleStepSchema),
  metrics: CapsuleMetricsSchema,
});
export type DeterminismCapsule = z.infer<typeof DeterminismCapsuleSchema>;

/**
 * Enumeration of reasons a replay can diverge from the captured session.
 */
export const DivergenceTypeSchema = z.enum([
  "dom_mismatch",
  "accessibility_mismatch",
  "network_digest_mismatch",
  "unmatched_request",
  "unsupported_traffic",
  "quiescence_timeout",
  "cdp_session_lost",
]);
export type DivergenceType = z.infer<typeof DivergenceTypeSchema>;

/**
 * A single divergence event detected during replay, capturing which step
 * failed, the type of divergence, and the expected vs. actual values.
 */
export const DivergenceSchema = z.object({
  step: z.number().int().nonnegative(),
  type: DivergenceTypeSchema,
  expected: z.string().optional(),
  actual: z.string().optional(),
  details: z.string().optional(),
});
export type Divergence = z.infer<typeof DivergenceSchema>;

/**
 * Snapshot returned after each step() call during a capture session.
 * Contains the observable hashes for incremental verification and
 * the time taken to capture all artifacts.
 */
export const StepSnapshotSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string().optional(),
  observables: StepObservablesSchema,
  warnings: z.array(z.string()),
  captureMs: z.number().nonnegative(),
});
export type StepSnapshot = z.infer<typeof StepSnapshotSchema>;

/**
 * The outcome of a full replay run: success/failure, rates, divergences,
 * and the step index where divergence was first detected.
 */
export const ReplayResultSchema = z.object({
  success: z.boolean(),
  replaySuccessRate: z.number().min(0).max(1),
  determinismViolationRate: z.number().min(0).max(1),
  timeToDivergence: z.number().int().nonnegative().optional(),
  divergences: z.array(DivergenceSchema),
  overheadMs: z.number().nonnegative(),
});
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

/**
 * Result of validating a capsule document against the DBAR schema.
 * errors block acceptance; warnings are advisory.
 */
export const ValidationResultSchema = z.object({
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
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
