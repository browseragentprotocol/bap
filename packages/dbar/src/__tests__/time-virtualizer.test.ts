import { describe, it, expect, vi, beforeEach } from "vitest";
import { TimeVirtualizer } from "../time/virtualizer.js";
import { TimePolicySchema } from "../time/types.js";

// Minimal CDP session mock that tracks calls and supports event listeners
function createMockCDPSession() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();
  return {
    send: vi.fn().mockResolvedValue(undefined),
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
    // Test helper: emit an event to registered listeners
    _emit(event: string, ...args: any[]) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },
    _listeners: listeners,
  };
}

type MockCDPSession = ReturnType<typeof createMockCDPSession>;

describe("TimePolicySchema", () => {
  it("shouldAcceptAllValidPolicies", () => {
    // Given each valid time policy string
    const policies = ["pauseIfNetworkFetchesPending", "advance", "pause"] as const;
    // When each is parsed
    for (const policy of policies) {
      // Then it parses without error
      expect(TimePolicySchema.parse(policy)).toBe(policy);
    }
  });

  it("shouldRejectInvalidPolicy", () => {
    // Given an unknown policy string
    // When parsed
    // Then it throws
    expect(() => TimePolicySchema.parse("fastForward")).toThrow();
  });
});

describe("TimeVirtualizer", () => {
  let cdp: MockCDPSession;
  let virtualizer: TimeVirtualizer;

  beforeEach(() => {
    cdp = createMockCDPSession();
    virtualizer = new TimeVirtualizer(cdp as any);
  });

  describe("constructor", () => {
    it("shouldUseDefaultOptionsWhenNoneProvided", () => {
      // Given a virtualizer created with no options
      // When we check the current policy
      // Then it defaults to "pause" before start()
      expect(virtualizer.getCurrentPolicy()).toBe("pause");
    });
  });

  describe("start", () => {
    it("shouldRegisterCDPListenersAndSetInitialPolicy", async () => {
      // Given a fresh virtualizer
      // When started
      await virtualizer.start();

      // Then it registers listeners for budget expiration and network events
      const registeredEvents = cdp.on.mock.calls.map((c: any[]) => c[0]);
      expect(registeredEvents).toContain("Emulation.virtualTimeBudgetExpired");
      expect(registeredEvents).toContain("Fetch.requestPaused");
      expect(registeredEvents).toContain("Network.requestWillBeSent");
      expect(registeredEvents).toContain("Network.loadingFinished");
      expect(registeredEvents).toContain("Network.loadingFailed");

      // And it sends the initial policy to CDP
      expect(cdp.send).toHaveBeenCalledWith(
        "Emulation.setVirtualTimePolicy",
        expect.objectContaining({ policy: "pauseIfNetworkFetchesPending" })
      );
    });

    it("shouldIncludeInitialVirtualTimeOnFirstPolicySet", async () => {
      // Given a virtualizer with a specific initial time
      const v = new TimeVirtualizer(cdp as any, { initialVirtualTime: 1700000000000 });

      // When started
      await v.start();

      // Then the first setVirtualTimePolicy includes initialVirtualTime
      expect(cdp.send).toHaveBeenCalledWith(
        "Emulation.setVirtualTimePolicy",
        expect.objectContaining({ initialVirtualTime: 1700000000000 })
      );
    });
  });

  describe("stop", () => {
    it("shouldRemoveAllCDPListeners", async () => {
      // Given a started virtualizer
      await virtualizer.start();
      const listenerCount = cdp.on.mock.calls.length;

      // When stopped
      await virtualizer.stop();

      // Then all listeners are removed
      expect(cdp.off).toHaveBeenCalledTimes(listenerCount);
    });
  });

  describe("setPolicy", () => {
    it("shouldSendPolicyWithBudgetForNonPause", async () => {
      // Given a started virtualizer with custom budget
      const v = new TimeVirtualizer(cdp as any, { stepBudgetMs: 5000 });
      await v.start();
      cdp.send.mockClear();

      // When setting "advance" policy
      await v.setPolicy("advance");

      // Then it sends policy with budget
      expect(cdp.send).toHaveBeenCalledWith(
        "Emulation.setVirtualTimePolicy",
        expect.objectContaining({ policy: "advance", budget: 5000 })
      );
      expect(v.getCurrentPolicy()).toBe("advance");
    });

    it("shouldSendPolicyWithoutBudgetForPause", async () => {
      // Given a started virtualizer
      await virtualizer.start();
      cdp.send.mockClear();

      // When setting "pause" policy
      await virtualizer.setPolicy("pause");

      // Then no budget is included
      const call = cdp.send.mock.calls[0]!;
      expect(call[1]).toEqual(expect.objectContaining({ policy: "pause" }));
      expect(call[1]).not.toHaveProperty("budget");
    });
  });

  describe("pause and resume", () => {
    it("shouldSetPausePolicyOnPause", async () => {
      // Given a started virtualizer
      await virtualizer.start();
      cdp.send.mockClear();

      // When paused
      await virtualizer.pause();

      // Then policy is "pause"
      expect(virtualizer.getCurrentPolicy()).toBe("pause");
    });

    it("shouldSetPauseIfNetworkFetchesPendingOnResume", async () => {
      // Given a paused virtualizer
      await virtualizer.start();
      await virtualizer.pause();
      cdp.send.mockClear();

      // When resumed
      await virtualizer.resume();

      // Then policy is "pauseIfNetworkFetchesPending"
      expect(virtualizer.getCurrentPolicy()).toBe("pauseIfNetworkFetchesPending");
    });
  });

  describe("quiescence tracking", () => {
    it("shouldReportQuiescentWhenNoNetworkActivity", async () => {
      // Given a started virtualizer with no network events
      await virtualizer.start();

      // When checking quiescence
      const state = virtualizer.getQuiescenceState();

      // Then it is quiescent
      expect(state.isQuiescent).toBe(true);
      expect(state.pendingFetchEvents).toBe(0);
      expect(state.inFlightRequests).toBe(0);
    });

    it("shouldTrackPendingFetchEvents", async () => {
      // Given a started virtualizer
      await virtualizer.start();

      // When a Fetch.requestPaused event fires
      cdp._emit("Fetch.requestPaused");

      // Then pending fetch count increments
      expect(virtualizer.getQuiescenceState().pendingFetchEvents).toBe(1);
      expect(virtualizer.getQuiescenceState().isQuiescent).toBe(false);
    });

    it("shouldDecrementPendingFetchOnTrackFetchResolution", async () => {
      // Given a virtualizer with one pending fetch
      await virtualizer.start();
      cdp._emit("Fetch.requestPaused");

      // When the fetch is resolved
      virtualizer.trackFetchResolution();

      // Then pending count goes back to zero
      expect(virtualizer.getQuiescenceState().pendingFetchEvents).toBe(0);
      expect(virtualizer.getQuiescenceState().isQuiescent).toBe(true);
    });

    it("shouldNotDecrementPendingFetchBelowZero", async () => {
      // Given a virtualizer with no pending fetches
      await virtualizer.start();

      // When trackFetchResolution is called spuriously
      virtualizer.trackFetchResolution();

      // Then count stays at zero
      expect(virtualizer.getQuiescenceState().pendingFetchEvents).toBe(0);
    });

    it("shouldTrackInFlightRequests", async () => {
      // Given a started virtualizer
      await virtualizer.start();

      // When network requests are sent
      cdp._emit("Network.requestWillBeSent");
      cdp._emit("Network.requestWillBeSent");

      // Then in-flight count reflects pending requests
      expect(virtualizer.getQuiescenceState().inFlightRequests).toBe(2);
      expect(virtualizer.getQuiescenceState().isQuiescent).toBe(false);

      // When one finishes and one fails
      cdp._emit("Network.loadingFinished");
      cdp._emit("Network.loadingFailed");

      // Then count returns to zero
      expect(virtualizer.getQuiescenceState().inFlightRequests).toBe(0);
      expect(virtualizer.getQuiescenceState().isQuiescent).toBe(true);
    });

    it("shouldNotDecrementInFlightBelowZero", async () => {
      // Given a virtualizer with no in-flight requests
      await virtualizer.start();

      // When a loadingFinished fires without a prior requestWillBeSent
      cdp._emit("Network.loadingFinished");

      // Then count stays at zero
      expect(virtualizer.getQuiescenceState().inFlightRequests).toBe(0);
    });
  });

  describe("waitForQuiescence", () => {
    it("shouldReturnImmediatelyWhenAlreadyQuiescent", async () => {
      // Given a started virtualizer with no network activity
      await virtualizer.start();

      // When waiting for quiescence
      const result = await virtualizer.waitForQuiescence();

      // Then it returns quiescent immediately
      expect(result.quiescent).toBe(true);
    });

    it("shouldTimeoutWhenNotQuiescent", async () => {
      // Given a virtualizer with a very short timeout and pending activity
      const v = new TimeVirtualizer(cdp as any, { quiescenceTimeoutMs: 100 });
      await v.start();
      cdp._emit("Fetch.requestPaused");

      // When waiting for quiescence
      const result = await v.waitForQuiescence();

      // Then it times out
      expect(result.quiescent).toBe(false);
    });
  });
});
