import { randomUUID } from "node:crypto";
import type {
  DeterminismCapsule,
  EnvironmentDescriptor,
  SeedPackage,
  InitialState,
  CapsuleStep,
  CapsuleMetrics,
  NetworkEntry,
} from "./types.js";

/**
 * Input to {@link buildCapsule}. Collects all data captured during a browser
 * session into one structure so the builder can assemble the immutable capsule.
 */
export interface CapsuleBuildInput {
  environment: EnvironmentDescriptor;
  seeds: SeedPackage;
  initialState: InitialState;
  networkTranscript: { orderingPolicy: "creation" | "recorded"; entries: any[] };
  steps: CapsuleStep[];
  /**
   * Per-step artifact content keyed by step index. The builder writes each
   * artifact into the archive as a separate file and stores the path in the
   * manifest rather than inlining the bytes.
   */
  artifacts: Map<
    number,
    {
      domSnapshot: string;
      accessibilityYaml: string;
      screenshot: Buffer;
      traceSegment?: string;
    }
  >;
  /** `Date.now()` value recorded at the start of the capture session, used to
   * compute `captureOverheadMs` in the final metrics. */
  captureStartTime: number;
}

/**
 * A fully assembled capsule: the JSON manifest plus all referenced artifact
 * files stored as an in-memory directory (path → bytes).
 *
 * The directory layout is:
 * - `capsule.json`                — the {@link DeterminismCapsule} manifest
 * - `network/<sha256>`            — deduplicated response bodies (raw bytes)
 * - `snapshots/<n>/dom.json`      — serialized DOM snapshot for step n
 * - `snapshots/<n>/accessibility.json` — accessibility tree for step n
 * - `snapshots/<n>/screenshot.png`    — screenshot for step n
 * - `traces/<n>.json`            — optional Playwright trace segment for step n
 */
export interface CapsuleArchive {
  manifest: DeterminismCapsule;
  files: Map<string, Buffer>;
}

/**
 * Assemble a {@link CapsuleArchive} from raw capture-session data.
 *
 * The builder:
 * 1. Deduplicates network response bodies by their SHA-256 hash so identical
 *    responses are stored only once.
 * 2. Writes every step artifact into the `files` map under predictable paths.
 * 3. Computes aggregate {@link CapsuleMetrics} including the final archive size.
 * 4. Serializes the manifest to `capsule.json` and updates `capsuleSizeBytes`
 *    after all files are known.
 *
 * @param input - Capture session data produced by the DBAR recorder.
 * @returns A {@link CapsuleArchive} ready for validation and transport.
 *
 * @example
 * ```ts
 * const archive = buildCapsule(input);
 * const result = validateCapsule(archive);
 * if (result.valid) {
 *   const blob = serializeCapsuleArchive(archive);
 * }
 * ```
 */
