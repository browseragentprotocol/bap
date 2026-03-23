import { describe, it, expect } from "vitest";
import {
  DeterminismCapsuleSchema,
  EnvironmentDescriptorSchema,
  SeedPackageSchema,
  InitialStateSchema,
  NetworkEntrySchema,
  NetworkTranscriptSchema,
  CapsuleStepSchema,
  StepActionSchema,
  StepObservablesSchema,
  StepArtifactsSchema,
  CapsuleMetricsSchema,
  CapsuleCookieSchema,
  DivergenceSchema,
  DivergenceTypeSchema,
  StepSnapshotSchema,
  ReplayResultSchema,
  ValidationResultSchema,
} from "../capsule/types.js";

// Shared fixtures
const validViewport = { width: 1280, height: 720 };

const validEnvironment = {
  browserBuild: "chromium/1140",
  browserFlags: ["--no-sandbox"],
  locale: "en-US",
  timezone: "America/Los_Angeles",
  viewport: validViewport,
  deviceScaleFactor: 1,
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  offline: false,
};

const validSeeds = {
  initialTime: 1700000000000,
};

const validCookie = {
  name: "session",
  value: "abc123",
  domain: "example.com",
  path: "/",
  expires: 1800000000,
  httpOnly: true,
  secure: true,
  sameSite: "Lax" as const,
};

const validInitialState = {
  url: "https://example.com",
  cookies: [validCookie],
  localStorage: [
    {
      origin: "https://example.com",
      entries: [{ name: "theme", value: "dark" }],
    },
  ],
  unsupportedState: [],
};

const validNetworkEntry = {
  index: 0,
  requestId: "req-001",
  url: "https://example.com/api/data",
  method: "GET",
  headers: { accept: "application/json" },
  requestHash: "sha256-abc",
  occurrenceIndex: 0,
  timestamp: 1700000001000,
};

const validNetworkTranscript = {
  orderingPolicy: "recorded" as const,
  entries: [validNetworkEntry],
};

const validObservables = {
  domSnapshotHash: "sha256-dom",
  accessibilityHash: "sha256-a11y",
  screenshotHash: "sha256-screenshot",
  networkDigest: "sha256-network",
};

const validArtifacts = {
  domSnapshot: "steps/0/dom.html",
  accessibilityYaml: "steps/0/a11y.yaml",
  screenshot: "steps/0/screenshot.png",
};

const validStep = {
  index: 0,
  observables: validObservables,
  artifacts: validArtifacts,
};

const validMetrics = {
  totalSteps: 1,
  totalNetworkRequests: 1,
  unsupportedRequestCount: 0,
  captureOverheadMs: 50,
  capsuleSizeBytes: 1024,
};

const validCapsule = {
  version: "1.0.0" as const,
  capsuleProfile: "replay" as const,
  id: "550e8400-e29b-41d4-a716-446655440000",
  createdAt: "2024-01-01T00:00:00.000Z",
  environment: validEnvironment,
  seeds: validSeeds,
  initialState: validInitialState,
  networkTranscript: validNetworkTranscript,
  steps: [validStep],
  metrics: validMetrics,
};

