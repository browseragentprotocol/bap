/**
 * bap sessions — List active sessions
 *
 * Sessions are managed via the -s=<name> global flag.
 * Each session maps to a BAP browser context.
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { register } from "./registry.js";

async function sessionsCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const result = await client.listContexts();

  console.log("### Sessions");
  if (result.contexts && result.contexts.length > 0) {
    for (const ctx of result.contexts) {
      console.log(`  ${ctx.id} (${ctx.pageCount} pages)`);
    }
  } else {
    console.log("  No active sessions");
  }
}

register("sessions", sessionsCommand);
