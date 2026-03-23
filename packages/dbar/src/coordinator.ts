import { randomUUID, createHash } from "node:crypto";

import type { CDPSession, Page } from "playwright-core";

import type {
  EnvironmentDescriptor,
  SeedPackage,
  StepSnapshot,
  Divergence,
  StepObservables,
  CapsuleStep,
  InitialState,
} from "./capsule/types.js";
import type { MutableNetworkTranscript } from "./network/types.js";
import { NetworkRecorder } from "./network/recorder.js";
import { TimeVirtualizer } from "./time/virtualizer.js";
import { captureDOMSnapshot } from "./snapshot/dom.js";
import { captureAccessibilitySnapshot } from "./snapshot/accessibility.js";
import { captureScreenshot } from "./snapshot/screenshot.js";
import { captureStorageState } from "./snapshot/state.js";
import { TraceTimeline } from "./telemetry/trace.js";

/** Options for starting a capture session. */
export interface CaptureOptions {
  /** Seed overrides for deterministic replay. */
  seeds?: Partial<SeedPackage>;
  /** Virtual time budget per step in ms (default: 10000). */
  stepBudgetMs?: number;
  /** CSS selectors of dynamic content to mask in screenshots. */
  screenshotMasks?: string[];
}

/** Mutable state of an active capture session. */
export interface CaptureSessionState {
  mode: "capture";
  id: string;
  page: Page;
  cdpSession: CDPSession;
  environment: EnvironmentDescriptor;
  seeds: SeedPackage;
  stepIndex: number;
  recorder: NetworkRecorder;
  timeVirtualizer: TimeVirtualizer;
  trace: TraceTimeline;
  steps: CapsuleStep[];
  divergences: Divergence[];
  initialState: InitialState;
  options: CaptureOptions;
  /** Index into recorder transcript entries at which the last step began. */
  lastNetworkEntryIndex: number;
  /** Snapshot artifacts stored in memory until finish(). */
  artifacts: Map<
    number,
    {
      domSnapshot: string;
      accessibilityYaml: string;
      screenshot: Buffer;
      traceSegment?: string;
    }
  >;
  startTime: number;
  aborted: boolean;
}

/**
 * Determinism Coordinator -- orchestrates all DBAR subsystems for capture sessions.
 *
 * Owns CDP session lifecycle, manages step boundaries (pause time, wait quiescence,
 * capture observables, resume), tracks divergences, and produces StepSnapshot at
 * each step() call.
 *
 * @example
 * ```ts
 * const state = await Coordinator.startCapture(page);
 * const snap0 = await Coordinator.step(state, "after-login");
 * const snap1 = await Coordinator.step(state, "after-click");
 * await Coordinator.abort(state);
 * ```
 */
export class Coordinator {
  /**
   * Start a capture session on a Playwright page.
   *
   * Creates a CDP session, captures initial storage state, and starts the
   * network recorder and time virtualizer subsystems.
   *
   * @param page - Playwright Page to capture
   * @param options - Seed overrides, budget, and masking options
   * @returns Mutable session state to pass to step() and abort()
   */
  static async startCapture(
    page: Page,
    options: CaptureOptions = {}
  ): Promise<CaptureSessionState> {
    const id = randomUUID();
    const cdpSession = await page.context().newCDPSession(page);

    const environment = await buildEnvironment(page);

    const seeds: SeedPackage = {
      initialTime: options.seeds?.initialTime ?? Date.now(),
      rngSeed: options.seeds?.rngSeed,
      orderingSeed: options.seeds?.orderingSeed,
    };

    const initialUrl = page.url();
    const initialState = await captureStorageState(page, initialUrl);

    const trace = new TraceTimeline();
    trace.recordSession("capture_start", { id, url: initialUrl });

    const recorder = new NetworkRecorder(cdpSession, {
      onUnsupportedTraffic: (d) => trace.recordDivergence(d.step, d.type, d.details),
    });

    const timeVirtualizer = new TimeVirtualizer(cdpSession, {
      stepBudgetMs: options.stepBudgetMs ?? 10000,
      initialVirtualTime: seeds.initialTime,
    });

    await recorder.start();
    await timeVirtualizer.start();

    cdpSession.on("disconnected" as any, () => {
      trace.recordSession("cdp_session_lost");
    });

    return {
      mode: "capture",
      id,
      page,
      cdpSession,
      environment,
      seeds,
      stepIndex: 0,
      recorder,
      timeVirtualizer,
      trace,
      steps: [],
      divergences: [],
      initialState,
      options,
      lastNetworkEntryIndex: 0,
      artifacts: new Map(),
      startTime: Date.now(),
      aborted: false,
    };
  }

