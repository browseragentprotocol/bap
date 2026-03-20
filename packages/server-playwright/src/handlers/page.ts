/**
 * @fileoverview Page handlers (create, navigate, reload, goBack, goForward, close, list, activate)
 * @module @browseragentprotocol/server-playwright/handlers/page
 */

import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { BrowserContext } from "playwright";
import {
  type PageCreateOptions,
  type PageNavigateResult,
  type Page,
  type WaitUntilState,
  type AgentObserveParams,
  ErrorCodes,
} from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";

export async function handlePageCreate(
  _ws: WebSocket | null,
  state: ClientState,
  params: PageCreateOptions & { contextId?: string },
  ctx: HandlerContext
): Promise<Page> {
  ctx.ensureBrowser(state);
  ctx.checkPageLimit(state);

  let context: BrowserContext;
  let contextId: string;

  if (params.contextId) {
    const ctxState = state.contexts.get(params.contextId);
    if (!ctxState) {
      throw new BAPServerError(
        ErrorCodes.ContextNotFound,
        `Context not found: ${params.contextId}`
      );
    }
    context = ctxState.context;
    contextId = params.contextId;
  } else if (state.defaultContextId && state.contexts.has(state.defaultContextId)) {
    context = state.contexts.get(state.defaultContextId)!.context;
    contextId = state.defaultContextId;
  } else if (state.context) {
    context = state.context;
    contextId = state.defaultContextId ?? "default";
  } else {
    throw new BAPServerError(
      ErrorCodes.BrowserNotLaunched,
      "No context available. Create a context first."
    );
  }

  const page = await context.newPage();
  const pageId = `page-${randomUUID()}`;

  state.pageToContext.set(pageId, contextId);

  ctx.setupPageListeners(page, pageId);

  if (params.viewport) {
    await page.setViewportSize(params.viewport);
  }

  if (params.userAgent) {
    const safeUserAgent = JSON.stringify(params.userAgent);
    await page.context().addInitScript(`
      Object.defineProperty(navigator, 'userAgent', { get: () => ${safeUserAgent} });
    `);
  }

  if (params.geolocation) {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(params.geolocation);
  }

  if (params.url) {
    ctx.validateUrl(params.url);
    await page.goto(params.url);
  }

  state.pages.set(pageId, page);
  state.activePage = pageId;

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  return {
    id: pageId,
    url: page.url(),
    title: await page.title(),
    viewport,
    status: "ready",
  };
}

export async function handlePageNavigate(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<PageNavigateResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const url = params.url as string;

  ctx.validateUrl(url);

  const waitUntil = ctx.mapWaitUntil(params.waitUntil as WaitUntilState | undefined);
  const timeout = (params.timeout as number) ?? ctx.options.timeout;

  const response = await page.goto(url, {
    waitUntil,
    timeout,
    referer: params.referer as string | undefined,
  });

  const result: PageNavigateResult = {
    url: page.url(),
    status: response?.status() ?? 0,
    headers: response?.headers() ?? {},
  };

  // Fusion 2: navigate-observe kernel
  const observeParams = (params as Record<string, unknown>).observe as
    | AgentObserveParams
    | undefined;
  if (observeParams) {
    try {
      const pageId = params.pageId as string | undefined;
      // Use dispatch to call agent/observe — avoids circular import between page and agent handlers
      (result as Record<string, unknown>).observation = await ctx.dispatch(
        null,
        state,
        "agent/observe",
        { ...observeParams, pageId } as Record<string, unknown>
      );
    } catch {
      // Non-fatal
    }
  }

  return result;
}

export async function handlePageReload(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  await page.reload({
    waitUntil: ctx.mapWaitUntil(params.waitUntil as WaitUntilState | undefined),
    timeout: (params.timeout as number) ?? ctx.options.timeout,
  });
}

export async function handlePageGoBack(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  await page.goBack({
    waitUntil: ctx.mapWaitUntil(params.waitUntil as WaitUntilState | undefined),
    timeout: (params.timeout as number) ?? ctx.options.timeout,
  });
}

export async function handlePageGoForward(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  await page.goForward({
    waitUntil: ctx.mapWaitUntil(params.waitUntil as WaitUntilState | undefined),
    timeout: (params.timeout as number) ?? ctx.options.timeout,
  });
}

export async function handlePageClose(
  state: ClientState,
  params: Record<string, unknown>
): Promise<void> {
  const pageId = params.pageId as string;
  const page = state.pages.get(pageId);

  if (!page) {
    throw new BAPServerError(ErrorCodes.PageNotFound, `Page not found: ${pageId}`);
  }

  await page.close({ runBeforeUnload: params.runBeforeUnload as boolean | undefined });
  state.pages.delete(pageId);

  if (state.activePage === pageId) {
    state.activePage = state.pages.keys().next().value ?? null;
  }
}

export async function handlePageList(
  state: ClientState
): Promise<{ pages: Page[]; activePage: string }> {
  const pages: Page[] = [];

  for (const [id, page] of state.pages) {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    pages.push({
      id,
      url: page.url(),
      title: await page.title(),
      viewport,
      status: "ready",
    });
  }

  return {
    pages,
    activePage: state.activePage ?? "",
  };
}

export async function handlePageActivate(
  state: ClientState,
  params: Record<string, unknown>
): Promise<void> {
  const pageId = params.pageId as string;
  if (!state.pages.has(pageId)) {
    throw new BAPServerError(ErrorCodes.PageNotFound, `Page not found: ${pageId}`);
  }
  state.activePage = pageId;
  await state.pages.get(pageId)!.bringToFront();
}
