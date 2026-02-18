/**
 * bap select <selector> <value> — Select a dropdown option
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
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
  await postActionSummary(client);
}

register("select", selectCommand);
