import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildCapsule,
  serializeCapsuleArchive,
  deserializeCapsuleArchive,
  type CapsuleBuildInput,
} from "../capsule/builder.js";
import { validateCapsule } from "../capsule/validator.js";
import type {
  CapsuleStep,
  EnvironmentDescriptor,
  SeedPackage,
  InitialState,
} from "../capsule/types.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const validEnvironment: EnvironmentDescriptor = {
  browserBuild: "chromium/1140",
  browserFlags: [],
  locale: "en-US",
  timezone: "UTC",
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  offline: false,
};

const validSeeds: SeedPackage = { initialTime: 1700000000000 };

const validInitialState: InitialState = {
  url: "https://example.com",
  cookies: [],
  localStorage: [],
  unsupportedState: ["sessionStorage", "indexedDB", "serviceWorkers"],
};

const domContent = JSON.stringify({ tag: "html", children: [] });
const a11yContent = JSON.stringify({ role: "WebArea" });
const screenshotBytes = Buffer.from("PNG_DATA_FAKE");

function makeSteps(count: number): CapsuleStep[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    observables: {
      domSnapshotHash: `sha256-dom-${i}`,
      accessibilityHash: `sha256-a11y-${i}`,
      screenshotHash: `sha256-screenshot-${i}`,
      networkDigest: `sha256-network-${i}`,
    },
    artifacts: {
      domSnapshot: `snapshots/${i}/dom.json`,
      accessibilityYaml: `snapshots/${i}/accessibility.json`,
      screenshot: `snapshots/${i}/screenshot.png`,
    },
  }));
}

function makeArtifacts(count: number): CapsuleBuildInput["artifacts"] {
  const map = new Map<
    number,
    { domSnapshot: string; accessibilityYaml: string; screenshot: Buffer; traceSegment?: string }
  >();
  for (let i = 0; i < count; i++) {
    map.set(i, {
      domSnapshot: domContent,
      accessibilityYaml: a11yContent,
      screenshot: screenshotBytes,
    });
  }
  return map;
}

function makeMinimalInput(): CapsuleBuildInput {
  return {
    environment: validEnvironment,
    seeds: validSeeds,
    initialState: validInitialState,
    networkTranscript: { orderingPolicy: "recorded", entries: [] },
    steps: makeSteps(1),
    artifacts: makeArtifacts(1),
    captureStartTime: Date.now() - 100,
  };
}

// ---------------------------------------------------------------------------
// buildCapsule
// ---------------------------------------------------------------------------

