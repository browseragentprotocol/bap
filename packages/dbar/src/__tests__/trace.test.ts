import { describe, it, expect, vi, beforeEach } from "vitest";
import { TraceTimeline, type TraceEntry } from "../telemetry/trace.js";

describe("TraceTimeline", () => {
  let timeline: TraceTimeline;

  beforeEach(() => {
    timeline = new TraceTimeline();
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
  });

  describe("record", () => {
    it("shouldAddEntryWithCurrentTimestamp", () => {
      // Given a fresh timeline
      // When recording an entry
      timeline.record({ type: "action", category: "click", data: { selector: "#btn" } });

      // Then one entry exists with the current timestamp
      const entries = timeline.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.timestamp).toBe(1700000000000);
      expect(entries[0]!.type).toBe("action");
      expect(entries[0]!.category).toBe("click");
      expect(entries[0]!.data).toEqual({ selector: "#btn" });
    });
  });

  describe("recordCDPEvent", () => {
    it("shouldRecordCDPEventWithDomainAndMethod", () => {
      // Given a timeline
      // When recording a CDP event
      timeline.recordCDPEvent("Page", "frameNavigated", { url: "https://example.com" });

      // Then the entry has type "cdp_event" and category "Page.frameNavigated"
      const entry = timeline.getEntries()[0]!;
      expect(entry.type).toBe("cdp_event");
      expect(entry.category).toBe("Page.frameNavigated");
      expect(entry.data).toEqual({ url: "https://example.com" });
    });

    it("shouldDefaultToEmptyDataWhenOmitted", () => {
      // Given a timeline
      // When recording a CDP event without data
      timeline.recordCDPEvent("Network", "enable");

      // Then data defaults to empty object
      expect(timeline.getEntries()[0]!.data).toEqual({});
    });
  });

  describe("recordAction", () => {
    it("shouldRecordActionWithParams", () => {
      // When recording an action
      timeline.recordAction("fill", { selector: "#email", value: "test@example.com" });

      // Then entry has type "action" with action as category
      const entry = timeline.getEntries()[0]!;
      expect(entry.type).toBe("action");
      expect(entry.category).toBe("fill");
      expect(entry.data).toEqual({ selector: "#email", value: "test@example.com" });
    });

    it("shouldDefaultToEmptyParamsWhenOmitted", () => {
      // When recording an action without params
      timeline.recordAction("screenshot");

      // Then data defaults to empty object
      expect(timeline.getEntries()[0]!.data).toEqual({});
    });
  });

  describe("recordSnapshot", () => {
    it("shouldRecordSnapshotWithStepIndexAndHashes", () => {
      // When recording a snapshot
      const hashes = {
        domSnapshotHash: "abc",
        accessibilityHash: "def",
        screenshotHash: "ghi",
        networkDigest: "jkl",
      };
      timeline.recordSnapshot(3, hashes);

      // Then entry has type "snapshot" and category "step-3"
      const entry = timeline.getEntries()[0]!;
      expect(entry.type).toBe("snapshot");
      expect(entry.category).toBe("step-3");
      expect(entry.data).toEqual(hashes);
    });
  });

  describe("recordNetwork", () => {
    it("shouldRecordNetworkRequestWithMethodAndUrl", () => {
      // When recording a network event
      timeline.recordNetwork("GET", "https://api.example.com/data", 200);

      // Then entry has type "network" with method as category
      const entry = timeline.getEntries()[0]!;
      expect(entry.type).toBe("network");
      expect(entry.category).toBe("GET");
      expect(entry.data).toEqual({ url: "https://api.example.com/data", status: 200 });
    });

    it("shouldAllowUndefinedStatus", () => {
      // When recording a network event without status (request phase)
      timeline.recordNetwork("POST", "https://api.example.com/submit");

      // Then status is undefined in data
      expect(timeline.getEntries()[0]!.data).toEqual({
        url: "https://api.example.com/submit",
        status: undefined,
      });
    });
  });

  describe("recordDivergence", () => {
    it("shouldRecordDivergenceWithStepAndType", () => {
      // When recording a divergence
      timeline.recordDivergence(5, "dom_mismatch", "expected hash abc got def");

      // Then entry has type "divergence" with divergence type as category
      const entry = timeline.getEntries()[0]!;
      expect(entry.type).toBe("divergence");
      expect(entry.category).toBe("dom_mismatch");
      expect(entry.data).toEqual({ step: 5, details: "expected hash abc got def" });
    });

    it("shouldAllowUndefinedDetails", () => {
      // When recording a divergence without details
      timeline.recordDivergence(0, "quiescence_timeout");

      // Then details is undefined
      expect(timeline.getEntries()[0]!.data).toEqual({ step: 0, details: undefined });
    });
  });

  describe("recordSession", () => {
    it("shouldRecordSessionEventWithData", () => {
      // When recording a session event
      timeline.recordSession("capture_start", { id: "test-id", url: "https://example.com" });

      // Then entry has type "session" with event as category
      const entry = timeline.getEntries()[0]!;
      expect(entry.type).toBe("session");
      expect(entry.category).toBe("capture_start");
      expect(entry.data).toEqual({ id: "test-id", url: "https://example.com" });
    });

    it("shouldDefaultToEmptyDataWhenOmitted", () => {
      // When recording a session event without data
      timeline.recordSession("cdp_session_lost");

      // Then data defaults to empty object
      expect(timeline.getEntries()[0]!.data).toEqual({});
    });
  });

  describe("getEntries", () => {
    it("shouldReturnReadonlyArrayOfAllEntries", () => {
      // Given a timeline with multiple entries
      timeline.recordAction("click");
      timeline.recordAction("fill");
      timeline.recordAction("press");

      // When getting entries
      const entries = timeline.getEntries();

      // Then all entries are returned
      expect(entries).toHaveLength(3);
    });

    it("shouldReturnEmptyArrayWhenNoEntries", () => {
      // Given an empty timeline
      // When getting entries
      // Then an empty array is returned
      expect(timeline.getEntries()).toHaveLength(0);
    });
  });

  describe("getEntriesSince", () => {
    it("shouldReturnEntriesFromGivenIndex", () => {
      // Given a timeline with 5 entries
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(1700000000000 + i * 1000);
        timeline.recordAction(`action-${i}`);
      }

      // When getting entries since index 3
      const entries = timeline.getEntriesSince(3);

      // Then only the last 2 entries are returned
      expect(entries).toHaveLength(2);
      expect(entries[0]!.category).toBe("action-3");
      expect(entries[1]!.category).toBe("action-4");
    });

    it("shouldReturnEmptyArrayWhenStartIndexBeyondLength", () => {
      // Given a timeline with 2 entries
      timeline.recordAction("a");
      timeline.recordAction("b");

      // When getting entries since index 10
      // Then empty array is returned
      expect(timeline.getEntriesSince(10)).toHaveLength(0);
    });
  });

  describe("toJSON", () => {
    it("shouldSerializeAllEntriesToJSON", () => {
      // Given a timeline with an entry
      timeline.recordAction("click", { selector: "#btn" });

      // When serializing to JSON
      const json = timeline.toJSON();
      const parsed = JSON.parse(json) as TraceEntry[];

      // Then it produces valid JSON with all entry fields
      expect(parsed).toHaveLength(1);
      expect(parsed[0]!.timestamp).toBe(1700000000000);
      expect(parsed[0]!.type).toBe("action");
    });
  });

  describe("clear", () => {
    it("shouldRemoveAllEntries", () => {
      // Given a timeline with entries
      timeline.recordAction("a");
      timeline.recordAction("b");
      expect(timeline.getEntries()).toHaveLength(2);

      // When clearing
      timeline.clear();

      // Then no entries remain
      expect(timeline.getEntries()).toHaveLength(0);
    });
  });
});
