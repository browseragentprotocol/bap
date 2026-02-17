/**
 * bap goto <url> — Navigate to URL
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary } from "../output/formatter.js";
import { register } from "./registry.js";

async function gotoCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const url = args[0];
  if (!url) {
    console.error("Usage: bap goto <url>");
    process.exit(1);
  }

  const result = await client.navigate(url);
  printPageSummary(result.url);
}

register("goto", gotoCommand);