describe("buildCapsule", () => {
  it("shouldReturnManifestWithCorrectTopLevelFields", () => {
    // Given a minimal valid input
    const input = makeMinimalInput();

    // When built
    const archive = buildCapsule(input);

    // Then manifest has expected static fields
    expect(archive.manifest.version).toBe("1.0.0");
    expect(archive.manifest.capsuleProfile).toBe("replay");
    expect(typeof archive.manifest.id).toBe("string");
    expect(archive.manifest.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(typeof archive.manifest.createdAt).toBe("string");
  });

  it("shouldStoreArtifactFilesInArchive", () => {
    // Given one step with artifacts
    const input = makeMinimalInput();

    // When built
    const archive = buildCapsule(input);

    // Then snapshot files are in the archive
    expect(archive.files.has("snapshots/0/dom.json")).toBe(true);
    expect(archive.files.has("snapshots/0/accessibility.json")).toBe(true);
    expect(archive.files.has("snapshots/0/screenshot.png")).toBe(true);
  });

  it("shouldStoreManifestAsCapsulejson", () => {
    // Given a minimal input
    const input = makeMinimalInput();

    // When built
    const archive = buildCapsule(input);

    // Then capsule.json exists and round-trips to the manifest
    expect(archive.files.has("capsule.json")).toBe(true);
    const parsed = JSON.parse(archive.files.get("capsule.json")!.toString("utf-8"));
    expect(parsed.version).toBe("1.0.0");
  });

  it("shouldDeduplicateNetworkResponseBodiesByHash", () => {
    // Given two network entries sharing the same response body hash
    const sharedBody = Buffer.from("shared-response-body").toString("base64");
    const sharedHash = createHash("sha256")
      .update(Buffer.from("shared-response-body"))
      .digest("hex");
    const input = makeMinimalInput();
    input.networkTranscript = {
      orderingPolicy: "recorded",
      entries: [
        {
          index: 0,
          requestId: "req-1",
          url: "https://api.example.com/data",
          method: "GET",
          headers: {},
          requestHash: "hash-1",
          occurrenceIndex: 0,
          timestamp: 1000,
          response: { status: 200, headers: {}, body: sharedBody, bodyHash: sharedHash },
        },
        {
          index: 1,
          requestId: "req-2",
          url: "https://api.example.com/data",
          method: "GET",
          headers: {},
          requestHash: "hash-1",
          occurrenceIndex: 1,
          timestamp: 2000,
          response: { status: 200, headers: {}, body: sharedBody, bodyHash: sharedHash },
        },
      ],
    };

    // When built
    const archive = buildCapsule(input);

    // Then only one body file is stored (deduplication)
    const networkFiles = Array.from(archive.files.keys()).filter((k) => k.startsWith("network/"));
    expect(networkFiles).toHaveLength(1);

    // And both entries reference the same path
    const entries = archive.manifest.networkTranscript.entries;
    expect(entries[0]!.response!.body).toBe(entries[1]!.response!.body);
  });

  it("shouldComputeCorrectMetrics", () => {
    // Given two steps and two network entries (one with error, one without response)
    const input = makeMinimalInput();
    input.steps = makeSteps(2);
    input.artifacts = makeArtifacts(2);
    input.networkTranscript = {
      orderingPolicy: "recorded",
      entries: [
        {
          index: 0,
          requestId: "req-1",
          url: "https://example.com/",
          method: "GET",
          headers: {},
          requestHash: "h1",
          occurrenceIndex: 0,
          timestamp: 0,
          // no response, no error → unsupported
        },
        {
          index: 1,
          requestId: "req-2",
          url: "https://example.com/fail",
          method: "GET",
          headers: {},
          requestHash: "h2",
          occurrenceIndex: 0,
          timestamp: 1,
          error: { errorText: "net::ERR_CONNECTION_REFUSED", canceled: false },
        },
      ],
    };

    // When built
    const { manifest } = buildCapsule(input);

    // Then metrics reflect the input
    expect(manifest.metrics.totalSteps).toBe(2);
    expect(manifest.metrics.totalNetworkRequests).toBe(2);
    expect(manifest.metrics.unsupportedRequestCount).toBe(1);
    expect(manifest.metrics.capsuleSizeBytes).toBeGreaterThan(0);
  });

  it("shouldIncludeOptionalTraceSegmentWhenProvided", () => {
    // Given a step artifact that includes a trace segment
    const input = makeMinimalInput();
    input.artifacts = new Map([
      [
        0,
        {
          domSnapshot: domContent,
          accessibilityYaml: a11yContent,
          screenshot: screenshotBytes,
          traceSegment: JSON.stringify({ trace: "data" }),
        },
      ],
    ]);

    // When built
    const archive = buildCapsule(input);

    // Then the trace file is present
    expect(archive.files.has("traces/0.json")).toBe(true);
  });

  it("shouldComputeFinalSizeThatMatchesActualFileContents", () => {
    // Given a minimal input
    const input = makeMinimalInput();

    // When built
    const archive = buildCapsule(input);

    // Then capsuleSizeBytes matches the sum of all buffer sizes
    let expectedSize = 0;
    for (const buf of archive.files.values()) {
      expectedSize += buf.byteLength;
    }
    expect(archive.manifest.metrics.capsuleSizeBytes).toBe(expectedSize);
  });
});

// ---------------------------------------------------------------------------
// serializeCapsuleArchive / deserializeCapsuleArchive
// ---------------------------------------------------------------------------

describe("serializeCapsuleArchive / deserializeCapsuleArchive", () => {
  it("shouldRoundTripManifestAndFiles", () => {
    // Given a built archive
    const archive = buildCapsule(makeMinimalInput());

    // When serialized then deserialized
    const blob = serializeCapsuleArchive(archive);
    const restored = deserializeCapsuleArchive(blob);

    // Then manifest is identical
    expect(restored.manifest.id).toBe(archive.manifest.id);
    expect(restored.manifest.version).toBe("1.0.0");
  });

  it("shouldPreserveAllFileBuffers", () => {
    // Given a built archive with known content
    const archive = buildCapsule(makeMinimalInput());

    // When round-tripped
    const restored = deserializeCapsuleArchive(serializeCapsuleArchive(archive));

    // Then every file is present and byte-identical
    for (const [path, buf] of archive.files) {
      expect(restored.files.has(path)).toBe(true);
      expect(restored.files.get(path)!.toString("base64")).toBe(buf.toString("base64"));
    }
  });

  it("shouldThrowWhenCapsulejsonIsMissingFromBlob", () => {
    // Given a blob that encodes files without capsule.json
    const obj: Record<string, string> = {
      "snapshots/0/dom.json": Buffer.from("{}").toString("base64"),
    };
    const malformed = Buffer.from(JSON.stringify(obj)).toString("base64");

    // When deserialized
    // Then it throws with a clear message
    expect(() => deserializeCapsuleArchive(malformed)).toThrow("capsule.json not found in archive");
  });
});

// ---------------------------------------------------------------------------
// validateCapsule
// ---------------------------------------------------------------------------

describe("validateCapsule", () => {
  it("shouldReturnValidForAWellFormedArchive", () => {
    // Given a well-formed archive
    const archive = buildCapsule(makeMinimalInput());

    // When validated
    const result = validateCapsule(archive);

    // Then it is valid with no errors
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("shouldReturnErrorWhenManifestFailsSchemaValidation", () => {
    // Given an archive whose manifest has been corrupted (version wrong)
    const archive = buildCapsule(makeMinimalInput());
    (archive.manifest as Record<string, unknown>)["version"] = "2.0.0";

    // When validated
    const result = validateCapsule(archive);

    // Then it is invalid
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("shouldReturnErrorForNonMonotonicStepIndices", () => {
    // Given an archive where step indices are out of order
    const archive = buildCapsule(makeMinimalInput());
    // Manually set step index to 5 instead of 0
    archive.manifest.steps[0]!.index = 5;

    // When validated
    const result = validateCapsule(archive);

    // Then there is an error about step index
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("steps[0].index"))).toBe(true);
  });

  it("shouldWarnWhenNetworkEntryHasNeitherResponseNorError", () => {
    // Given an archive with a network entry that has no response and no error
    const input = makeMinimalInput();
    input.networkTranscript = {
      orderingPolicy: "recorded",
      entries: [
        {
          index: 0,
          requestId: "req-1",
          url: "https://example.com/ws",
          method: "GET",
          headers: {},
          requestHash: "h1",
          occurrenceIndex: 0,
          timestamp: 0,
          // deliberately no response or error
        },
      ],
    };
    const archive = buildCapsule(input);

    // When validated
    const result = validateCapsule(archive);

    // Then there is a warning (not an error) about the missing response/error
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.path.includes("networkTranscript.entries[0]"))).toBe(true);
  });

  it("shouldReturnErrorWhenEnvironmentMissesBrowserBuild", () => {
    // Given an archive whose environment lacks browserBuild
    const archive = buildCapsule(makeMinimalInput());
    (archive.manifest.environment as Record<string, unknown>)["browserBuild"] = "";

    // When validated
    const result = validateCapsule(archive);

    // Then there is an error for the missing field
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "environment.browserBuild")).toBe(true);
  });

  it("shouldReturnErrorWhenEnvironmentMissesUserAgent", () => {
    // Given an archive whose environment lacks userAgent
    const archive = buildCapsule(makeMinimalInput());
    (archive.manifest.environment as Record<string, unknown>)["userAgent"] = "";

    // When validated
    const result = validateCapsule(archive);

    // Then there is an error for the missing field
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "environment.userAgent")).toBe(true);
  });

  it("shouldReturnErrorWhenArtifactFileIsMissingFromArchive", () => {
    // Given an archive where a step references a file not stored in the archive
    const archive = buildCapsule(makeMinimalInput());
    // Point the step's domSnapshot to a non-existent path
    archive.manifest.steps[0]!.artifacts.domSnapshot = "snapshots/0/nonexistent.json";

    // When validated
    const result = validateCapsule(archive);

    // Then there is an error referencing the missing file
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent.json"))).toBe(true);
  });

  it("shouldReturnErrorOnBodyHashMismatch", () => {
    // Given a network entry whose stored body does not match the declared bodyHash
    const realBody = Buffer.from("real-body-content");
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const input = makeMinimalInput();
    input.networkTranscript = {
      orderingPolicy: "recorded",
      entries: [
        {
          index: 0,
          requestId: "req-1",
          url: "https://example.com/api",
          method: "GET",
          headers: {},
          requestHash: "h1",
          occurrenceIndex: 0,
          timestamp: 0,
          response: {
            status: 200,
            headers: {},
            body: realBody.toString("base64"),
            bodyHash: wrongHash,
          },
        },
      ],
    };
    const archive = buildCapsule(input);

    // When validated
    const result = validateCapsule(archive);

    // Then there is an error about hash mismatch
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Hash mismatch"))).toBe(true);
  });

  it("shouldWarnWhenUnsupportedStateIsEmpty", () => {
    // Given an archive whose initialState has an empty unsupportedState
    const input = makeMinimalInput();
    input.initialState = { ...validInitialState, unsupportedState: [] };
    const archive = buildCapsule(input);

    // When validated
    const result = validateCapsule(archive);

    // Then there is a warning about unsupportedState
    expect(result.warnings.some((w) => w.path === "initialState.unsupportedState")).toBe(true);
  });

  it("shouldAcceptValidBodyHashWhenItMatchesStoredContent", () => {
    // Given a network entry whose body hash is correct
    const body = Buffer.from("correct-body");
    const correctHash = createHash("sha256").update(body).digest("hex");
    const input = makeMinimalInput();
    input.networkTranscript = {
      orderingPolicy: "recorded",
      entries: [
        {
          index: 0,
          requestId: "req-1",
          url: "https://example.com/api",
          method: "GET",
          headers: {},
          requestHash: "h1",
          occurrenceIndex: 0,
          timestamp: 0,
          response: {
            status: 200,
            headers: {},
            body: body.toString("base64"),
            bodyHash: correctHash,
          },
        },
      ],
    };
    const archive = buildCapsule(input);

    // When validated
    const result = validateCapsule(archive);

    // Then no hash errors
    expect(result.errors.filter((e) => e.message.includes("Hash mismatch"))).toHaveLength(0);
  });
});
