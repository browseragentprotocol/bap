import { describe, expect, it } from "vitest";
import { TraceRecorder } from "../recording/trace-recorder.js";

describe("TraceRecorder.summarizeResult", () => {
  it("captures delta and recovery context for agent/act", () => {
    const summary = TraceRecorder.summarizeResult("agent/act", {
      completed: 1,
      total: 2,
      success: false,
      failedAt: 1,
      results: [
        { success: true },
        {
          success: false,
          error: {
            message: "Element not visible",
            data: {
              details: {
                recoveryHint: "Scroll into view and retry",
              },
            },
          },
        },
      ],
      postObservation: {
        metadata: { url: "https://example.com/checkout", title: "Checkout" },
        changes: {
          added: [{}],
          updated: [{}, {}],
          removed: [],
        },
      },
    });

    expect(summary).toMatchObject({
      completed: 1,
      total: 2,
      failedAt: 1,
      url: "https://example.com/checkout",
      added: 1,
      updated: 2,
      removed: 0,
      recoveryHint: "Scroll into view and retry",
    });
  });
});
