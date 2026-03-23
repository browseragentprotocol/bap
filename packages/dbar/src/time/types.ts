import { z } from "zod";

/** CDP virtual time policy values for Emulation.setVirtualTimePolicy. */
export const TimePolicySchema = z.enum(["pauseIfNetworkFetchesPending", "advance", "pause"]);
export type TimePolicy = z.infer<typeof TimePolicySchema>;

/** Configuration for the virtual time controller. */
export interface TimeVirtualizerOptions {
  /** Virtual time budget per step in ms (default: 10000) */
  stepBudgetMs?: number;
  /** Initial virtual time (epoch ms) */
  initialVirtualTime?: number;
  /** Quiescence timeout in virtual ms (default: 10000) */
  quiescenceTimeoutMs?: number;
}

/** Tracks pending network activity to determine when the page is idle. */
export interface QuiescenceState {
  pendingFetchEvents: number;
  inFlightRequests: number;
  isQuiescent: boolean;
}