export function buildCapsule(input: CapsuleBuildInput): CapsuleArchive {
  const files = new Map<string, Buffer>();
  const now = new Date().toISOString();
  const id = randomUUID();

  // Deduplicate response bodies: the same resource fetched multiple times
  // shares one stored file, referenced by its SHA-256 hash.
  const bodyHashToPath = new Map<string, string>();

  const entries: NetworkEntry[] = input.networkTranscript.entries.map((entry, i) => {
    const networkEntry: NetworkEntry = {
      index: entry.index ?? i,
      requestId: entry.requestId,
      url: entry.url,
      method: entry.method,
      headers: entry.headers ?? {},
      postData: entry.postData,
      requestHash: entry.requestHash,
      occurrenceIndex: entry.occurrenceIndex ?? 0,
      timestamp: entry.timestamp ?? 0,
    };

    if (entry.response) {
      const bodyHash: string = entry.response.bodyHash;
      if (!bodyHashToPath.has(bodyHash)) {
        const filePath = `network/${bodyHash}`;
        bodyHashToPath.set(bodyHash, filePath);
        files.set(filePath, Buffer.from(entry.response.body, "base64"));
      }
      networkEntry.response = {
        status: entry.response.status,
        headers: entry.response.headers ?? {},
        // Store the archive path so the replayer can fetch the body without
        // bloating the manifest with inline base64.
        body: bodyHashToPath.get(bodyHash)!,
        bodyHash,
      };
    }

    if (entry.error) {
      networkEntry.error = {
        errorText: entry.error.errorText,
        canceled: entry.error.canceled ?? false,
        blockedReason: entry.error.blockedReason,
      };
    }

    return networkEntry;
  });

  // Write artifact files for each recorded step.
  for (const [stepIndex, artifact] of input.artifacts) {
    files.set(`snapshots/${stepIndex}/dom.json`, Buffer.from(artifact.domSnapshot, "utf-8"));
    files.set(
      `snapshots/${stepIndex}/accessibility.json`,
      Buffer.from(artifact.accessibilityYaml, "utf-8")
    );
    files.set(`snapshots/${stepIndex}/screenshot.png`, artifact.screenshot);
    if (artifact.traceSegment !== undefined) {
      files.set(`traces/${stepIndex}.json`, Buffer.from(artifact.traceSegment, "utf-8"));
    }
  }

  // Count entries that have neither a response nor an error — these represent
  // request types the recorder does not support (e.g. WebSocket upgrades).
  let unsupportedRequestCount = 0;
  for (const entry of entries) {
    if (!entry.response && !entry.error) {
      unsupportedRequestCount++;
    }
  }

  const metrics: CapsuleMetrics = {
    totalSteps: input.steps.length,
    totalNetworkRequests: entries.length,
    unsupportedRequestCount,
    captureOverheadMs: Date.now() - input.captureStartTime,
    // Placeholder; updated below once we know the manifest size.
    capsuleSizeBytes: 0,
  };

  const manifest: DeterminismCapsule = {
    version: "1.0.0",
    capsuleProfile: "replay",
    id,
    createdAt: now,
    environment: input.environment,
    seeds: input.seeds,
    initialState: input.initialState,
    networkTranscript: {
      orderingPolicy: input.networkTranscript.orderingPolicy,
      entries,
    },
    steps: input.steps,
    metrics,
  };

  // Compute the size of all non-manifest files first.
  let nonManifestSize = 0;
  for (const buf of files.values()) {
    nonManifestSize += buf.byteLength;
  }

  // Serialize once with a placeholder of 0 to get an approximate manifest
  // buffer, then re-serialize with the correct total. The digit count of
  // capsuleSizeBytes may change between iterations (e.g. "0" → "1471"), so
  // we loop until the size stabilises — in practice this converges in at most
  // two iterations because the number only grows by a few digits.
  let manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
  for (let i = 0; i < 3; i++) {
    const candidate = nonManifestSize + manifestBuffer.byteLength;
    manifest.metrics.capsuleSizeBytes = candidate;
    const next = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
    if (next.byteLength === manifestBuffer.byteLength) {
      manifestBuffer = next;
      break;
    }
    manifestBuffer = next;
  }

  files.set("capsule.json", manifestBuffer);

  return { manifest, files };
}

/**
 * Encode a {@link CapsuleArchive} to a single base64 string for protocol
 * transport (e.g. as a JSON-RPC result field).
 *
 * The encoding is: JSON object (path → base64 file content) → UTF-8 bytes →
 * base64.  This avoids a ZIP dependency while staying within JSON-safe bounds.
 *
 * @param archive - The archive produced by {@link buildCapsule}.
 * @returns A base64 string that can be decoded with {@link deserializeCapsuleArchive}.
 */
export function serializeCapsuleArchive(archive: CapsuleArchive): string {
  const obj: Record<string, string> = {};
  for (const [path, buffer] of archive.files) {
    obj[path] = buffer.toString("base64");
  }
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

/**
 * Decode a base64 blob produced by {@link serializeCapsuleArchive} back into a
 * {@link CapsuleArchive}.
 *
 * @param base64 - The encoded archive string.
 * @returns The restored archive with manifest and file map.
 * @throws {Error} If `capsule.json` is absent from the decoded blob.
 */
export function deserializeCapsuleArchive(base64: string): CapsuleArchive {
  const json = JSON.parse(Buffer.from(base64, "base64").toString("utf-8")) as Record<
    string,
    string
  >;

  const files = new Map<string, Buffer>();
  for (const [path, data] of Object.entries(json)) {
    files.set(path, Buffer.from(data, "base64"));
  }

  const manifestBuffer = files.get("capsule.json");
  if (!manifestBuffer) {
    throw new Error(
      "capsule.json not found in archive — the blob may be corrupt or was not produced by serializeCapsuleArchive"
    );
  }

  const manifest = JSON.parse(manifestBuffer.toString("utf-8")) as DeterminismCapsule;
  return { manifest, files };
}
