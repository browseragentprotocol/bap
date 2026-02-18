/**
 * bap fill <selector> <value> — Fill an input field
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
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
  await postActionSummary(client);
}

register("fill", fillCommand);
