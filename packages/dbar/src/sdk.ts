import type { Page, CDPSession } from "playwright-core";

import type {
  StepSnapshot,
  ReplayResult,
  ValidationResult,
  Divergence,
  StepObservables,
} from "./capsule/types.js";
import {
  buildCapsule,
  serializeCapsuleArchive,
  deserializeCapsuleArchive,
  type CapsuleBuildInput,
  type CapsuleArchive,
} from "./capsule/builder.js";
import { validateCapsule } from "./capsule/validator.js";
import { Coordinator, type CaptureOptions, type CaptureSessionState } from "./coordinator.js";
import { NetworkReplayer } from "./network/replayer.js";
import { TimeVirtualizer } from "./time/virtualizer.js";
import { captureDOMSnapshot } from "./snapshot/dom.js";
import { captureAccessibilitySnapshot } from "./snapshot/accessibility.js";
import { captureScreenshot } from "./snapshot/screenshot.js";
import { restoreStorageState } from "./snapshot/state.js";
import { TraceTimeline } from "./telemetry/trace.js";

// ---------------------------------------------------------------------------
// Capture Session
// ---------------------------------------------------------------------------

/**
 * A live capture session wrapping the Coordinator. Provides step(), finish(),
 * and abort() methods for the caller to drive capture boundaries.
 *
 * @example
 * ```ts
 * const session = await DBAR.capture(page);
 * await session.step("after-login");
 * await session.step("after-click");
 * const archive = await session.finish();
 * ```
 */
export class CaptureSession {
  private state: CaptureSessionState;
  private finished = false;

  /** @internal — use {@link DBAR.capture} to create. */
  constructor(state: CaptureSessionState) {
    this.state = state;
  }

  /** The unique session ID. */
  get id(): string {
    return this.state.id;
  }

  /** Number of steps captured so far. */
  get stepCount(): number {
    return this.state.stepIndex;
  }

  /**
   * Execute a step boundary — pauses time, waits for quiescence, captures
   * all observables, and resumes time.
   *
   * @param label - Optional human-readable label for this step
   * @returns Snapshot with observable hashes and timing
   */
  async step(label?: string): Promise<StepSnapshot> {
    if (this.finished) throw new Error("Session already finished or aborted");
    return Coordinator.step(this.state, label);
  }

  /**
   * Finish the capture session, stop all subsystems, and build a
   * {@link CapsuleArchive} from the recorded data.
   *
   * @returns The assembled capsule archive ready for validation/transport
   */
  async finish(): Promise<CapsuleArchive> {
    if (this.finished) throw new Error("Session already finished or aborted");
    this.finished = true;

    // Stop subsystems
    await this.state.recorder.stop();
    await this.state.timeVirtualizer.stop();
    this.state.trace.recordSession("capture_finish");

    // Get recorded network transcript
    const transcript = await Coordinator.getTranscript(this.state);

    const input: CapsuleBuildInput = {
      environment: this.state.environment,
      seeds: this.state.seeds,
      initialState: this.state.initialState,
      networkTranscript: {
        orderingPolicy: "creation",
        entries: transcript.entries,
      },
      steps: this.state.steps,
      artifacts: this.state.artifacts,
      captureStartTime: this.state.startTime,
    };

    return buildCapsule(input);
  }

  /**
   * Abort the capture session without producing a capsule.
   * Cleans up CDP listeners and subsystem state.
   */
  async abort(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await Coordinator.abort(this.state);
  }
}

// ---------------------------------------------------------------------------
// Replay Options
// ---------------------------------------------------------------------------

/** Options for {@link DBAR.replay}. */
export interface ReplayOptions {
  /** Policy for requests not found in the transcript (default: "block"). */
  unmatchedRequestPolicy?: "block" | "continue";
  /** Virtual time budget per step in ms (default: 10000). */
  stepBudgetMs?: number;
  /** CSS selectors of dynamic content to mask in screenshots. */
  screenshotMasks?: string[];
  /** Compare screenshotHash during replay (default: false — captured but not compared in v1). */
  compareScreenshots?: boolean;
}

// ---------------------------------------------------------------------------
// DBAR Static API
// ---------------------------------------------------------------------------

/**
 * DBAR — Deterministic Browser Agent Runtime.
 *
 * High-level entry point for capture, replay, and validation.
 *
 * @example
 * ```ts
 * // Capture
 * const session = await DBAR.capture(page);
 * await session.step("step-0");
 * const archive = await session.finish();
 *
 * // Validate
 * const validation = DBAR.validate(archive);
 *
 * // Replay
 * const result = await DBAR.replay(page, archive);
 * console.log(result.replaySuccessRate); // 1.0
 * ```
 */
export class DBAR {
  private constructor() {
    // Static-only class
  }

  /**
   * Start a capture session on a Playwright page.
   *
   * @param page - Playwright Page to record
   * @param options - Seed overrides, time budget, and masking options
   * @returns A {@link CaptureSession} with step()/finish()/abort() methods
   */
  static async capture(page: Page, options?: CaptureOptions): Promise<CaptureSession> {
    const state = await Coordinator.startCapture(page, options);
    return new CaptureSession(state);
  }