describe("EnvironmentDescriptorSchema", () => {
  it("shouldAcceptMinimalValidEnvironment", () => {
    // Given a minimal valid environment descriptor
    // When parsed
    const result = EnvironmentDescriptorSchema.parse(validEnvironment);
    // Then it returns the descriptor unchanged
    expect(result.browserBuild).toBe("chromium/1140");
    expect(result.locale).toBe("en-US");
    expect(result.offline).toBe(false);
  });

  it("shouldAcceptFullEnvironmentWithOptionalFields", () => {
    // Given a fully-populated environment descriptor
    const full = {
      ...validEnvironment,
      osImageHash: "sha256-os",
      geolocation: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      extraHTTPHeaders: { "x-custom": "header" },
      permissions: ["geolocation"],
      proxy: { server: "http://proxy:8080", bypass: "localhost" },
    };
    // When parsed
    const result = EnvironmentDescriptorSchema.parse(full);
    // Then optional fields are present
    expect(result.osImageHash).toBe("sha256-os");
    expect(result.geolocation?.latitude).toBe(37.7749);
    expect(result.proxy?.server).toBe("http://proxy:8080");
  });

  it("shouldRejectNonPositiveViewportDimensions", () => {
    // Given a viewport with zero width
    const invalid = { ...validEnvironment, viewport: { width: 0, height: 720 } };
    // When parsed
    // Then it throws
    expect(() => EnvironmentDescriptorSchema.parse(invalid)).toThrow();
  });

  it("shouldRejectMissingRequiredFields", () => {
    // Given an environment missing browserBuild
    const { browserBuild: _omit, ...incomplete } = validEnvironment;
    // When parsed
    // Then it throws
    expect(() => EnvironmentDescriptorSchema.parse(incomplete)).toThrow();
  });
});

describe("SeedPackageSchema", () => {
  it("shouldAcceptMinimalSeedWithInitialTimeOnly", () => {
    // Given a seed with only initialTime
    // When parsed
    const result = SeedPackageSchema.parse({ initialTime: 1700000000000 });
    // Then rngSeed and orderingSeed are absent
    expect(result.initialTime).toBe(1700000000000);
    expect(result.rngSeed).toBeUndefined();
    expect(result.orderingSeed).toBeUndefined();
  });

  it("shouldAcceptFullSeedWithAllFields", () => {
    // Given a fully populated seed
    const full = { initialTime: 1700000000000, rngSeed: "rng-hex", orderingSeed: "order-hex" };
    // When parsed
    const result = SeedPackageSchema.parse(full);
    // Then all fields are present
    expect(result.rngSeed).toBe("rng-hex");
    expect(result.orderingSeed).toBe("order-hex");
  });

  it("shouldRejectMissingInitialTime", () => {
    // Given a seed without initialTime
    // When parsed
    // Then it throws
    expect(() => SeedPackageSchema.parse({})).toThrow();
  });
});

describe("CapsuleCookieSchema", () => {
  it("shouldAcceptValidCookie", () => {
    // Given a valid cookie
    // When parsed
    const result = CapsuleCookieSchema.parse(validCookie);
    // Then sameSite is preserved
    expect(result.sameSite).toBe("Lax");
  });

  it("shouldAcceptAllSameSiteValues", () => {
    // Given each valid sameSite value
    for (const sameSite of ["Strict", "Lax", "None"] as const) {
      const result = CapsuleCookieSchema.parse({ ...validCookie, sameSite });
      expect(result.sameSite).toBe(sameSite);
    }
  });

  it("shouldRejectInvalidSameSite", () => {
    // Given a cookie with invalid sameSite
    // When parsed
    // Then it throws
    expect(() => CapsuleCookieSchema.parse({ ...validCookie, sameSite: "invalid" })).toThrow();
  });
});

describe("InitialStateSchema", () => {
  it("shouldAcceptValidInitialState", () => {
    // Given a valid initial state
    // When parsed
    const result = InitialStateSchema.parse(validInitialState);
    // Then cookies and localStorage are preserved
    expect(result.cookies).toHaveLength(1);
    expect(result.localStorage).toHaveLength(1);
  });

  it("shouldAcceptEmptyCollections", () => {
    // Given an initial state with empty arrays
    const empty = {
      url: "https://example.com",
      cookies: [],
      localStorage: [],
      unsupportedState: [],
    };
    // When parsed
    const result = InitialStateSchema.parse(empty);
    // Then it succeeds with empty arrays
    expect(result.cookies).toHaveLength(0);
    expect(result.localStorage).toHaveLength(0);
  });

  it("shouldRejectMissingUrl", () => {
    // Given initial state without url
    const { url: _omit, ...noUrl } = validInitialState;
    // When parsed
    // Then it throws
    expect(() => InitialStateSchema.parse(noUrl)).toThrow();
  });
});

