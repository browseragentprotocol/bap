/**
 * @fileoverview Browser launch/close handlers
 * @module @browseragentprotocol/server-playwright/handlers/browser
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import * as path from "path";
import {
  type BrowserLaunchParams,
  type BrowserLaunchResult,
  ErrorCodes,
} from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";
import { getStealthScripts, getStealthLaunchArgs } from "../stealth/evasions.js";

export async function handleBrowserLaunch(
  state: ClientState,
  params: BrowserLaunchParams,
  ctx: HandlerContext
): Promise<BrowserLaunchResult> {
  if (state.context || state.browser) {
    await handleBrowserClose(state, ctx);
  }

  const browserType = params.browser ?? ctx.options.defaultBrowser;
  const launcher = ctx.getBrowserType(browserType);

  let sanitizedArgs = ctx.sanitizeBrowserArgs(params.args);

  // Stealth mode: add anti-detection launch args
  if (params.stealth) {
    const stealthArgs = getStealthLaunchArgs();
    sanitizedArgs = [...sanitizedArgs, ...stealthArgs.filter((a) => !sanitizedArgs.includes(a))];
  }

  // SECURITY: Validate downloads path to prevent path traversal attacks
  let validatedDownloadsPath: string | undefined = undefined;
  if (params.downloadsPath) {
    const allowedDownloadDirs =
      process.env.BAP_ALLOWED_DOWNLOAD_DIRS?.split(",").filter(Boolean) || [];

    let normalizedPath = path.resolve(params.downloadsPath);

    try {
      if (fs.existsSync(normalizedPath)) {
        normalizedPath = fs.realpathSync(normalizedPath);
      }
    } catch {
      ctx.logSecurity("PATH_RESOLUTION_FAILED", { path: params.downloadsPath });
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Invalid downloads path: ${params.downloadsPath}`
      );
    }

    if (params.downloadsPath.includes("..") || params.downloadsPath.includes("//")) {
      ctx.logSecurity("PATH_TRAVERSAL_ATTEMPT", { path: params.downloadsPath });
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Invalid downloads path: path traversal detected`
      );
    }

    if (allowedDownloadDirs.length > 0) {
      const isAllowed = allowedDownloadDirs.some((dir) => {
        const normalizedDir = path.resolve(dir);
        return (
          normalizedPath === normalizedDir || normalizedPath.startsWith(normalizedDir + path.sep)
        );
      });
      if (!isAllowed) {
        ctx.logSecurity("PATH_NOT_ALLOWED", {
          path: normalizedPath,
          allowed: allowedDownloadDirs,
        });
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Downloads path not allowed: ${params.downloadsPath}. Allowed directories: ${allowedDownloadDirs.join(", ")}`
        );
      }
    }

    const blockedPaths = [
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/var",
      "/root",
      "/home",
      "/tmp",
      "/sys",
      "/proc",
      "/dev",
      "C:\\Windows",
      "C:\\Program Files",
      "C:\\Program Files (x86)",
      "C:\\Users",
    ];
    const isBlocked = blockedPaths.some((blocked) =>
      normalizedPath.toLowerCase().startsWith(blocked.toLowerCase())
    );
    if (isBlocked) {
      ctx.logSecurity("PATH_BLOCKED", { path: normalizedPath });
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Downloads path not allowed: ${params.downloadsPath}`
      );
    }

    validatedDownloadsPath = normalizedPath;
  }

  const channel = params.channel ?? ctx.options.defaultChannel;
  const headless = params.headless ?? ctx.options.headless;
  const contextId = `ctx-${randomUUID().slice(0, 8)}`;

  let defaultContext: import("playwright").BrowserContext;
  let version: string;

  if (params.cdpUrl) {
    // CDP attach mode: connect to a running browser via Chrome DevTools Protocol
    // Chromium only — Firefox/WebKit don't support CDP
    if (browserType !== "chromium") {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        "CDP attach is only supported for Chromium browsers",
        false,
        undefined,
        undefined,
        "Use browser: 'chromium' with cdpUrl, or launch Firefox/WebKit without cdpUrl"
      );
    }

    const { chromium: chromiumBrowser } = await import("playwright");
    state.browser = await chromiumBrowser.connectOverCDP(params.cdpUrl);
    state.isPersistent = false;
    state.browserOwnership = "borrowed";

    // Use existing contexts/pages from the live browser
    const contexts = state.browser.contexts();
    if (contexts.length > 0) {
      defaultContext = contexts[0]!;
    } else {
      defaultContext = await state.browser.newContext({ deviceScaleFactor: 1 });
    }
    version = state.browser.version();

    // Enumerate existing pages
    const existingPages = defaultContext.pages();
    for (const page of existingPages) {
      const pageId = `page-${randomUUID()}`;
      state.pages.set(pageId, page);
      state.pageToContext.set(pageId, contextId);
      ctx.setupPageListeners(page, pageId);
      if (!state.activePage) {
        state.activePage = pageId;
      }
    }
  } else if (params.userDataDir) {
    try {
      defaultContext = await launcher.launchPersistentContext(params.userDataDir, {
        headless,
        channel,
        args: sanitizedArgs.length > 0 ? sanitizedArgs : undefined,
        deviceScaleFactor: 1,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("SingletonLock") ||
        message.includes("lock") ||
        message.includes("already running")
      ) {
        throw new BAPServerError(
          ErrorCodes.ActionFailed,
          "Chrome is already using that profile. Close Chrome, choose a dedicated `--profile <dir>`, or use `--no-profile` for a fresh browser."
        );
      }
      throw error;
    }

    state.browser = null;
    state.isPersistent = true;
    state.browserOwnership = "persistent";
    version = "";
  } else {
    state.browser = await launcher.launch({
      headless,
      channel,
      args: sanitizedArgs.length > 0 ? sanitizedArgs : undefined,
      proxy: params.proxy,
      downloadsPath: validatedDownloadsPath,
    });

    defaultContext = await state.browser.newContext({
      deviceScaleFactor: 1,
    });
    version = state.browser.version();
    state.isPersistent = false;
    state.browserOwnership = "owned";
  }

  state.context = defaultContext;
  state.defaultContextId = contextId;

  // Stealth mode: inject evasion scripts into the context
  // Scripts run before any page JavaScript via addInitScript()
  if (params.stealth) {
    const scripts = getStealthScripts();
    for (const script of scripts) {
      await defaultContext.addInitScript(script);
    }
    ctx.log("Stealth mode enabled", { evasions: scripts.length });
  }

  state.contexts.set(contextId, {
    context: defaultContext,
    created: Date.now(),
  });

  defaultContext.on("close", () => {
    state.contexts.delete(contextId);
    if (state.defaultContextId === contextId) {
      state.defaultContextId = null;
      state.context = null;
    }
  });

  return {
    browserId: `browser-${randomUUID()}`,
    version,
    defaultContext: contextId,
  };
}

export async function handleBrowserClose(state: ClientState, _ctx: HandlerContext): Promise<void> {
  if (state.browserOwnership === "borrowed" && state.browser) {
    // CDP attach: drop reference only, never close the external browser
    // Playwright's connectOverCDP browser has no disconnect() — just release the reference
  } else if (state.isPersistent && state.context) {
    await state.context.close();
  } else if (state.browser) {
    await state.browser.close();
  }

  state.browser = null;
  state.isPersistent = false;
  state.browserOwnership = "owned";
  state.context = null;
  state.contexts.clear();
  state.defaultContextId = null;
  state.pages.clear();
  state.pageToContext.clear();
  state.activePage = null;
  state.elementRegistries.clear();
  state.frameContexts.clear();
  for (const stream of state.activeStreams.values()) {
    stream.cancelled = true;
  }
  state.activeStreams.clear();
  for (const pending of state.pendingApprovals.values()) {
    clearTimeout(pending.timeoutHandle);
    pending.reject(new BAPServerError(ErrorCodes.TargetClosed, "Browser closed"));
  }
  state.pendingApprovals.clear();
  state.sessionApprovals.clear();
}
