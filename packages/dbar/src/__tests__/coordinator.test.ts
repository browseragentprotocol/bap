import { describe, it, expect, vi, beforeEach } from "vitest";
import { Coordinator, type CaptureSessionState } from "../coordinator.js";

// Minimal CDP session mock
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
    _emit(event: string, ...args: any[]) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },
    _listeners: listeners,
  };
}

// Minimal Playwright Page mock
function createMockPage(cdpSession: ReturnType<typeof createMockCDPSession>) {
  const mockBrowser = {
    version: vi.fn().mockReturnValue("Chromium/120.0.0"),
  };
  const mockContext = {
    browser: vi.fn().mockReturnValue(mockBrowser),
    newCDPSession: vi.fn().mockResolvedValue(cdpSession),
    storageState: vi.fn().mockResolvedValue({
      cookies: [],
      origins: [],
    }),
  };
  return {
    context: vi.fn().mockReturnValue(mockContext),
    url: vi.fn().mockReturnValue("https://example.com"),
    viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    evaluate: vi.fn().mockResolvedValue("Mozilla/5.0 TestAgent"),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    locator: vi.fn().mockReturnValue({}),
    accessibility: {
      snapshot: vi.fn().mockResolvedValue({ role: "document", name: "Test" }),
    },
  };
}

