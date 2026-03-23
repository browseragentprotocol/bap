import { createHash } from "node:crypto";

import type { CDPSession } from "playwright-core";

import type { Divergence } from "../capsule/types.js";
import {
  type MutableNetworkTranscript,
  type MutableNetworkEntry,
  createTranscript,
  hashRequest,
  hashBody,
  redactHeaders,
  isSSE,
} from "./types.js";

/** Configuration options for the network recorder. */
export interface NetworkRecorderOptions {
  /** Called when unsupported traffic (SSE, WebSocket) is detected. */
  onUnsupportedTraffic?: (divergence: Divergence) => void;
}

/**
 * Records network traffic during a browser session using CDP's Fetch domain.
 *
 * Intercepts at both request and response stages to capture full request
 * signatures and response bodies. Tracks occurrence indices for repeated
 * identical requests so the replayer can serve the correct response.
 *
 * @example
 * ```ts
 * const recorder = new NetworkRecorder(cdpSession);
 * await recorder.start();
 * // ... browser actions ...
 * const transcript = await recorder.stop();
 * ```
 */
export class NetworkRecorder {
  private transcript: MutableNetworkTranscript;
  private cdpSession: CDPSession;
  private stepIndex = 0;
  private pendingRequests = new Map<string, MutableNetworkEntry>();
  private divergences: Divergence[] = [];
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];
  private options: NetworkRecorderOptions;

  constructor(cdpSession: CDPSession, options: NetworkRecorderOptions = {}) {
    this.cdpSession = cdpSession;
    this.transcript = createTranscript();
    this.options = options;
  }

  /** Enables CDP Fetch and Network domains and begins recording. */
  async start(): Promise<void> {
    await this.cdpSession.send("Fetch.enable" as any, {
      patterns: [
        { urlPattern: "*", requestStage: "Request" },
        { urlPattern: "*", requestStage: "Response" },
      ],
      handleAuthRequests: false,
    });

    await this.cdpSession.send("Network.enable" as any, {});

    this.addListener("Fetch.requestPaused", this.onRequestPaused.bind(this));
    this.addListener("Network.loadingFailed", this.onLoadingFailed.bind(this));
    this.addListener("Network.webSocketCreated", this.onWebSocketCreated.bind(this));
  }

  /**
   * Stops recording and returns the captured transcript.
   * Removes all CDP event listeners and disables Fetch interception.
   */
  async stop(): Promise<MutableNetworkTranscript> {
    this.removeAllListeners();
    try {
      await this.cdpSession.send("Fetch.disable" as any);
    } catch {
      // Session may already be detached
    }
    return this.transcript;
  }

  /** Sets the current step index for divergence attribution. */
  setStepIndex(index: number): void {
    this.stepIndex = index;
  }

  /** Returns a copy of all divergences recorded so far. */
  getDivergences(): Divergence[] {
    return [...this.divergences];
  }

  /**
   * Computes a SHA-256 digest over all recorded (requestHash, responseHash|errorText)
   * pairs. Used for per-step network determinism verification.
   */
  getNetworkDigest(): string {
    const hash = createHash("sha256");
    for (const entry of this.transcript.entries) {
      hash.update(entry.requestHash);
      if (entry.response) {
        hash.update(entry.response.bodyHash);
      } else if (entry.error) {
        hash.update(entry.error.errorText);
      }
    }
    return hash.digest("hex");
  }

  private async onRequestPaused(event: any): Promise<void> {
    const hasResponse = event.responseStatusCode !== undefined;

    if (!hasResponse) {
      await this.handleRequestStage(event);
    } else {
      await this.handleResponseStage(event);
    }
  }

  private async handleRequestStage(event: any): Promise<void> {
    const request = event.request;
    const reqHash = hashRequest({
      method: request.method,
      url: request.url,
      headers: request.headers ?? {},
      postData: request.postData,
    });

    const currentOccurrence = this.transcript.hashOccurrences.get(reqHash) ?? 0;
    this.transcript.hashOccurrences.set(reqHash, currentOccurrence + 1);

    const entry: MutableNetworkEntry = {
      index: this.transcript.entries.length,
      requestId: event.requestId,
      networkId: event.networkId,
      url: request.url,
      method: request.method,
      headers: redactHeaders(request.headers ?? {}),
      postData: request.postData,
      requestHash: reqHash,
      occurrenceIndex: currentOccurrence,
      timestamp: Date.now(),
    };

    this.transcript.entries.push(entry);
    this.pendingRequests.set(event.requestId, entry);

    try {
      await this.cdpSession.send("Fetch.continueRequest" as any, { requestId: event.requestId });
    } catch {
      // Request may have been canceled
    }
  }

  private async handleResponseStage(event: any): Promise<void> {
    const entry = this.pendingRequests.get(event.requestId);

    if (entry) {
      try {
        const { body, base64Encoded } = (await this.cdpSession.send(
          "Fetch.getResponseBody" as any,
          { requestId: event.requestId }
        )) as { body: string; base64Encoded: boolean };

        const responseHeaders: Record<string, string> = {};
        if (event.responseHeaders) {
          for (const h of event.responseHeaders) {
            responseHeaders[h.name] = h.value;
          }
        }

        entry.response = {
          status: event.responseStatusCode,
          headers: redactHeaders(responseHeaders),
          body: base64Encoded ? body : Buffer.from(body).toString("base64"),
          bodyHash: hashBody(body, base64Encoded),
        };

        // Detect SSE in response
        if (isSSE(responseHeaders)) {
          this.recordDivergence(
            "unsupported_traffic",
            undefined,
            undefined,
            `SSE response: ${entry.url}`
          );
        }
      } catch {
        // getResponseBody can fail for redirects or if body is unavailable
      }
      this.pendingRequests.delete(event.requestId);
    }

    try {
      await this.cdpSession.send("Fetch.continueResponse" as any, { requestId: event.requestId });
    } catch {
      // Response may have been handled
    }
  }

  private onLoadingFailed(event: any): void {
    const entry = this.findEntryByNetworkId(event.requestId);
    if (entry && !entry.response) {
      entry.error = {
        errorText: event.errorText ?? "Unknown error",
        canceled: event.canceled ?? false,
        blockedReason: event.blockedReason,
      };
    }
  }

  private onWebSocketCreated(event: any): void {
    this.recordDivergence(
      "unsupported_traffic",
      undefined,
      undefined,
      `WebSocket created: ${event.url}`
    );
  }

  private findEntryByNetworkId(networkId: string): MutableNetworkEntry | undefined {
    for (let i = this.transcript.entries.length - 1; i >= 0; i--) {
      const entry = this.transcript.entries[i]!;
      if (entry.networkId === networkId || entry.requestId === networkId) return entry;
    }
    return undefined;
  }

  private recordDivergence(
    type: Divergence["type"],
    expected?: string,
    actual?: string,
    details?: string
  ): void {
    const d: Divergence = { step: this.stepIndex, type, expected, actual, details };
    this.divergences.push(d);
    this.options.onUnsupportedTraffic?.(d);
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
