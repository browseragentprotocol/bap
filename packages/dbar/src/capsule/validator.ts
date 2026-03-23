import { createHash } from "node:crypto";
import { DeterminismCapsuleSchema, type ValidationResult } from "./types.js";
import type { CapsuleArchive } from "./builder.js";

/**
 * Validate a {@link CapsuleArchive} for structural integrity and internal
 * consistency.
 *
 * Checks performed (in order):
 * 1. Schema conformance — the manifest must satisfy {@link DeterminismCapsuleSchema}.
 * 2. capsuleProfile — must be `"replay"`.
 * 3. Step ordering — indices must be contiguous starting at 0 with no gaps.
 * 4. Network completeness — entries without a response or error generate a
 *    warning (not an error) so replay can still proceed with degraded coverage.
 * 5. Environment completeness — `browserBuild` and `userAgent` are required.
 * 6. Artifact file existence — every path referenced in `steps[n].artifacts`
 *    must exist in `archive.files`.
 * 7. Hash integrity — for entries whose body file is present in the archive,
 *    the stored SHA-256 must match the re-computed hash.
 * 8. unsupportedState — warns when the list is empty, because the recorder
 *    should always declare which state types it does not capture.
 *
 * @param archive - The capsule archive to validate.
 * @returns A {@link ValidationResult} where `valid` is `true` only when there
 *   are zero errors. Warnings are advisory and do not affect `valid`.
 *
 * @example
 * ```ts
 * const result = validateCapsule(archive);
 * if (!result.valid) {
 *   console.error("Capsule rejected:", result.errors);
 * }
 * ```
 */
export function validateCapsule(archive: CapsuleArchive): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];

  // 1. Schema conformance — fail fast if the manifest doesn't parse; further
  //    checks rely on the typed structure being sound.
  const parseResult = DeterminismCapsuleSchema.safeParse(archive.manifest);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({ path: issue.path.join("."), message: issue.message });
    }
    return { valid: false, errors, warnings };
  }

  const capsule = archive.manifest;

  // 2. capsuleProfile
  if (capsule.capsuleProfile !== "replay") {
    errors.push({
      path: "capsuleProfile",
      message: `Expected "replay", got "${capsule.capsuleProfile}"`,
    });
  }

  // 3. Step ordering — monotonic indices starting at 0, no gaps.
  for (let i = 0; i < capsule.steps.length; i++) {
    const step = capsule.steps[i]!;
    if (step.index !== i) {
      errors.push({
        path: `steps[${i}].index`,
        message: `Expected index ${i}, got ${step.index}`,
      });
    }
  }

  // 4. Network completeness — missing response and error means the recorder
  //    could not capture the exchange (e.g. WebSocket, QUIC). This is a warning
  //    rather than an error because replay can still proceed for supported traffic.
  for (let i = 0; i < capsule.networkTranscript.entries.length; i++) {
    const entry = capsule.networkTranscript.entries[i]!;
    if (!entry.response && !entry.error) {
      warnings.push({
        path: `networkTranscript.entries[${i}]`,
        message: `Entry for ${entry.method} ${entry.url} has neither response nor error`,
      });
    }
  }

  // 5. Environment completeness — these fields are mandatory for deterministic
  //    replay: the browser build pins the rendering engine, and userAgent is
  //    overridden on every page load.
  const env = capsule.environment;
  if (!env.browserBuild) {
    errors.push({
      path: "environment.browserBuild",
      message:
        "browserBuild is required — specify the exact browser build string (e.g. chromium/1140)",
    });
  }
  if (!env.userAgent) {
    errors.push({
      path: "environment.userAgent",
      message: "userAgent is required — must match the value used during capture",
    });
  }

  // 6. Artifact file existence — detect manifest/archive divergence early so
  //    the replayer doesn't discover missing files mid-run.
  for (const step of capsule.steps) {
    for (const [key, filePath] of Object.entries(step.artifacts)) {
      if (filePath && !archive.files.has(filePath)) {
        errors.push({
          path: `steps[${step.index}].artifacts.${key}`,
          message: `Referenced file "${filePath}" not found in archive`,
        });
      }
    }
  }

  // 7. Hash integrity — verify body files stored in the archive match their
  //    declared SHA-256 hashes. Only checked when the body file is present;
  //    missing body files are caught by the artifact existence check above.
  for (const entry of capsule.networkTranscript.entries) {
    if (entry.response) {
      const storedBody = archive.files.get(entry.response.body);
      if (storedBody !== undefined) {
        const computedHash = createHash("sha256").update(storedBody).digest("hex");
        if (computedHash !== entry.response.bodyHash) {
          errors.push({
            path: `networkTranscript.entries[${entry.index}].response.bodyHash`,
            message: `Hash mismatch: expected ${entry.response.bodyHash}, got ${computedHash}`,
          });
        }
      }
    }
  }

  // 8. unsupportedState — the recorder should always enumerate state types it
  //    cannot capture so the replayer knows not to expect them.
  if (
    !capsule.initialState.unsupportedState ||
    capsule.initialState.unsupportedState.length === 0
  ) {
    warnings.push({
      path: "initialState.unsupportedState",
      message:
        "unsupportedState is empty — should list unsupported state types (sessionStorage, indexedDB, serviceWorkers)",
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
