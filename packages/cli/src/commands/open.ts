/**
 * bap open [url] — Open browser, optionally navigate to URL
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { AgentObserveResult } from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { printObserveResult, printPageSummary } from "../output/formatter.js";
import { launchBrowserWithFallback } from "../server/manager.js";
import { register } from "./registry.js";

function pickExistingPage(
  pages: Array<{ id: string; url: string; title?: string }>,
  activePage: string,
): { id: string; url: string; title?: string } | null {
  if (pages.length === 0) {
    return null;
  }

  return pages.find((page) => page.id === activePage) ?? pages[0]!;
}

async function navigateAndPrint(
  url: string,
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  if (flags.observe) {
    const result = await client.navigate(url, {
      timeout: flags.timeout,
      observe: {
        includeMetadata: true,
        includeInteractiveElements: true,
        maxElements: flags.max ?? 50,
        responseTier: (flags.tier as "full" | "interactive" | "minimal") ?? undefined,
      },
    });

    const observation = (result as Record<string, unknown>).observation as AgentObserveResult | undefined;
    if (observation) {
      printObserveResult(observation);
    } else {
      printPageSummary(result.url);
    }
    return;
  }

  const result = await client.navigate(url, { timeout: flags.timeout });
  printPageSummary(result.url);
}

export async function openCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const { pages, activePage } = await client.listPages();
  const url = args[0];

  if (pages.length > 0) {
    const targetPage = activePage && activePage.length > 0
      ? activePage
      : pages[0]!.id;
    await client.activatePage(targetPage);

    if (url) {
      await navigateAndPrint(url, flags, client);
      return;
    }

    const page = pages.find((candidate) => candidate.id === targetPage) ?? pages[0]!;
    printPageSummary(page.url, page.title);
    return;
  }

  // Launch browser
  await launchBrowserWithFallback(client, {
    browser: flags.browser,
    headless: flags.headless,
    profile: flags.profile,
  });

  const launched = await client.listPages();
  const launchPage = pickExistingPage(launched.pages, launched.activePage);

  if (launchPage) {
    await client.activatePage(launchPage.id);

    if (url) {
      await navigateAndPrint(url, flags, client);
    } else {
      console.log("### Browser opened");
      console.log("Use `bap goto <url>` to navigate.");
    }
    return;
  }

  await client.createPage();

  // Navigate if URL provided
  if (url) {
    await navigateAndPrint(url, flags, client);
  } else {
    console.log("### Browser opened");
    console.log("Use `bap goto <url>` to navigate.");
  }
}

register("open", openCommand);
