import { describe, it, expect, vi, beforeEach } from "vitest";
import { NetworkReplayer } from "../network/replayer.js";
import { hashRequest } from "../network/types.js";
import type { NetworkTranscript, Divergence } from "../capsule/types.js";

/**
 * Minimal CDPSession stub for replayer tests.
 */
function createMockCDPSession() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  const sentCommands: Array<{ method: string; params?: any }> = [];

  const session = {
    send: vi.fn(async (method: string, params?: any) => {
      sentCommands.push({ method, params });
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

function buildTranscript(
  entries: Array<{
    method: string;
    url: string;
    headers?: Record<string, string>;
    postData?: string;
    response?: { status: number; headers: Record<string, string>; body: string; bodyHash: string };
    error?: { errorText: string; canceled: boolean; blockedReason?: string };
  }>
): NetworkTranscript {
  const hashOccurrences = new Map<string, number>();
  return {
    orderingPolicy: "recorded",
    entries: entries.map((e, i) => {
      const reqHash = hashRequest({
        method: e.method,
        url: e.url,
        headers: e.headers ?? {},
        postData: e.postData,
      });
      const occurrence = hashOccurrences.get(reqHash) ?? 0;
      hashOccurrences.set(reqHash, occurrence + 1);
      return {
        index: i,
        requestId: `req-${i}`,
        url: e.url,
        method: e.method,
        headers: e.headers ?? {},
        requestHash: reqHash,
        occurrenceIndex: occurrence,
        timestamp: Date.now(),
        response: e.response,
        error: e.error,
      };
    }),
  };
}

describe("NetworkReplayer", () => {
  let mock: ReturnType<typeof createMockCDPSession>;

  beforeEach(() => {
    mock = createMockCDPSession();
  });

  it("shouldFulfillMatchedRequestFromTranscript", async () => {
    // Given a transcript with one recorded response
    const transcript = buildTranscript([
      {
        method: "GET",
        url: "https://example.com/api",
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: Buffer.from('{"ok":true}').toString("base64"),
          bodyHash: "abc123",
        },
      },
    ]);
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "block",
    });
    await replayer.start();

    // When the browser makes the same request
    mock.emit("Fetch.requestPaused", {
      requestId: "live-1",
      request: { method: "GET", url: "https://example.com/api", headers: {} },
    });

    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.fulfillRequest")).toBe(true);
    });

    // Then the request is fulfilled with the recorded response
    const fulfill = mock.sentCommands.find((c) => c.method === "Fetch.fulfillRequest");
    expect(fulfill!.params.responseCode).toBe(200);
    expect(fulfill!.params.requestId).toBe("live-1");

    await replayer.stop();
  });

  it("shouldReplayFailedRequestAsFailure", async () => {
    // Given a transcript with a failed request
    const transcript = buildTranscript([
      {
        method: "GET",
        url: "https://example.com/broken",
        error: { errorText: "net::ERR_CONNECTION_REFUSED", canceled: false },
      },
    ]);
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "block",
    });
    await replayer.start();

    // When the browser makes the same request
    mock.emit("Fetch.requestPaused", {
      requestId: "live-2",
      request: { method: "GET", url: "https://example.com/broken", headers: {} },
    });

    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.failRequest")).toBe(true);
    });

    // Then the request is failed with the mapped error reason
    const fail = mock.sentCommands.find((c) => c.method === "Fetch.failRequest");
    expect(fail!.params.errorReason).toBe("ConnectionRefused");

    await replayer.stop();
  });

  it("shouldBlockUnmatchedRequestWhenPolicyIsBlock", async () => {
    // Given an empty transcript
    const transcript = buildTranscript([]);
    const divergences: Divergence[] = [];
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "block",
      onDivergence: (d) => divergences.push(d),
    });
    await replayer.start();

    // When an unmatched request arrives
    mock.emit("Fetch.requestPaused", {
      requestId: "live-3",
      request: { method: "GET", url: "https://example.com/unknown", headers: {} },
    });

    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.failRequest")).toBe(true);
    });

    // Then it is blocked
    const fail = mock.sentCommands.find((c) => c.method === "Fetch.failRequest");
    expect(fail!.params.errorReason).toBe("BlockedByClient");
    // And a divergence is recorded
    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.type).toBe("unmatched_request");

    await replayer.stop();
  });

  it("shouldContinueUnmatchedRequestWhenPolicyIsContinue", async () => {
    // Given an empty transcript with continue policy
    const transcript = buildTranscript([]);
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "continue",
    });
    await replayer.start();

    // When an unmatched request arrives
    mock.emit("Fetch.requestPaused", {
      requestId: "live-4",
      request: { method: "GET", url: "https://example.com/passthrough", headers: {} },
    });

    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.continueRequest")).toBe(true);
    });

    // Then it is continued (not blocked)
    const cont = mock.sentCommands.find((c) => c.method === "Fetch.continueRequest");
    expect(cont!.params.requestId).toBe("live-4");

    await replayer.stop();
  });

  it("shouldMatchRepeatedRequestsByOccurrenceIndex", async () => {
    // Given a transcript with two identical requests returning different responses
    const transcript = buildTranscript([
      {
        method: "GET",
        url: "https://example.com/counter",
        response: {
          status: 200,
          headers: {},
          body: Buffer.from("first").toString("base64"),
          bodyHash: "hash1",
        },
      },
      {
        method: "GET",
        url: "https://example.com/counter",
        response: {
          status: 200,
          headers: {},
          body: Buffer.from("second").toString("base64"),
          bodyHash: "hash2",
        },
      },
    ]);
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "block",
    });
    await replayer.start();

    // When the first request arrives
    mock.emit("Fetch.requestPaused", {
      requestId: "live-a",
      request: { method: "GET", url: "https://example.com/counter", headers: {} },
    });
    await vi.waitFor(() => {
      expect(
        mock.sentCommands.some(
          (c) => c.method === "Fetch.fulfillRequest" && c.params?.requestId === "live-a"
        )
      ).toBe(true);
    });

    // When the second identical request arrives
    mock.emit("Fetch.requestPaused", {
      requestId: "live-b",
      request: { method: "GET", url: "https://example.com/counter", headers: {} },
    });
    await vi.waitFor(() => {
      expect(
        mock.sentCommands.some(
          (c) => c.method === "Fetch.fulfillRequest" && c.params?.requestId === "live-b"
        )
      ).toBe(true);
    });

    // Then the first gets "first" body, the second gets "second" body
    const fulfills = mock.sentCommands.filter((c) => c.method === "Fetch.fulfillRequest");
    expect(fulfills).toHaveLength(2);
    expect(fulfills[0]!.params.body).toBe(Buffer.from("first").toString("base64"));
    expect(fulfills[1]!.params.body).toBe(Buffer.from("second").toString("base64"));

    await replayer.stop();
  });

  it("shouldSetStepIndexOnDivergences", async () => {
    // Given an empty transcript
    const transcript = buildTranscript([]);
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "block",
    });
    await replayer.start();
    replayer.setStepIndex(3);

    // When an unmatched request arrives
    mock.emit("Fetch.requestPaused", {
      requestId: "live-5",
      request: { method: "GET", url: "https://example.com/x", headers: {} },
    });

    await vi.waitFor(() => {
      expect(mock.sentCommands.some((c) => c.method === "Fetch.failRequest")).toBe(true);
    });

    // Then the divergence has step index 3
    const divergences = replayer.getDivergences();
    expect(divergences[0]!.step).toBe(3);

    await replayer.stop();
  });

  it("shouldRemoveAllListenersOnStop", async () => {
    // Given a started replayer
    const transcript = buildTranscript([]);
    const replayer = new NetworkReplayer(mock.session, transcript, {
      unmatchedRequestPolicy: "block",
    });
    await replayer.start();

    // When stopped
    await replayer.stop();

    // Then listeners are removed and Fetch is disabled
    expect(mock.session.off.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mock.sentCommands.some((c) => c.method === "Fetch.disable")).toBe(true);
  });
});
