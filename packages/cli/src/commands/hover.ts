/**
 * bap hover <selector> — Hover over an element
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
import { register } from "./registry.js";

async function hoverCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  if (!selectorStr) {
    console.error("Usage: bap hover <selector>");
    process.exit(1);
  }

  const selector = parseSelector(selectorStr);
  await client.hover(selector);
  await postActionSummary(client);
}

register("hover", hoverCommand);
