/**
 * @fileoverview CLI output formatting
 *
 * Three output modes:
 * - "agent" (default): Concise markdown for AI agents
 * - "json": Raw JSON for piping/scripting
 * - "pretty": Human-readable with colors (auto-detected for TTY)
 */

import { pc } from "@browseragentprotocol/logger";
import type {
  AgentActResult,
  AgentObserveResult,
  AgentExtractResult,
  ObserveChanges,
} from "@browseragentprotocol/protocol";

export type OutputFormat = "pretty" | "json" | "agent";

let currentFormat: OutputFormat = "agent";

/** Set the output format. Call before any print functions. */
export function setOutputFormat(format: OutputFormat): void {
  currentFormat = format;
}

/** Get the current output format. */
export function getOutputFormat(): OutputFormat {
  return currentFormat;
}

/**
 * Print any result as JSON (used when --format=json).
 * Collects all output into a single JSON object.
 */
export function printJson(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print page summary with optional snapshot/screenshot links.
 */
export function printPageSummary(
  url?: string,
  title?: string,
  snapshotPath?: string,
  screenshotPath?: string
): void {
  if (currentFormat === "json") {
    printJson({ type: "page", url, title, snapshotPath, screenshotPath });
    return;
  }

  if (currentFormat === "pretty") {
    if (url) console.log(`${pc.cyan("URL")}   ${url}`);
    if (title) console.log(`${pc.cyan("Title")} ${title}`);
    if (snapshotPath) console.log(`${pc.dim("Snapshot:")} ${snapshotPath}`);
    if (screenshotPath) console.log(`${pc.dim("Screenshot:")} ${screenshotPath}`);
    return;
  }

  // agent format (default)
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
  snapshotPath?: string
): void {
  if (currentFormat === "json") {
    printJson({ type: "act", url, title, snapshotPath, ...result });
    return;
  }

  if (currentFormat === "pretty") {
    if (url) console.log(`${pc.cyan("URL")}   ${url}`);
    const status = result.success ? pc.green("OK") : pc.red("FAILED");
    console.log(`${status} ${result.completed}/${result.total} steps completed`);
    if (!result.success && result.results) {
      const failed = result.results.find((r) => !r.success);
      if (failed?.error) {
        console.log(`${pc.red("Error:")} ${failed.error.message ?? "Unknown error"}`);
      }
    }
    if (snapshotPath) console.log(`${pc.dim("Snapshot:")} ${snapshotPath}`);
    return;
  }

  // agent format (default)
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
  if (currentFormat === "json") {
    printJson({ type: "observe", ...result });
    return;
  }

  if (currentFormat === "pretty") {
    if (result.metadata) {
      console.log(`${pc.cyan("URL")}   ${result.metadata.url}`);
      console.log(`${pc.cyan("Title")} ${result.metadata.title}`);
    }
    if (result.interactiveElements && result.interactiveElements.length > 0) {
      console.log(`\n${pc.bold(`Interactive Elements (${result.interactiveElements.length})`)}`);
      for (const el of result.interactiveElements) {
        const ref = pc.yellow(el.ref ?? "");
        const role = pc.dim(el.role);
        const name = el.name ? ` ${pc.green(`"${el.name}"`)}` : "";
        const value = el.value ? ` ${pc.dim(`[${el.value}]`)}` : "";
        console.log(`  ${ref} ${role}${name}${value}`);
      }
    } else {
      console.log(pc.dim("No interactive elements found"));
    }
    return;
  }

  // agent format (default)
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
export function printExtractionResult(result: AgentExtractResult, filepath: string): void {
  if (currentFormat === "json") {
    printJson({ type: "extract", filepath, ...result });
    return;
  }

  if (currentFormat === "pretty") {
    console.log(`${pc.cyan("Extracted")} → ${filepath}`);
    if (result.data) {
      const preview = JSON.stringify(result.data);
      if (preview.length <= 200) {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.log(pc.dim(`(${preview.length} bytes — see file)`));
      }
    }
    return;
  }

  // agent format (default)
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
  if (currentFormat === "json") {
    printJson({ type: "snapshot", path: snapshotPath });
    return;
  }
  if (currentFormat === "pretty") {
    console.log(`${pc.dim("Snapshot:")} ${snapshotPath}`);
    return;
  }
  console.log("### Snapshot");
  console.log(`[Snapshot](${snapshotPath})`);
}

/**
 * Print incremental observation changes (--diff mode).
 */
export function printObserveChanges(changes: ObserveChanges): void {
  if (currentFormat === "json") {
    printJson({
      type: "changes",
      added: changes.added.length,
      updated: changes.updated.length,
      removed: changes.removed.length,
      details: changes,
    });
    return;
  }

  if (currentFormat === "pretty") {
    if (changes.added.length > 0) {
      console.log(`${pc.green(`+ ${changes.added.length} added`)}`);
      for (const el of changes.added) {
        console.log(
          `  ${pc.green("+")} ${pc.yellow(el.ref)} ${el.role}${el.name ? ` "${el.name}"` : ""}`
        );
      }
    }
    if (changes.updated.length > 0) {
      console.log(`${pc.yellow(`~ ${changes.updated.length} updated`)}`);
      for (const el of changes.updated) {
        console.log(
          `  ${pc.yellow("~")} ${pc.yellow(el.ref)} ${el.role}${el.name ? ` "${el.name}"` : ""}`
        );
      }
    }
    if (changes.removed.length > 0) {
      console.log(`${pc.red(`- ${changes.removed.length} removed`)}`);
      for (const ref of changes.removed) {
        console.log(`  ${pc.red("-")} ${ref}`);
      }
    }
    if (
      changes.added.length === 0 &&
      changes.updated.length === 0 &&
      changes.removed.length === 0
    ) {
      console.log(pc.dim("(no changes)"));
    }
    return;
  }

  // agent format
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
