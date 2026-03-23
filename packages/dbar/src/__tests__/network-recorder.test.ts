import { describe, it, expect, vi, beforeEach } from "vitest";
import { NetworkRecorder } from "../network/recorder.js";
import type { Divergence } from "../capsule/types.js";

/**
 * Minimal CDPSession stub that records sent commands and allows
 * dispatching events to registered listeners.
 */
function createMockCDPSession() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const sentCommands: Array<{ method: string; params?: any }> = [];

  const session = {
    send: vi.fn(async (method: string, params?: any) => {
      sentCommands.push({ method, params });
      if (method === "Fetch.getResponseBody") {
        return { body: Buffer.from("response body").toString("base64"), base64Encoded: true };
      }
      return {};
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => void) => {
      const handlers = listeners.get(event);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    }),
  };

  function emit(event: string, data: any): void {
    const handlers = listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  return { session: session as any, emit, sentCommands };
}

describe("NetworkRecorder", () => {
  let mock: ReturnType<typeof createMockCDPSession>;
  let recorder: NetworkRecorder;

  beforeEach(() => {
    mock = createMockCDPSession();
    recorder = new NetworkRecorder(mock.session);
  });

  it("shouldEnableFetchAndNetworkDomainsOnStart", async () => {
    // When the recorder starts
    await recorder.start();
    // Then it enables Fetch with both request and response stages
    const fetchEnable = mock.sentCommands.find((c) => c.method === "Fetch.enable");
    expect(fetchEnable).toBeDefined();
    expect(fetchEnable!.params.patterns).toHaveLength(2);
    // And it enables the Network domain
    const networkEnable = mock.sentCommands.find((c) => c.method === "Network.enable");
    expect(networkEnable).toBeDefined();
  });

  it("shouldRecordRequestOnRequestStage", async () => {
    // Given a started recorder
    await recorder.start();
    // When a request-stage Fetch.requestPaused event fires
    mock.emit("Fetch.requestPaused", {
      requestId: "req-1",
      networkId: "net-1",
      request: {
        method: "GET",
        url: "https://example.com/api",
        headers: { Accept: "application/json" },
      },
    });
    // Allow async handler to complete
    await vi.waitFor(() => {
      const cont = mock.sentCommands.find(
        (c) => c.method === "Fetch.continueRequest" && c.params?.requestId === "req-1"
      );
      expect(cont).toBeDefined();
    });
    // Then the transcript has one entry
    const transcript = await recorder.stop();
    expect(transcript.entries).toHaveLength(1);
    expect(transcript.entries[0]!.url).toBe("https://example.com/api");
    expect(transcript.entries[0]!.requestHash).toHaveLength(64);
    expect(transcript.entries[0]!.occurrenceIndex).toBe(0);
  });

  it("shouldRecordResponseOnResponseStage", async () => {
    // Given a started recorder with a pending request
    await recorder.start();
    // First: request stage
    mock.emit("Fetch.requestPaused", {
      requestId: "req-2",
      request: {
        method: "GET",
        url: "https://example.com/data",
        headers: {},
      },
    });
    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.continueRequest")).toBe(true);
    });
    // When: response stage
    mock.emit("Fetch.requestPaused", {
      requestId: "req-2",
      responseStatusCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      request: {
        method: "GET",
        url: "https://example.com/data",
        headers: {},
      },
    });
    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.getResponseBody")).toBe(true);
    });
    // Then the entry has a response with status and body hash
    const transcript = await recorder.stop();
    const entry = transcript.entries[0]!;
    expect(entry.response).toBeDefined();
    expect(entry.response!.status).toBe(200);
    expect(entry.response!.bodyHash).toHaveLength(64);
  });

  it("shouldTrackOccurrenceIndexForRepeatedRequests", async () => {
    // Given a started recorder
    await recorder.start();
    const request = {
      method: "GET",
      url: "https://example.com/api",
      headers: {},
    };
    // When two identical requests are recorded
    mock.emit("Fetch.requestPaused", { requestId: "req-a", request });
    mock.emit("Fetch.requestPaused", { requestId: "req-b", request });
    await vi.waitFor(() => {
      expect(mock.sentCommands.filter((c) => c.method === "Fetch.continueRequest")).toHaveLength(2);
    });
    // Then the second has occurrenceIndex 1
    const transcript = await recorder.stop();
    expect(transcript.entries[0]!.occurrenceIndex).toBe(0);
    expect(transcript.entries[1]!.occurrenceIndex).toBe(1);
    // And both share the same request hash
    expect(transcript.entries[0]!.requestHash).toBe(transcript.entries[1]!.requestHash);
  });

  it("shouldRecordLoadingFailedAsError", async () => {
    // Given a started recorder with a pending request
    await recorder.start();
    mock.emit("Fetch.requestPaused", {
      requestId: "req-fail",
      networkId: "net-fail",
      request: {
        method: "GET",
        url: "https://example.com/broken",
        headers: {},
      },
    });
    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.continueRequest")).toBe(true);
    });
    // When a loading failure occurs
    mock.emit("Network.loadingFailed", {
      requestId: "net-fail",
      errorText: "net::ERR_CONNECTION_REFUSED",
      canceled: false,
    });
    // Then the entry has an error
    const transcript = await recorder.stop();
    const entry = transcript.entries[0]!;
    expect(entry.error).toBeDefined();
    expect(entry.error!.errorText).toBe("net::ERR_CONNECTION_REFUSED");
    expect(entry.error!.canceled).toBe(false);
  });

  it("shouldRecordWebSocketAsDivergence", async () => {
    // Given a started recorder with divergence callback
    const divergences: Divergence[] = [];
    const recorderWithCb = new NetworkRecorder(mock.session, {
      onUnsupportedTraffic: (d) => divergences.push(d),
    });
    await recorderWithCb.start();
    // When a WebSocket is created
    mock.emit("Network.webSocketCreated", { url: "wss://example.com/ws" });
    // Then a divergence is recorded
    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.type).toBe("unsupported_traffic");
    expect(divergences[0]!.details).toContain("WebSocket");
    await recorderWithCb.stop();
  });

  it("shouldRemoveAllListenersOnStop", async () => {
    // Given a started recorder
    await recorder.start();
    // When stopped
    await recorder.stop();
    // Then all listeners are removed
    expect(mock.session.off.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("shouldSetStepIndex", async () => {
    // Given a started recorder
    await recorder.start();
    recorder.setStepIndex(5);
    // When a WebSocket divergence occurs
    mock.emit("Network.webSocketCreated", { url: "wss://example.com/ws" });
    // Then the divergence has step index 5
    const divergences = recorder.getDivergences();
    expect(divergences[0]!.step).toBe(5);
    await recorder.stop();
  });

  it("shouldRedactSensitiveHeadersInRecordedEntries", async () => {
    // Given a started recorder
    await recorder.start();
    // When a request with sensitive headers is recorded
    mock.emit("Fetch.requestPaused", {
      requestId: "req-auth",
      request: {
        method: "GET",
        url: "https://example.com/secure",
        headers: { Authorization: "Bearer secret", Accept: "text/html" },
      },
    });
    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.continueRequest")).toBe(true);
    });
    // Then the stored headers have Authorization redacted
    const transcript = await recorder.stop();
    expect(transcript.entries[0]!.headers["Authorization"]).toBe("[REDACTED]");
    expect(transcript.entries[0]!.headers["Accept"]).toBe("text/html");
  });
});