  /**
   * Replay a captured session against a live browser page, comparing
   * observables at each step to detect determinism divergences.
   *
   * The replayer:
   * 1. Restores initial state (cookies, localStorage, navigation)
   * 2. Sets up network interception from the capsule transcript
   * 3. Starts virtual time control
   * 4. Re-executes each step boundary, comparing observable hashes
   * 5. Computes RSR, DVR, and TTD metrics
   *
   * @param page - Playwright Page for replay (should be a fresh page)
   * @param archive - The capsule archive to replay
   * @param options - Replay configuration
   * @returns Replay metrics and divergence details
   */
  static async replay(
    page: Page,
    archive: CapsuleArchive,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    const startTime = Date.now();
    const capsule = archive.manifest;
    const divergences: Divergence[] = [];
    const trace = new TraceTimeline();
    trace.recordSession("replay_start", { capsuleId: capsule.id });

    // 1. Restore initial state
    await restoreStorageState(page, capsule.initialState);

    // 2. Set up CDP session + subsystems
    const cdpSession: CDPSession = await page.context().newCDPSession(page);

    const replayer = new NetworkReplayer(cdpSession, capsule.networkTranscript, {
      unmatchedRequestPolicy: options.unmatchedRequestPolicy ?? "block",
      onDivergence: (d) => divergences.push(d),
    });

    const timeVirtualizer = new TimeVirtualizer(cdpSession, {
      stepBudgetMs: options.stepBudgetMs ?? 10000,
      initialVirtualTime: capsule.seeds.initialTime,
    });

    await replayer.start();
    await timeVirtualizer.start();

    // 3. Replay each step
    let matchedSteps = 0;
    let timeToDivergence: number | undefined;

    for (const expectedStep of capsule.steps) {
      replayer.setStepIndex(expectedStep.index);

      // Pause time, wait for quiescence
      await timeVirtualizer.pause();
      const { quiescent } = await timeVirtualizer.waitForQuiescence();
      if (!quiescent) {
        divergences.push({ step: expectedStep.index, type: "quiescence_timeout" });
      }

      // Capture live observables
      const [domResult, a11yResult, screenshotResult] = await Promise.all([
        captureDOMSnapshot(cdpSession),
        captureAccessibilitySnapshot(page),
        captureScreenshot(page, { masks: options.screenshotMasks }),
      ]);

      const liveObservables: StepObservables = {
        domSnapshotHash: domResult.hash,
        accessibilityHash: a11yResult.hash,
        screenshotHash: screenshotResult.hash,
        // Network digest is not recomputed during replay — divergences are
        // detected at the request level by the NetworkReplayer.
        networkDigest: expectedStep.observables.networkDigest,
      };

      // Compare observables (per DBAR-C1: dom, accessibility, networkDigest are strict)
      let stepDiverged = false;

      if (liveObservables.domSnapshotHash !== expectedStep.observables.domSnapshotHash) {
        stepDiverged = true;
        divergences.push({
          step: expectedStep.index,
          type: "dom_mismatch",
          expected: expectedStep.observables.domSnapshotHash,
          actual: liveObservables.domSnapshotHash,
        });
      }

      if (liveObservables.accessibilityHash !== expectedStep.observables.accessibilityHash) {
        stepDiverged = true;
        divergences.push({
          step: expectedStep.index,
          type: "accessibility_mismatch",
          expected: expectedStep.observables.accessibilityHash,
          actual: liveObservables.accessibilityHash,
        });
      }

      // Screenshot comparison is opt-in (v1 captures but does not compare by default)
      if (
        options.compareScreenshots &&
        liveObservables.screenshotHash !== expectedStep.observables.screenshotHash
      ) {
        // Not a strict divergence — just logged
        divergences.push({
          step: expectedStep.index,
          type: "dom_mismatch",
          details: "screenshot_mismatch (advisory)",
          expected: expectedStep.observables.screenshotHash,
          actual: liveObservables.screenshotHash,
        });
      }

      if (!stepDiverged) {
        matchedSteps++;
      } else if (timeToDivergence === undefined) {
        timeToDivergence = expectedStep.index;
      }

      trace.recordSnapshot(expectedStep.index, liveObservables);

      // Resume time for next step
      await timeVirtualizer.resume();
    }

    // 4. Collect replayer divergences (unmatched requests)
    const replayerDivergences = replayer.getDivergences();
    // Replayer divergences are already pushed via onDivergence callback,
    // but update TTD if an unmatched request was the first divergence
    if (timeToDivergence === undefined && replayerDivergences.length > 0) {
      timeToDivergence = replayerDivergences[0]!.step;
    }

    // 5. Cleanup
    await replayer.stop();
    await timeVirtualizer.stop();
    trace.recordSession("replay_finish");

    // 6. Compute metrics
    const totalSteps = capsule.steps.length;
    const replaySuccessRate = totalSteps > 0 ? matchedSteps / totalSteps : 1;
    const determinismViolationRate = totalSteps > 0 ? 1 - replaySuccessRate : 0;

    return {
      success: divergences.length === 0,
      replaySuccessRate,
      determinismViolationRate,
      timeToDivergence,
      divergences,
      overheadMs: Date.now() - startTime,
    };
  }

  /**
   * Validate a capsule archive for structural integrity and consistency.
   *
   * @param archive - The capsule archive to validate
   * @returns Validation result with errors and warnings
   */
  static validate(archive: CapsuleArchive): ValidationResult {
    return validateCapsule(archive);
  }

  /**
   * Convenience: validate a capsule from a serialized base64 blob.
   *
   * @param base64 - Serialized archive blob from {@link serializeCapsuleArchive}
   * @returns Validation result
   */
  static validateFromBlob(base64: string): ValidationResult {
    const archive = deserializeCapsuleArchive(base64);
    return validateCapsule(archive);
  }

  /**
   * Serialize a capsule archive to a base64 string for transport.
   */
  static serialize(archive: CapsuleArchive): string {
    return serializeCapsuleArchive(archive);
  }

  /**
   * Deserialize a capsule archive from a base64 string.
   */
  static deserialize(base64: string): CapsuleArchive {
    return deserializeCapsuleArchive(base64);
  }
}
