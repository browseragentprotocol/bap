/**
 * bap open [url] — Open browser, optionally navigate to URL
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary } from "../output/formatter.js";
import { BROWSER_MAP, CHANNEL_MAP, resolveProfile } from "../server/manager.js";
import { register } from "./registry.js";

async function openCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const browser = BROWSER_MAP[flags.browser] ?? "chromium";
  const channel = CHANNEL_MAP[flags.browser];
  const userDataDir = resolveProfile(flags.profile, flags.browser);

  // Launch browser
  await client.launch({
    browser,
    channel,
    headless: flags.headless,
    ...(userDataDir ? { userDataDir } : {}),
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
