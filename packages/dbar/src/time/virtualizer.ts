import type { CDPSession } from "playwright-core";

import type { TimePolicy, TimeVirtualizerOptions, QuiescenceState } from "./types.js";

/**
 * Controls CDP virtual time via `Emulation.setVirtualTimePolicy`.
 * Tracks network quiescence (Fetch + Network events) to coordinate
 * step boundaries with pending requests.
 *
 * @example
 * ```ts
 * const v = new TimeVirtualizer(cdpSession, { stepBudgetMs: 5000 });
 * await v.start();
 * // ... run actions ...
 * await v.pause();
 * const { quiescent } = await v.waitForQuiescence();
 * await v.stop();
 * ```
 */
export class TimeVirtualizer {
  private readonly cdpSession: CDPSession;
  private readonly options: Required<TimeVirtualizerOptions>;
  private currentPolicy: TimePolicy = "pause";
  private virtualTimeOffset = 0;
  private budgetExpiredResolve: (() => void) | null = null;
  private listeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  // Quiescence tracking
  private pendingFetchCount = 0;
  private inFlightCount = 0;

  constructor(cdpSession: CDPSession, options: TimeVirtualizerOptions = {}) {
    this.cdpSession = cdpSession;
    this.options = {
      stepBudgetMs: options.stepBudgetMs ?? 10000,
      initialVirtualTime: options.initialVirtualTime ?? Date.now(),
      quiescenceTimeoutMs: options.quiescenceTimeoutMs ?? 10000,
    };
  }

  /** Register CDP listeners and set the initial virtual time policy. */
  async start(): Promise<void> {
    this.addListener("Emulation.virtualTimeBudgetExpired", () => {
      if (this.budgetExpiredResolve) {
        this.budgetExpiredResolve();
        this.budgetExpiredResolve = null;
      }
    });

    this.addListener("Fetch.requestPaused", () => {
      this.pendingFetchCount++;
    });

    this.addListener("Network.requestWillBeSent", () => {
      this.inFlightCount++;
    });
    this.addListener("Network.loadingFinished", () => {
      this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    });
    this.addListener("Network.loadingFailed", () => {
      this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    });

    await this.setPolicy("pauseIfNetworkFetchesPending");
  }

  /** Remove all CDP listeners. */
  async stop(): Promise<void> {
    this.removeAllListeners();
  }

  /**
   * Decrement the pending fetch counter. Call this after resolving a
   * Fetch event (continueRequest / fulfillRequest / failRequest).
   */
  trackFetchResolution(): void {
    this.pendingFetchCount = Math.max(0, this.pendingFetchCount - 1);
  }

  /**
   * Send a virtual time policy to CDP.
   * Non-pause policies include the configured step budget.
   * The first call includes `initialVirtualTime`.
   */
  async setPolicy(policy: TimePolicy): Promise<void> {
    this.currentPolicy = policy;

    const params: Record<string, unknown> = { policy };
    if (policy !== "pause") {
      params["budget"] = this.options.stepBudgetMs;
    }
    if (this.virtualTimeOffset === 0) {
      params["initialVirtualTime"] = this.options.initialVirtualTime;
    }

    await this.cdpSession.send("Emulation.setVirtualTimePolicy" as any, params as any);
  }

  /** Pause virtual time (for step boundaries). */
  async pause(): Promise<void> {
    await this.setPolicy("pause");
  }

  /** Resume virtual time with the configured budget. */
  async resume(): Promise<void> {
    await this.setPolicy("pauseIfNetworkFetchesPending");
  }

  /**
   * Wait for network quiescence or timeout.
   * @returns `{ quiescent: true }` if all network activity settled,
   *          `{ quiescent: false }` if the timeout was reached.
   */
  async waitForQuiescence(): Promise<{ quiescent: boolean }> {
    const start = Date.now();
    const timeout = this.options.quiescenceTimeoutMs;

    while (Date.now() - start < timeout) {
      const state = this.getQuiescenceState();
      if (state.isQuiescent) {
        return { quiescent: true };
      }
      // Short real-time wait to avoid busy loop
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return { quiescent: false };
  }

  /** Current network quiescence counters. */
  getQuiescenceState(): QuiescenceState {
    return {
      pendingFetchEvents: this.pendingFetchCount,
      inFlightRequests: this.inFlightCount,
      isQuiescent: this.pendingFetchCount === 0 && this.inFlightCount === 0,
    };
  }

  /** The last policy sent to CDP. */
  getCurrentPolicy(): TimePolicy {
    return this.currentPolicy;
  }

  private addListener(event: string, handler: (...args: unknown[]) => void): void {
    this.cdpSession.on(event as any, handler);
    this.listeners.push({ event, handler });
  }

  private removeAllListeners(): void {
    for (const { event, handler } of this.listeners) {
      this.cdpSession.off(event as any, handler);
    }
    this.listeners = [];
  }
}
