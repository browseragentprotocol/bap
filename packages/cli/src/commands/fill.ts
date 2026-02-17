/**
 * bap fill <selector> <value> — Fill an input field
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { printPageSummary } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function fillCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  const value = args[1];
  if (!selectorStr || value === undefined) {
    console.error("Usage: bap fill <selector> <value>");
    process.exit(1);
  }

  const selector = parseSelector(selectorStr);
  await client.fill(selector, value);

  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title, snapshotPath);
}

register("fill", fillCommand);
