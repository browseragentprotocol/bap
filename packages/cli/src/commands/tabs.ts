/**
 * bap tabs — List open tabs
 * bap tab-new [url] — Open new tab
 * bap tab-select <index> — Switch to tab
 * bap tab-close [index] — Close tab
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary, printTabList } from "../output/formatter.js";
import { connectIfServerRunning } from "../server/manager.js";
import { register } from "./registry.js";

export async function tabsCommand(
  _args: string[],
  flags: GlobalFlags,
  _client: BAPClient,
): Promise<void> {
  const client = await connectIfServerRunning({
    port: flags.port,
    host: flags.host,
    timeout: flags.timeout,
  });

  try {
    if (!client) {
      printTabList([], "");
      return;
    }

    const result = await client.listPages();
    printTabList(result.pages, result.activePage);
  } finally {
    await client?.close();
  }
}

export async function tabNewCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const url = args[0];
  const page = await client.createPage(url ? { url } : {});

  if (url) {
    printPageSummary(page.url, page.title);
  } else {
    console.log(`### New tab opened: ${page.id}`);
  }
}

export async function tabSelectCommand(
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
  printPageSummary(page.url ?? "about:blank", page.title);
}

export async function tabCloseCommand(
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
    console.log(`### Closed tab ${index}: ${page.url ?? "about:blank"}`);
  } else {
    await client.closePage();
    console.log("### Closed current tab");
  }
}

register("tabs", tabsCommand);
register("tab-new", tabNewCommand);
register("tab-select", tabSelectCommand);
register("tab-close", tabCloseCommand);