describe("NetworkEntrySchema", () => {
  it("shouldAcceptMinimalNetworkEntry", () => {
    // Given a minimal network entry without response or error
    // When parsed
    const result = NetworkEntrySchema.parse(validNetworkEntry);
    // Then response and error are absent
    expect(result.response).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it("shouldAcceptNetworkEntryWithResponse", () => {
    // Given a network entry with a response
    const withResponse = {
      ...validNetworkEntry,
      response: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: "base64encodeddata==",
        bodyHash: "sha256-body",
      },
    };
    // When parsed
    const result = NetworkEntrySchema.parse(withResponse);
    // Then response fields are present
    expect(result.response?.status).toBe(200);
    expect(result.response?.bodyHash).toBe("sha256-body");
  });

  it("shouldAcceptNetworkEntryWithError", () => {
    // Given a network entry with an error
    const withError = {
      ...validNetworkEntry,
      error: { errorText: "net::ERR_CONNECTION_REFUSED", canceled: false },
    };
    // When parsed
    const result = NetworkEntrySchema.parse(withError);
    // Then error fields are present
    expect(result.error?.errorText).toBe("net::ERR_CONNECTION_REFUSED");
    expect(result.error?.canceled).toBe(false);
  });

  it("shouldRejectNegativeIndex", () => {
    // Given an entry with a negative index
    const invalid = { ...validNetworkEntry, index: -1 };
    // When parsed
    // Then it throws
    expect(() => NetworkEntrySchema.parse(invalid)).toThrow();
  });
});

describe("NetworkTranscriptSchema", () => {
  it("shouldAcceptBothOrderingPolicies", () => {
    // Given each valid ordering policy
    for (const orderingPolicy of ["creation", "recorded"] as const) {
      const result = NetworkTranscriptSchema.parse({ ...validNetworkTranscript, orderingPolicy });
      expect(result.orderingPolicy).toBe(orderingPolicy);
    }
  });

  it("shouldRejectInvalidOrderingPolicy", () => {
    // Given an invalid ordering policy
    // When parsed
    // Then it throws
    expect(() =>
      NetworkTranscriptSchema.parse({ ...validNetworkTranscript, orderingPolicy: "random" })
    ).toThrow();
  });
});

describe("CapsuleStepSchema", () => {
  it("shouldAcceptMinimalStep", () => {
    // Given a step with only required fields
    // When parsed
    const result = CapsuleStepSchema.parse(validStep);
    // Then optional fields are absent
    expect(result.label).toBeUndefined();
    expect(result.action).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });

  it("shouldAcceptStepWithAllFields", () => {
    // Given a fully-populated step
    const full = {
      ...validStep,
      label: "Click submit button",
      action: { type: "click", selector: "button[type=submit]" },
      warnings: ["slow network"],
    };
    // When parsed
    const result = CapsuleStepSchema.parse(full);
    // Then all optional fields are present
    expect(result.label).toBe("Click submit button");
    expect(result.action?.type).toBe("click");
    expect(result.warnings).toHaveLength(1);
  });

  it("shouldRejectNegativeStepIndex", () => {
    // Given a step with a negative index
    const invalid = { ...validStep, index: -1 };
    // When parsed
    // Then it throws
    expect(() => CapsuleStepSchema.parse(invalid)).toThrow();
  });
});

describe("DeterminismCapsuleSchema", () => {
  it("shouldAcceptValidCapsule", () => {
    // Given a valid capsule
    // When parsed
    const result = DeterminismCapsuleSchema.parse(validCapsule);
    // Then key fields are preserved
    expect(result.version).toBe("1.0.0");
    expect(result.capsuleProfile).toBe("replay");
    expect(result.steps).toHaveLength(1);
  });

  it("shouldRejectInvalidVersion", () => {
    // Given a capsule with wrong version literal
    const invalid = { ...validCapsule, version: "2.0.0" };
    // When parsed
    // Then it throws
    expect(() => DeterminismCapsuleSchema.parse(invalid)).toThrow();
  });

  it("shouldRejectInvalidCapsuleProfile", () => {
    // Given a capsule with wrong profile literal
    const invalid = { ...validCapsule, capsuleProfile: "capture" };
    // When parsed
    // Then it throws
    expect(() => DeterminismCapsuleSchema.parse(invalid)).toThrow();
  });

  it("shouldRejectNonUuidId", () => {
    // Given a capsule with a non-UUID id
    const invalid = { ...validCapsule, id: "not-a-uuid" };
    // When parsed
    // Then it throws
    expect(() => DeterminismCapsuleSchema.parse(invalid)).toThrow();
  });

  it("shouldRejectInvalidDatetimeCreatedAt", () => {
    // Given a capsule with an invalid datetime
    const invalid = { ...validCapsule, createdAt: "2024-01-01" };
    // When parsed
    // Then it throws
    expect(() => DeterminismCapsuleSchema.parse(invalid)).toThrow();
  });
});

describe("DivergenceTypeSchema", () => {
  it("shouldAcceptAllValidDivergenceTypes", () => {
    // Given all valid divergence type values
    const validTypes = [
      "dom_mismatch",
      "accessibility_mismatch",
      "network_digest_mismatch",
      "unmatched_request",
      "unsupported_traffic",
      "quiescence_timeout",
      "cdp_session_lost",
    ] as const;
    // When each is parsed
    for (const type of validTypes) {
      expect(DivergenceTypeSchema.parse(type)).toBe(type);
    }
  });

  it("shouldRejectUnknownDivergenceType", () => {
    // Given an unknown divergence type
    // When parsed
    // Then it throws
    expect(() => DivergenceTypeSchema.parse("screenshot_mismatch")).toThrow();
  });
});

describe("DivergenceSchema", () => {
  it("shouldAcceptMinimalDivergence", () => {
    // Given a divergence with only required fields
    const minimal = { step: 0, type: "dom_mismatch" as const };
    // When parsed
    const result = DivergenceSchema.parse(minimal);
    // Then optional fields are absent
    expect(result.expected).toBeUndefined();
    expect(result.actual).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  it("shouldAcceptFullDivergence", () => {
    // Given a fully-populated divergence
    const full = {
      step: 2,
      type: "network_digest_mismatch" as const,
      expected: "sha256-expected",
      actual: "sha256-actual",
      details: "3 new requests not in transcript",
    };
    // When parsed
    const result = DivergenceSchema.parse(full);
    // Then all fields are present
    expect(result.details).toBe("3 new requests not in transcript");
  });
});

describe("StepSnapshotSchema", () => {
  it("shouldAcceptValidStepSnapshot", () => {
    // Given a valid step snapshot
    const snapshot = {
      index: 0,
      observables: validObservables,
      warnings: [],
      captureMs: 42,
    };
    // When parsed
    const result = StepSnapshotSchema.parse(snapshot);
    // Then captureMs is preserved
    expect(result.captureMs).toBe(42);
    expect(result.warnings).toHaveLength(0);
  });

  it("shouldRejectNegativeCaptureMs", () => {
    // Given a snapshot with negative captureMs
    const invalid = {
      index: 0,
      observables: validObservables,
      warnings: [],
      captureMs: -1,
    };
    // When parsed
    // Then it throws
    expect(() => StepSnapshotSchema.parse(invalid)).toThrow();
  });
});

describe("ReplayResultSchema", () => {
  it("shouldAcceptSuccessfulReplayResult", () => {
    // Given a successful replay result
    const result = {
      success: true,
      replaySuccessRate: 1.0,
      determinismViolationRate: 0.0,
      divergences: [],
      overheadMs: 100,
    };
    // When parsed
    const parsed = ReplayResultSchema.parse(result);
    // Then fields are preserved
    expect(parsed.success).toBe(true);
    expect(parsed.replaySuccessRate).toBe(1.0);
    expect(parsed.timeToDivergence).toBeUndefined();
  });

  it("shouldAcceptFailedReplayResultWithDivergence", () => {
    // Given a failed replay result with divergence info
    const result = {
      success: false,
      replaySuccessRate: 0.5,
      determinismViolationRate: 0.5,
      timeToDivergence: 2,
      divergences: [{ step: 2, type: "dom_mismatch" as const }],
      overheadMs: 200,
    };
    // When parsed
    const parsed = ReplayResultSchema.parse(result);
    // Then divergence info is present
    expect(parsed.timeToDivergence).toBe(2);
    expect(parsed.divergences).toHaveLength(1);
  });

  it("shouldRejectSuccessRateOutOfRange", () => {
    // Given a result with rate > 1
    const invalid = {
      success: true,
      replaySuccessRate: 1.5,
      determinismViolationRate: 0,
      divergences: [],
      overheadMs: 0,
    };
    // When parsed
    // Then it throws
    expect(() => ReplayResultSchema.parse(invalid)).toThrow();
  });
});

describe("ValidationResultSchema", () => {
  it("shouldAcceptValidResult", () => {
    // Given a valid validation result
    const result = {
      valid: true,
      errors: [],
      warnings: [],
    };
    // When parsed
    const parsed = ValidationResultSchema.parse(result);
    // Then valid is true
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toHaveLength(0);
  });

  it("shouldAcceptResultWithErrorsAndWarnings", () => {
    // Given a result with errors and warnings
    const result = {
      valid: false,
      errors: [{ path: "version", message: "must be 1.0.0" }],
      warnings: [{ path: "metrics.capsuleSizeBytes", message: "unusually large" }],
    };
    // When parsed
    const parsed = ValidationResultSchema.parse(result);
    // Then errors and warnings are preserved
    expect(parsed.errors[0]?.message).toBe("must be 1.0.0");
    expect(parsed.warnings[0]?.path).toBe("metrics.capsuleSizeBytes");
  });
});

describe("StepActionSchema", () => {
  it("shouldAcceptMinimalActionWithTypeOnly", () => {
    // Given an action with only the required type field
    // When parsed
    const result = StepActionSchema.parse({ type: "click" });
    // Then optional fields are absent
    expect(result.type).toBe("click");
    expect(result.selector).toBeUndefined();
    expect(result.url).toBeUndefined();
  });
});

describe("StepObservablesSchema", () => {
  it("shouldAcceptValidObservables", () => {
    // Given a complete observables object
    // When parsed
    const result = StepObservablesSchema.parse(validObservables);
    // Then all hashes are preserved
    expect(result.domSnapshotHash).toBe("sha256-dom");
    expect(result.networkDigest).toBe("sha256-network");
  });
});

describe("StepArtifactsSchema", () => {
  it("shouldAcceptArtifactsWithRequiredPathsOnly", () => {
    // Given artifacts without optional traceSegment
    // When parsed
    const result = StepArtifactsSchema.parse(validArtifacts);
    // Then traceSegment is absent
    expect(result.domSnapshot).toBe("steps/0/dom.html");
    expect(result.traceSegment).toBeUndefined();
  });
});

describe("CapsuleMetricsSchema", () => {
  it("shouldAcceptValidMetrics", () => {
    // Given valid metrics
    // When parsed
    const result = CapsuleMetricsSchema.parse(validMetrics);
    // Then all counts are preserved
    expect(result.totalSteps).toBe(1);
    expect(result.unsupportedRequestCount).toBe(0);
  });

  it("shouldRejectNegativeMetricValues", () => {
    // Given metrics with a negative totalSteps
    const invalid = { ...validMetrics, totalSteps: -1 };
    // When parsed
    // Then it throws
    expect(() => CapsuleMetricsSchema.parse(invalid)).toThrow();
  });
});
