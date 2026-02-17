/**
 * bap open [url] — Open browser, optionally navigate to URL
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary } from "../output/formatter.js";
import { register } from "./registry.js";

/** Map user-facing browser names to Playwright browser types */
const BROWSER_MAP: Record<string, "chromium" | "firefox" | "webkit"> = {
  chrome: "chromium",
  chromium: "chromium",
  firefox: "firefox",
  webkit: "webkit",
  edge: "chromium",
};

/** Map user-facing browser names to Playwright channels */
const CHANNEL_MAP: Record<string, string> = {
  chrome: "chrome",
  edge: "msedge",
};

async function openCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const browser = BROWSER_MAP[flags.browser] ?? "chromium";
  const channel = CHANNEL_MAP[flags.browser];

  // Launch browser
  await client.launch({
    browser,
    channel,
    headless: flags.headless,
  });

  // Create a page
  await client.createPage();

  // Navigate if URL provided
  const url = args[0];
  if (url) {
    const result = await client.navigate(url);
    printPageSummary(result.url);
  } else {
    console.log("### Browser opened");
    console.log("Use `bap goto <url>` to navigate.");
  }
}

register("open", openCommand);
