/**
 * bap handoff [reason] - Hand a session to a human for CAPTCHA/MFA/manual work
 * bap resume           - Resume automation after manual intervention
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type {
  BrowserStateResult,
  Page,
  StorageGetSessionStorageResult,
  StorageState,
} from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { printHandoffSummary, printObserveDeltaResult } from "../output/formatter.js";
import {
  clearPendingHandoff,
  getCliSessionId,
  loadPendingHandoff,
  savePendingHandoff,
  type PendingHandoff,
} from "../session-state.js";
import { launchBrowserWithFallback, resolveProfile } from "../server/manager.js";
import { register } from "./registry.js";

interface RestorableState {
  page: Page;
  storageState: StorageState;
  sessionStorage?: {
    origin: string;
    items: StorageGetSessionStorageResult["items"];
  };
}

const HANDOFF_TTL_SECONDS = 24 * 60 * 60;

function buildResumeCommand(flags: GlobalFlags): string {
  const parts = ["bap"];

  if (flags.port !== 9222) {
    parts.push(`-p=${flags.port}`);
  }

  if (flags.session) {
    parts.push(`-s=${flags.session}`);
  }

  parts.push("resume");
  return parts.join(" ");
}

function pickActivePage(pages: Page[], activePage: string): Page {
  const usablePages = pages.filter((page) => page.url && page.url !== "about:blank");
  if (usablePages.length === 0) {
    return pages[0]!;
  }

  return usablePages.find((page) => page.id === activePage) ?? usablePages[0]!;
}

function browserStateToCliBrowser(state: BrowserStateResult, fallback: string): string {
  if (state.channel === "chrome") {
    return "chrome";
  }
  if (state.channel === "msedge") {
    return "edge";
  }
  return state.browser ?? fallback;
}

async function getLiveLaunchOptions(client: BAPClient, flags: GlobalFlags): Promise<PendingHandoff["launch"]> {
  const state = await client.getBrowserState();
  return {
    browser: browserStateToCliBrowser(state, flags.browser),
    headless: state.headless ?? flags.headless,
    ...(state.userDataDir ? { userDataDir: state.userDataDir } : {}),
  };
}

function stripSessionStorage(storageState: StorageState): StorageState {
  return {
    cookies: storageState.cookies,
    origins: storageState.origins.map((origin) => ({
      origin: origin.origin,
      localStorage: origin.localStorage,
    })),
  };
}

async function getActivePage(client: BAPClient): Promise<Page> {
  const { pages, activePage } = await client.listPages();
  if (pages.length === 0) {
    throw new Error("No pages open. Start a session with `bap goto <url>` first.");
  }

  const page = pickActivePage(pages, activePage);

  await client.activatePage(page.id);
  return page;
}

async function captureRestorableState(
  client: BAPClient
): Promise<RestorableState> {
  const page = await getActivePage(client);
  const storageState = await client.getStorageState();
  const sessionStorage = page.url && page.url !== "about:blank"
    ? await client.getSessionStorage(page.id)
    : { items: [] };

  return {
    page,
    storageState,
    ...(sessionStorage.origin
      ? {
          sessionStorage: {
            origin: sessionStorage.origin,
            items: sessionStorage.items,
          },
        }
      : {}),
  };
}

async function relaunchBrowserAtCurrentPage(
  client: BAPClient,
  launch: PendingHandoff["launch"],
  targetHeadless: boolean,
  state: RestorableState
): Promise<void> {
  await client.closeBrowser();
  await launchBrowserWithFallback(client, {
    browser: launch.browser,
    headless: targetHeadless,
    ...(launch.userDataDir ? { userDataDir: launch.userDataDir } : {}),
  });

  const restorableStorage = stripSessionStorage(state.storageState);
  if (restorableStorage.cookies.length > 0 || restorableStorage.origins.length > 0) {
    await client.setStorageState(restorableStorage);
  }

  await client.createPage({
    viewport: state.page.viewport,
    ...(state.page.url && state.page.url !== "about:blank" ? { url: state.page.url } : {}),
    ...(state.sessionStorage && state.sessionStorage.items.length > 0
      ? { sessionStorage: state.sessionStorage }
      : {}),
  });
}

export async function handoffCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient
): Promise<void> {
  const sessionId = getCliSessionId(flags);
  const reason = args.join(" ").trim() || undefined;
  const resumeCommand = buildResumeCommand(flags);
  const launch = await getLiveLaunchOptions(client, flags);
  const pendingHandoff: PendingHandoff = {
    version: 2,
    sessionId,
    port: flags.port,
    launch,
    createdAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };

  if (launch.headless) {
    const restorableState = await captureRestorableState(client);
    await client.setHandoffMode(true, { ttlSeconds: HANDOFF_TTL_SECONDS });
    savePendingHandoff(pendingHandoff);
    await relaunchBrowserAtCurrentPage(client, launch, false, restorableState);
    printHandoffSummary({
      page: { url: restorableState.page.url, title: restorableState.page.title },
      reason,
      outcome: "Browser reopened in visible mode for manual intervention.",
      preserved: [
        "cookies, local storage, current tab session storage, active URL, and viewport",
      ],
      warnings: [
        "unsaved form text, other tabs, and in-memory page state may still need to be recreated after the mode switch",
      ],
      next: [`When ready, run: \`${resumeCommand}\``],
    });
    return;
  }

  const page = await getActivePage(client);
  await client.setHandoffMode(true, { ttlSeconds: HANDOFF_TTL_SECONDS });
  savePendingHandoff(pendingHandoff);
  printHandoffSummary({
    page: { url: page.url, title: page.title },
    reason,
    outcome: "Browser is already visible. Solve the blocker in the open window.",
    preserved: ["exact page state stays live while the session is handed off"],
    next: [`When ready, run: \`${resumeCommand}\``],
  });
}

export async function resumeCommand(
  _args: string[],
  flags: GlobalFlags,
  client: BAPClient
): Promise<void> {
  const sessionId = getCliSessionId(flags);
  const pending = loadPendingHandoff(sessionId, flags.port, resolveProfile);

  if (!pending) {
    throw new Error(`No pending handoff found for session ${sessionId}. Run \`bap handoff\` first.`);
  }

  if (pending.port !== flags.port) {
    throw new Error(`Pending handoff belongs to --port=${pending.port}. Re-run resume with that port.`);
  }

  if (pending.launch.headless) {
    const restorableState = await captureRestorableState(client);
    await relaunchBrowserAtCurrentPage(client, pending.launch, true, restorableState);
  } else {
    await getActivePage(client);
  }

  const observation = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: true,
    maxElements: flags.max ?? 50,
    incremental: true,
    ...(flags.tier
      ? { responseTier: flags.tier as "full" | "interactive" | "minimal" }
      : {}),
  });

  await client.setHandoffMode(false);
  clearPendingHandoff(sessionId, pending.port);
  printObserveDeltaResult(observation);
}

register("handoff", handoffCommand);
register("resume", resumeCommand);
