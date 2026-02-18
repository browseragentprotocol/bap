/**
 * bap click <selector> — Click an element
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
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
  await postActionSummary(client);
}

register("click", clickCommand);
