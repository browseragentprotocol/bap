/**
 * bap close — Close browser
 * bap close-all — Close browser and kill server
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { ServerManager } from "../server/manager.js";
import { register } from "./registry.js";

async function closeCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  await client.closeBrowser();
  console.log("### Browser closed");
}

async function closeAllCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  try {
    await client.closeBrowser();
  } catch {
    // Browser may already be closed
  }

  ServerManager.killServer();
  console.log("### Browser and server closed");
}

register("close", closeCommand);
register("close-all", closeAllCommand);
