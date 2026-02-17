/**
 * @fileoverview CLI output formatting
 *
 * Concise, AI-agent-friendly output format:
 * ### Page
 * - URL: https://example.com/dashboard
 * - Title: Dashboard
 * ### Snapshot
 * [Snapshot](.bap/snapshot-2026-02-16T19-30-42.yml)
 */

import type {
  AgentActResult,
  AgentObserveResult,
  AgentExtractResult,
  ObserveChanges,
} from "@browseragentprotocol/protocol";

/**
 * Print page summary with optional snapshot/screenshot links.
 */
export function printPageSummary(
  url?: string,
  title?: string,
  snapshotPath?: string,
  screenshotPath?: string,
): void {
  console.log("### Page");
  if (url) console.log(`- URL: ${url}`);
  if (title) console.log(`- Title: ${title}`);

  if (snapshotPath) {
    console.log("### Snapshot");
    console.log(`[Snapshot](${snapshotPath})`);
  }

  if (screenshotPath) {
    console.log("### Screenshot");
    console.log(`[Screenshot](${screenshotPath})`);
  }
}

/**
 * Print act result summary.
 */
export function printActResult(
  result: AgentActResult,
  url?: string,
  title?: string,
  snapshotPath?: string,
): void {
  console.log("### Page");
  if (url) console.log(`- URL: ${url}`);
  if (title) console.log(`- Title: ${title}`);

  console.log(`### Result: ${result.completed}/${result.total} steps completed`);

  if (!result.success && result.results) {
    const failed = result.results.find((r) => !r.success);
    if (failed?.error) {
      console.log(`### Error: ${failed.error.message ?? "Unknown error"}`);
    }
  }

  if (snapshotPath) {
    console.log("### Snapshot");
    console.log(`[Snapshot](${snapshotPath})`);
  }
}

/**
 * Print observe result — compact list of interactive elements.
 */
export function printObserveResult(result: AgentObserveResult): void {
  if (result.metadata) {
    console.log("### Page");
    console.log(`- URL: ${result.metadata.url}`);
    console.log(`- Title: ${result.metadata.title}`);
  }

  if (result.interactiveElements && result.interactiveElements.length > 0) {
    console.log(`### Interactive Elements (${result.interactiveElements.length})`);
    for (const el of result.interactiveElements) {
      const ref = el.ref ?? "";
      const name = el.name ? ` "${el.name}"` : "";
      const value = el.value ? ` [${el.value}]` : "";
      console.log(`  ${ref} ${el.role}${name}${value}`);
    }
  } else {
    console.log("### No interactive elements found");
  }
}

/**
 * Print extraction result.
 */
export function printExtractionResult(
  result: AgentExtractResult,
  filepath: string,
): void {
  console.log("### Extraction");
  console.log(`[Data](${filepath})`);

  if (result.data) {
    const preview = JSON.stringify(result.data);
    if (preview.length <= 200) {
      console.log(`\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``);
    } else {
      console.log(`(${preview.length} bytes — see file for full data)`);
    }
  }
}

/**
 * Print a snapshot summary (used by snapshot/snapshot commands).
 */
export function printSnapshotSummary(snapshotPath: string): void {
  console.log("### Snapshot");
  console.log(`[Snapshot](${snapshotPath})`);
}

/**
 * Print incremental observation changes (--diff mode).
 */
export function printObserveChanges(changes: ObserveChanges): void {
  console.log("### Changes");

  if (changes.added.length > 0) {
    console.log(`  + ${changes.added.length} added`);
    for (const el of changes.added) {
      const name = el.name ? ` "${el.name}"` : "";
      console.log(`    + ${el.ref} ${el.role}${name}`);
    }
  }

  if (changes.updated.length > 0) {
    console.log(`  ~ ${changes.updated.length} updated`);
    for (const el of changes.updated) {
      const name = el.name ? ` "${el.name}"` : "";
      console.log(`    ~ ${el.ref} ${el.role}${name}`);
    }
  }

  if (changes.removed.length > 0) {
    console.log(`  - ${changes.removed.length} removed`);
    for (const ref of changes.removed) {
      console.log(`    - ${ref}`);
    }
  }

  if (changes.added.length === 0 && changes.updated.length === 0 && changes.removed.length === 0) {
    console.log("  (no changes)");
  }
}