  /**
   * Execute a step boundary -- pauses time, waits for quiescence, captures
   * all observables (DOM, accessibility, screenshot, network digest), and
   * resumes time.
   *
   * @param state - Active capture session state
   * @param label - Optional human-readable label for this step
   * @returns Snapshot with observable hashes and capture timing
   * @throws Error if the session has been aborted
   */
  static async step(state: CaptureSessionState, label?: string): Promise<StepSnapshot> {
    if (state.aborted) throw new Error("Session has been aborted");

    const stepStart = Date.now();
    const index = state.stepIndex;
    state.trace.recordSession("step_start", { index, label });

    // 1. Pause virtual time for deterministic snapshot
    await state.timeVirtualizer.pause();

    // 2. Wait for network quiescence
    const { quiescent } = await state.timeVirtualizer.waitForQuiescence();
    const warnings: string[] = [];
    if (!quiescent) {
      warnings.push("quiescence_timeout");
      state.divergences.push({ step: index, type: "quiescence_timeout" });
    }

    // 3. Capture all observables in parallel
    const [domResult, a11yResult, screenshotResult] = await Promise.all([
      captureDOMSnapshot(state.cdpSession),
      captureAccessibilitySnapshot(state.page),
      captureScreenshot(state.page, { masks: state.options.screenshotMasks }),
    ]);

    // 4. Compute network digest for entries since last step
    const transcript = getRecorderTranscript(state.recorder);
    const networkDigest = computeNetworkDigest(transcript.entries, state.lastNetworkEntryIndex);
    state.lastNetworkEntryIndex = transcript.entries.length;

    const observables: StepObservables = {
      domSnapshotHash: domResult.hash,
      accessibilityHash: a11yResult.hash,
      screenshotHash: screenshotResult.hash,
      networkDigest,
    };

    // 5. Store artifacts for later capsule assembly
    state.artifacts.set(index, {
      domSnapshot: domResult.serialized,
      accessibilityYaml: a11yResult.serialized,
      screenshot: screenshotResult.buffer,
    });

    // 6. Build capsule step record
    const capsuleStep: CapsuleStep = {
      index,
      label,
      observables,
      artifacts: {
        domSnapshot: `snapshots/${index}/dom.json`,
        accessibilityYaml: `snapshots/${index}/accessibility.json`,
        screenshot: `snapshots/${index}/screenshot.png`,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
    state.steps.push(capsuleStep);

    state.trace.recordSnapshot(index, observables);

    // 7. Resume virtual time
    await state.timeVirtualizer.resume();
    state.stepIndex++;

    const captureMs = Date.now() - stepStart;
    return { index, label, observables, warnings, captureMs };
  }

  /**
   * Abort the capture session and clean up CDP listeners.
   *
   * @param state - Active capture session state
   */
  static async abort(state: CaptureSessionState): Promise<void> {
    state.aborted = true;
    state.trace.recordSession("capture_abort");
    await state.recorder.stop();
    await state.timeVirtualizer.stop();
  }

  /**
   * Get the network transcript from the recorder (for capsule building).
   *
   * @param state - Active capture session state
   * @returns The recorder's internal network transcript
   */
  static async getTranscript(state: CaptureSessionState): Promise<MutableNetworkTranscript> {
    return getRecorderTranscript(state.recorder);
  }
}

/**
 * Build an EnvironmentDescriptor from a Playwright Page.
 * Extracts browser version, viewport, and user agent.
 */
async function buildEnvironment(page: Page): Promise<EnvironmentDescriptor> {
  const context = page.context();
  const browser = context.browser();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  return {
    browserBuild: browser?.version() ?? "unknown",
    browserFlags: [],
    locale: "en-US",
    timezone: "UTC",
    viewport,
    deviceScaleFactor: 1,
    userAgent: await page.evaluate(() => navigator.userAgent),
    offline: false,
  };
}

/**
 * Access the recorder's internal transcript via private field.
 * Acceptable because the Coordinator is tightly coupled to NetworkRecorder.
 */
function getRecorderTranscript(recorder: NetworkRecorder): MutableNetworkTranscript {
  return (recorder as any).transcript;
}

/**
 * Compute a SHA-256 digest over a slice of network entries.
 * The digest covers (requestHash, responseBodyHash|errorText) pairs
 * from `startIndex` to the end of the entries array.
 */
function computeNetworkDigest(
  entries: Array<{
    requestHash: string;
    response?: { bodyHash: string };
    error?: { errorText: string };
  }>,
  startIndex: number
): string {
  const hash = createHash("sha256");
  for (let i = startIndex; i < entries.length; i++) {
    const entry = entries[i]!;
    hash.update(entry.requestHash);
    if (entry.response) {
      hash.update(entry.response.bodyHash);
    } else if (entry.error) {
      hash.update(entry.error.errorText);
    }
  }
  return hash.digest("hex");
}
