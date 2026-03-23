import type { CDPSession } from "playwright-core";

import type { NetworkTranscript, NetworkEntry, Divergence } from "../capsule/types.js";
import { hashRequest } from "./types.js";

/** Configuration options for the network replayer. */
export interface NetworkReplayerOptions {
  /**
   * What to do when a live request has no matching entry in the transcript.
   * - "block": fail the request with BlockedByClient
   * - "continue": let the request proceed to the real network
   */
  unmatchedRequestPolicy: "block" | "continue";
  /** Called when a divergence (unmatched request) is detected during replay. */
  onDivergence?: (divergence: Divergence) => void;
}

/**
 * Replays recorded network traffic by intercepting live requests and
 * fulfilling them from a pre-recorded transcript.
 *
 * Matching uses the (requestHash, occurrenceIndex) tuple for O(1) lookup,
 * so repeated identical requests get the correct sequential response.
 *
 * @example
 * ```ts
 * const replayer = new NetworkReplayer(cdpSession, transcript, {
 *   unmatchedRequestPolicy: "block",
 * });
 * await replayer.start();
 * // ... browser actions replay ...
 * await replayer.stop();
 * ```
 */
export class NetworkReplayer {
  private cdpSession: CDPSession;
  private options: NetworkReplayerOptions;
  private hashOccurrences = new Map<string, number>();
  private divergences: Divergence[] = [];
  private stepIndex = 0;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  /** Entries indexed by "hash:occurrenceIndex" for O(1) lookup. */
  private entryIndex = new Map<string, NetworkEntry>();

  constructor(
    cdpSession: CDPSession,
    transcript: NetworkTranscript,
    options: NetworkReplayerOptions
  ) {
    this.cdpSession = cdpSession;
    this.options = options;

    for (const entry of transcript.entries) {
      const key = `${entry.requestHash}:${entry.occurrenceIndex}`;
      this.entryIndex.set(key, entry);
    }
  }

  /** Enables CDP Fetch interception at request stage for replay. */
  async start(): Promise<void> {
    await this.cdpSession.send("Fetch.enable" as any, {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
      handleAuthRequests: false,
    });

    this.addListener("Fetch.requestPaused", this.onRequestPaused.bind(this));
  }

  /** Stops replay interception and removes all CDP listeners. */
  async stop(): Promise<void> {
    this.removeAllListeners();
    try {
      await this.cdpSession.send("Fetch.disable" as any);
    } catch {
      // Session may already be detached
    }
  }

  /** Sets the current step index for divergence attribution. */
  setStepIndex(index: number): void {
    this.stepIndex = index;
  }

  /** Returns a copy of all divergences recorded during replay. */
  getDivergences(): Divergence[] {
    return [...this.divergences];
  }

  private async onRequestPaused(event: any): Promise<void> {
    const request = event.request;
    const hash = hashRequest({
      method: request.method,
      url: request.url,
      headers: request.headers ?? {},
      postData: request.postData,
    });

    const occurrence = this.hashOccurrences.get(hash) ?? 0;
    this.hashOccurrences.set(hash, occurrence + 1);

    const key = `${hash}:${occurrence}`;
    const entry = this.entryIndex.get(key);

    if (entry?.error) {
      const errorReason = mapErrorToReason(entry.error.errorText);
      try {
        await this.cdpSession.send("Fetch.failRequest" as any, {
          requestId: event.requestId,
          errorReason,
        });
      } catch {
        // May already be handled
      }
    } else if (entry?.response) {
      const responseHeaders = Object.entries(entry.response.headers).map(([name, value]) => ({
        name,
        value,
      }));
      try {
        await this.cdpSession.send("Fetch.fulfillRequest" as any, {
          requestId: event.requestId,
          responseCode: entry.response.status,
          responseHeaders,
          body: entry.response.body,
        });
      } catch {
        // May already be handled
      }
    } else {
      const divergence: Divergence = {
        step: this.stepIndex,
        type: "unmatched_request",
        details: `${request.method} ${request.url} (hash: ${hash}, occurrence: ${occurrence})`,
      };
      this.divergences.push(divergence);
      this.options.onDivergence?.(divergence);

      try {
        if (this.options.unmatchedRequestPolicy === "continue") {
          await this.cdpSession.send("Fetch.continueRequest" as any, {
            requestId: event.requestId,
          });
        } else {
          await this.cdpSession.send("Fetch.failRequest" as any, {
            requestId: event.requestId,
            errorReason: "BlockedByClient",
          });
        }
      } catch {
        // May already be handled
      }
    }
  }

  private addListener(event: string, handler: (...args: any[]) => void): void {
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

/**
 * Maps a network error text string to the corresponding CDP Fetch.failRequest
 * errorReason enum value. Falls back to "Failed" for unrecognized errors.
 */
function mapErrorToReason(errorText: string): string {
  const text = errorText.toLowerCase();
  if (text.includes("dns") || text.includes("name not resolved")) return "NameNotResolved";
  if (text.includes("timeout") || text.includes("timed out")) return "TimedOut";
  if (text.includes("refused") || text.includes("connection refused")) return "ConnectionRefused";
  if (text.includes("reset")) return "ConnectionReset";
  if (text.includes("aborted") || text.includes("canceled")) return "Aborted";
  if (text.includes("ssl") || text.includes("certificate")) return "CertificateError";
  return "Failed";
}
