/**
 * bap press <key> — Press a keyboard key
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function pressCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const key = args[0];
  if (!key) {
    console.error("Usage: bap press <key>");
    process.exit(1);
  }

  await client.press(key);

  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title, snapshotPath);
}

register("press", pressCommand);
