/**
 * bap press <key> — Press a keyboard key
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { postActionSummary } from "./helpers.js";
import { register } from "./registry.js";

async function pressCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const key = args[0];
  if (!key) {
    console.error("Usage: bap press <key>");
    process.exit(1);
  }

  await client.press(key);
  await postActionSummary(client);
}

register("press", pressCommand);