describe("Coordinator", () => {
  let cdp: ReturnType<typeof createMockCDPSession>;
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    cdp = createMockCDPSession();
    page = createMockPage(cdp);
  });

  describe("startCapture", () => {
    it("shouldCreateCDPSessionAndInitializeSubsystems", async () => {
      // Given a mock page
      // When starting capture
      const state = await Coordinator.startCapture(page as any);

      // Then a CDP session is created
      expect(page.context().newCDPSession).toHaveBeenCalledWith(page);

      // And the session state is initialized
      expect(state.mode).toBe("capture");
      expect(state.id).toBeTruthy();
      expect(state.stepIndex).toBe(0);
      expect(state.aborted).toBe(false);
      expect(state.steps).toEqual([]);
      expect(state.divergences).toEqual([]);
    });

    it("shouldCaptureInitialStorageState", async () => {
      // Given a page with storage state
      // When starting capture
      const state = await Coordinator.startCapture(page as any);

      // Then initial state is captured
      expect(state.initialState.url).toBe("https://example.com");
      expect(state.initialState.cookies).toEqual([]);
    });

    it("shouldBuildEnvironmentDescriptor", async () => {
      // Given a page with browser info
      // When starting capture
      const state = await Coordinator.startCapture(page as any);

      // Then environment is populated from the page
      expect(state.environment.browserBuild).toBe("Chromium/120.0.0");
      expect(state.environment.viewport).toEqual({ width: 1280, height: 720 });
      expect(state.environment.locale).toBe("en-US");
      expect(state.environment.timezone).toBe("UTC");
      expect(state.environment.userAgent).toBe("Mozilla/5.0 TestAgent");
    });

    it("shouldUseSeedsFromOptionsWhenProvided", async () => {
      // Given custom seeds
      const seeds = { initialTime: 1700000000000, rngSeed: "test-seed" };

      // When starting capture with seeds
      const state = await Coordinator.startCapture(page as any, { seeds });

      // Then seeds are applied
      expect(state.seeds.initialTime).toBe(1700000000000);
      expect(state.seeds.rngSeed).toBe("test-seed");
    });

    it("shouldRecordSessionStartInTrace", async () => {
      // Given a page
      // When starting capture
      const state = await Coordinator.startCapture(page as any);

      // Then trace has a session start entry
      const entries = state.trace.getEntries();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0]!.type).toBe("session");
      expect(entries[0]!.category).toBe("capture_start");
    });

    it("shouldStartRecorderAndTimeVirtualizer", async () => {
      // Given a page
      // When starting capture
      await Coordinator.startCapture(page as any);

      // Then CDP domains are enabled (Fetch.enable from recorder, Emulation.setVirtualTimePolicy from virtualizer)
      const sendCalls = cdp.send.mock.calls.map((c: any[]) => c[0]);
      expect(sendCalls).toContain("Fetch.enable");
      expect(sendCalls).toContain("Network.enable");
      expect(sendCalls).toContain("Emulation.setVirtualTimePolicy");
    });
  });

  describe("step", () => {
    let state: CaptureSessionState;

    beforeEach(async () => {
      // Mock CDP responses needed during step
      cdp.send.mockImplementation(async (method: string) => {
        if (method === "DOMSnapshot.captureSnapshot") {
          return { documents: [], strings: [] };
        }
        return undefined;
      });
      state = await Coordinator.startCapture(page as any);
    });

    it("shouldCaptureSnapshotsAndComputeHashes", async () => {
      // Given an active capture session
      // When taking a step
      const snapshot = await Coordinator.step(state, "initial");

      // Then snapshot has observable hashes
      expect(snapshot.index).toBe(0);
      expect(snapshot.label).toBe("initial");
      expect(snapshot.observables.domSnapshotHash).toBeTruthy();
      expect(snapshot.observables.accessibilityHash).toBeTruthy();
      expect(snapshot.observables.screenshotHash).toBeTruthy();
      expect(snapshot.observables.networkDigest).toBeTruthy();
      expect(snapshot.captureMs).toBeGreaterThanOrEqual(0);
    });

    it("shouldIncrementStepIndex", async () => {
      // Given an active capture session
      // When taking two steps
      const snap1 = await Coordinator.step(state);
      const snap2 = await Coordinator.step(state);

      // Then step indices increment
      expect(snap1.index).toBe(0);
      expect(snap2.index).toBe(1);
      expect(state.stepIndex).toBe(2);
    });

    it("shouldAddCapsuleStepToState", async () => {
      // Given an active capture session
      // When taking a step
      await Coordinator.step(state, "test-step");

      // Then a capsule step is added to the state
      expect(state.steps).toHaveLength(1);
      expect(state.steps[0]!.index).toBe(0);
      expect(state.steps[0]!.label).toBe("test-step");
      expect(state.steps[0]!.artifacts.domSnapshot).toBe("snapshots/0/dom.json");
      expect(state.steps[0]!.artifacts.screenshot).toBe("snapshots/0/screenshot.png");
    });

    it("shouldStoreArtifactsInMemory", async () => {
      // Given an active capture session
      // When taking a step
      await Coordinator.step(state);

      // Then artifacts are stored
      expect(state.artifacts.has(0)).toBe(true);
      const artifacts = state.artifacts.get(0)!;
      expect(artifacts.domSnapshot).toBeTruthy();
      expect(artifacts.accessibilityYaml).toBeTruthy();
      expect(artifacts.screenshot).toBeInstanceOf(Buffer);
    });

    it("shouldRecordSnapshotInTrace", async () => {
      // Given an active capture session
      // When taking a step
      await Coordinator.step(state);

      // Then trace has snapshot entry
      const entries = state.trace.getEntries();
      const snapshotEntries = entries.filter((e) => e.type === "snapshot");
      expect(snapshotEntries).toHaveLength(1);
      expect(snapshotEntries[0]!.category).toBe("step-0");
    });

    it("shouldThrowWhenSessionIsAborted", async () => {
      // Given an aborted session
      state.aborted = true;

      // When trying to step
      // Then it throws
      await expect(Coordinator.step(state)).rejects.toThrow("Session has been aborted");
    });
  });

  describe("abort", () => {
    it("shouldMarkSessionAsAbortedAndCleanUp", async () => {
      // Given an active capture session
      const state = await Coordinator.startCapture(page as any);

      // When aborting
      await Coordinator.abort(state);

      // Then session is marked aborted
      expect(state.aborted).toBe(true);

      // And trace has abort entry
      const entries = state.trace.getEntries();
      const abortEntries = entries.filter((e) => e.category === "capture_abort");
      expect(abortEntries).toHaveLength(1);
    });

    it("shouldStopRecorderAndVirtualizer", async () => {
      // Given an active capture session
      const state = await Coordinator.startCapture(page as any);
      const sendCallsBefore = cdp.send.mock.calls.length;

      // When aborting
      await Coordinator.abort(state);

      // Then Fetch.disable is sent (recorder stop)
      const sendCallsAfter = cdp.send.mock.calls.slice(sendCallsBefore);
      const methods = sendCallsAfter.map((c: any[]) => c[0]);
      expect(methods).toContain("Fetch.disable");
    });
  });

  describe("getTranscript", () => {
    it("shouldReturnRecorderTranscript", async () => {
      // Given an active capture session
      const state = await Coordinator.startCapture(page as any);

      // When getting transcript
      const transcript = await Coordinator.getTranscript(state);

      // Then it returns the recorder's transcript
      expect(transcript).toBeDefined();
      expect(transcript.entries).toBeDefined();
    });
  });
});
