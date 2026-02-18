/**
 * bap check <selector> — Check a checkbox
 * bap uncheck <selector> — Uncheck a checkbox
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
import { register } from "./registry.js";

async function checkCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  if (!selectorStr) {
    console.error("Usage: bap check <selector>");
    process.exit(1);
  }

  const selector = parseSelector(selectorStr);
  await client.check(selector);
  await postActionSummary(client);
}

async function uncheckCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  if (!selectorStr) {
    console.error("Usage: bap uncheck <selector>");
    process.exit(1);
  }

  const selector = parseSelector(selectorStr);
  await client.uncheck(selector);
  await postActionSummary(client);
}

register("check", checkCommand);
register("uncheck", uncheckCommand);
