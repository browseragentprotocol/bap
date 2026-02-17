/**
 * bap type <text> — Type text into focused element
 * bap type <selector> <text> — Type text into specific element
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { printPageSummary } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function typeCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  if (args.length === 0) {
    console.error("Usage: bap type <text> OR bap type <selector> <text>");
    process.exit(1);
  }

  if (args.length === 1) {
    // Type into focused element — use a text selector pointing to active element
    // Since the client requires a selector, we'll use the body as a fallback
    const selector = parseSelector("css:body");
    await client.type(selector, args[0]!);
  } else {
    const selector = parseSelector(args[0]!);
    await client.type(selector, args[1]!);
  }

  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title, snapshotPath);
}

register("type", typeCommand);
