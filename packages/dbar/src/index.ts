// DBAR — Deterministic Browser Agent Runtime
// Capsule types
export {
  type DeterminismCapsule,
  type EnvironmentDescriptor,
  type SeedPackage,
  type InitialState,
  type NetworkEntry,
  type NetworkTranscript,
  type CapsuleStep,
  type StepAction,
  type StepObservables,
  type StepArtifacts,
  type CapsuleMetrics,
  type CapsuleCookie,
  type Divergence,
  type DivergenceType,
  type StepSnapshot,
  type ReplayResult,
  type ValidationResult,
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
} from "./capsule/types.js";

// Time virtualizer
export { TimeVirtualizer } from "./time/virtualizer.js";
export {
  type TimePolicy,
  type TimeVirtualizerOptions,
  type QuiescenceState,
} from "./time/types.js";

// Network types and utilities
export {
  type MutableNetworkTranscript,
  type MutableNetworkEntry,
  createTranscript,
  hashRequest,
  hashBody,
  hashBuffer,
  redactHeaders,
  isSSE,
  isWebSocket,
} from "./network/types.js";
export { NetworkRecorder, type NetworkRecorderOptions } from "./network/recorder.js";
export { NetworkReplayer, type NetworkReplayerOptions } from "./network/replayer.js";

// Snapshot modules
export { captureDOMSnapshot, type DOMSnapshotResult } from "./snapshot/dom.js";
export {
  captureAccessibilitySnapshot,
  type AccessibilitySnapshotResult,
} from "./snapshot/accessibility.js";
export {
  captureScreenshot,
  type ScreenshotResult,
  type ScreenshotOptions,
} from "./snapshot/screenshot.js";
export { captureStorageState, restoreStorageState } from "./snapshot/state.js";

// Capsule builder and validator
export {
  buildCapsule,
  serializeCapsuleArchive,
  deserializeCapsuleArchive,
  type CapsuleBuildInput,
  type CapsuleArchive,
} from "./capsule/builder.js";
export { validateCapsule } from "./capsule/validator.js";

// Telemetry
export { TraceTimeline, type TraceEntry } from "./telemetry/trace.js";

// Coordinator
export { Coordinator, type CaptureOptions, type CaptureSessionState } from "./coordinator.js";

// SDK
export { DBAR, CaptureSession, type ReplayOptions } from "./sdk.js";
