/**
 * bap tabs — List open tabs
 * bap tab-new [url] — Open new tab
 * bap tab-select <index> — Switch to tab
 * bap tab-close [index] — Close tab
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary } from "../output/formatter.js";
import { register } from "./registry.js";

async function tabsCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const result = await client.listPages();

  console.log("### Tabs");
  if (result.pages.length > 0) {
    for (let i = 0; i < result.pages.length; i++) {
      const page = result.pages[i]!;
      const active = page.id === result.activePage ? " *" : "";
      console.log(`  [${i}] ${page.url ?? "about:blank"}${active}`);
    }
  } else {
    console.log("  No open tabs");
  }
}

async function tabNewCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const page = await client.createPage();
  const url = args[0];
  if (url) {
    const result = await client.navigate(url, { pageId: page.id });
    printPageSummary(result.url);
  } else {
    console.log(`### New tab opened: ${page.id}`);
  }
}

async function tabSelectCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const indexStr = args[0];
  if (!indexStr) {
    console.error("Usage: bap tab-select <index>");
    process.exit(1);
  }

  const index = parseInt(indexStr, 10);
  const result = await client.listPages();

  if (index < 0 || index >= result.pages.length) {
    console.error(`Tab index ${index} out of range (0-${result.pages.length - 1})`);
    process.exit(1);
  }

  const page = result.pages[index]!;
  await client.activatePage(page.id);
  console.log(`### Switched to tab ${index}: ${page.url ?? "about:blank"}`);
}

async function tabCloseCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const indexStr = args[0];

  if (indexStr) {
    const index = parseInt(indexStr, 10);
    const result = await client.listPages();
    if (index < 0 || index >= result.pages.length) {
      console.error(`Tab index ${index} out of range (0-${result.pages.length - 1})`);
      process.exit(1);
    }
    const page = result.pages[index]!;
    await client.closePage(page.id);
    console.log(`### Closed tab ${index}`);
  } else {
    await client.closePage();
    console.log("### Closed current tab");
  }
}

register("tabs", tabsCommand);
register("tab-new", tabNewCommand);
register("tab-select", tabSelectCommand);
register("tab-close", tabCloseCommand);
