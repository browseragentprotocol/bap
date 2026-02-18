/**
 * bap eval "js" — Evaluate JavaScript in the page
 *
 * NOTE: The BAP protocol does not support arbitrary JS evaluation
 * (by design — security boundary). This command falls back to
 * `client.content("text")` for basic content retrieval.
 * For structured data extraction, use `bap extract` instead.
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { register } from "./registry.js";

async function evalCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const js = args[0];
  if (!js) {
    console.error('Usage: bap eval "<javascript>"');
    console.error("");
    console.error("Note: BAP does not support arbitrary JS evaluation.");
    console.error("For structured data, use: bap extract --fields=\"title,price\"");
    process.exit(1);
  }

  // BAP protocol doesn't support eval — retrieve page content instead
  console.error("Warning: BAP does not support arbitrary JS evaluation.");
  console.error("Falling back to page content retrieval.");
  console.error("For structured data, use: bap extract --fields=\"title,price\"");
  console.error("");

  try {
    const result = await client.content("text");
    console.log(result.content);
  } catch (error) {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

register("eval", evalCommand);
