/**
 * bap back — Go back in history
 * bap forward — Go forward in history
 * bap reload — Reload the page
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary } from "../output/formatter.js";
import { register } from "./registry.js";

async function backCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  await client.goBack();
  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title);
}

async function forwardCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  await client.goForward();
  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title);
}

async function reloadCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  await client.reload();
  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title);
}

register("back", backCommand);
register("forward", forwardCommand);
register("reload", reloadCommand);
