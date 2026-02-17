/**
 * bap click <selector> — Click an element
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { printPageSummary } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function clickCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  if (!selectorStr) {
    console.error("Usage: bap click <selector>");
    process.exit(1);
  }

  const selector = parseSelector(selectorStr);
  await client.click(selector);

  // Take snapshot after action
  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title, snapshotPath);
}

register("click", clickCommand);
