/**
 * bap snapshot [--file=F] — Save accessibility snapshot (YAML)
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { writeSnapshot } from "../output/filesystem.js";
import { printSnapshotSummary } from "../output/formatter.js";
import { register } from "./registry.js";

async function snapshotCommand(
  _args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const result = await client.ariaSnapshot();

  let snapshotPath: string;
  if (flags.file) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.dirname(flags.file);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(flags.file, result.snapshot, "utf-8");
    snapshotPath = flags.file;
  } else {
    snapshotPath = await writeSnapshot(result.snapshot);
  }

  printSnapshotSummary(snapshotPath);
}

register("snapshot", snapshotCommand);
