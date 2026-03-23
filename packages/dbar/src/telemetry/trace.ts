/**
 * Unified trace timeline that merges CDP events, agent actions, and
 * snapshot metadata into a single ordered sequence for debugging and
 * post-hoc analysis of capture/replay sessions.
 */

/** A single entry in the trace timeline. */
export interface TraceEntry {
  timestamp: number;
  type: "cdp_event" | "action" | "snapshot" | "network" | "divergence" | "session";
  category: string;
  data: Record<string, unknown>;
}

/**
 * Append-only timeline of heterogeneous trace entries.
 * Each `record*` method stamps the entry with `Date.now()` and appends it.
 *
 * @example
 * ```ts
 * const tl = new TraceTimeline();
 * tl.recordAction("click", { selector: "#btn" });
 * tl.recordNetwork("GET", "https://example.com", 200);
 * console.log(tl.toJSON());
 * ```
 */
export class TraceTimeline {
  private entries: TraceEntry[] = [];

  /** Record a generic trace entry, stamped with the current wall-clock time. */
  record(entry: Omit<TraceEntry, "timestamp">): void {
    this.entries.push({ ...entry, timestamp: Date.now() });
  }

  /** Record a Chrome DevTools Protocol event. */
  recordCDPEvent(domain: string, method: string, data?: Record<string, unknown>): void {
    this.record({ type: "cdp_event", category: `${domain}.${method}`, data: data ?? {} });
  }

  /** Record an agent action (click, fill, navigate, etc.). */
  recordAction(action: string, params?: Record<string, unknown>): void {
    this.record({ type: "action", category: action, data: params ?? {} });
  }

  /** Record a snapshot capture at a step boundary. */
  recordSnapshot(stepIndex: number, hashes: Record<string, string>): void {
    this.record({ type: "snapshot", category: `step-${stepIndex}`, data: hashes });
  }

  /** Record a network request or response event. */
  recordNetwork(method: string, url: string, status?: number): void {
    this.record({ type: "network", category: method, data: { url, status } });
  }

  /** Record a determinism divergence detected during replay or capture. */
  recordDivergence(stepIndex: number, divergenceType: string, details?: string): void {
    this.record({
      type: "divergence",
      category: divergenceType,
      data: { step: stepIndex, details },
    });
  }

  /** Record a session lifecycle event (start, stop, abort, CDP loss). */
  recordSession(event: string, data?: Record<string, unknown>): void {
    this.record({ type: "session", category: event, data: data ?? {} });
  }

  /** Return a readonly view of all recorded entries. */
  getEntries(): readonly TraceEntry[] {
    return this.entries;
  }

  /** Return entries from `startIndex` onward (useful for per-step slicing). */
  getEntriesSince(startIndex: number): TraceEntry[] {
    return this.entries.slice(startIndex);
  }

  /** Serialize the full timeline as a JSON string. */
  toJSON(): string {
    return JSON.stringify(this.entries);
  }

  /** Remove all entries from the timeline. */
  clear(): void {
    this.entries = [];
  }
}
