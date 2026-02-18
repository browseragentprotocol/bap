/**
 * bap type <text> — Type text into focused element
 * bap type <selector> <text> — Type text into specific element
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
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

  await postActionSummary(client);
}

register("type", typeCommand);
