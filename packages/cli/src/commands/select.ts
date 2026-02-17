/**
 * bap select <selector> <value> — Select a dropdown option
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { printPageSummary } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function selectCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  const value = args[1];
  if (!selectorStr || !value) {
    console.error("Usage: bap select <selector> <value>");
    process.exit(1);
  }

  const selector = parseSelector(selectorStr);
  await client.select(selector, value);

  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title, snapshotPath);
}

register("select", selectCommand);
