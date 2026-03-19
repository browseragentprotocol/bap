/**
 * bap scroll [direction] [--pixels=N] [selector] — Scroll the page or an element
 *
 * Examples:
 *   bap scroll down
 *   bap scroll down --pixels=500
 *   bap scroll up --pixels=1000
 *   bap scroll role:listbox:"Results"    (scroll element into view)
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { postActionSummary } from "./helpers.js";
import { register } from "./registry.js";

const DIRECTIONS = new Set(["up", "down", "left", "right"]);

async function scrollCommand(args: string[], flags: GlobalFlags, client: BAPClient): Promise<void> {
  const first = args[0];

  // If first arg is a direction, use page scroll
  if (first && DIRECTIONS.has(first)) {
    const direction = first as "up" | "down" | "left" | "right";
    const pixels = flags.pixels ?? 300;
    await client.scroll({ direction, amount: pixels });
    await postActionSummary(client);
    return;
  }

  // If first arg is a selector, scroll element into view
  if (first) {
    const selector = parseSelector(first);
    await client.scroll(selector);
    await postActionSummary(client);
    return;
  }

  // No args — scroll down by default
  await client.scroll({ direction: "down", amount: 300 });
  await postActionSummary(client);
}

register("scroll", scrollCommand);
