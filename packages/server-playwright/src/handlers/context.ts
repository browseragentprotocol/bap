/**
 * @fileoverview Context, frame, stream, and approval handlers
 * @module @browseragentprotocol/server-playwright/handlers/context
 */

import { randomUUID } from "node:crypto";
import {
  type ContextCreateParams,
  type ContextCreateResult,
  type ContextInfo,
  type ContextListResult,
  type ContextDestroyParams,
  type ContextDestroyResult,
  type FrameInfo,
  type FrameListParams,
  type FrameListResult,
  type FrameSwitchParams,
  type FrameSwitchResult,
  type FrameMainParams,
  type FrameMainResult,
  type StreamCancelParams,
  type StreamCancelResult,
  type ApprovalRespondParams,
  type ApprovalRespondResult,
  ErrorCodes,
} from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";

// =============================================================================
// Context Handlers (Multi-Context Support)
// =============================================================================

export async function handleContextCreate(
  state: ClientState,
  params: ContextCreateParams,
  _ctx: HandlerContext
): Promise<ContextCreateResult> {
  if (state.isPersistent) {
    throw new BAPServerError(
      ErrorCodes.InvalidParams,
      "Cannot create additional contexts in persistent profile mode"
    );
  }
  if (!state.browser) {
    throw new BAPServerError(ErrorCodes.BrowserNotLaunched, "Browser not launched");
  }

  const maxContexts = 5;
  if (state.contexts.size >= maxContexts) {
    throw new BAPServerError(
      ErrorCodes.ResourceLimitExceeded,
      `Maximum ${maxContexts} contexts allowed`,
      false,
      undefined,
      { resource: "contexts", limit: maxContexts, current: state.contexts.size }
    );
  }

  const contextId = params.contextId ?? `ctx-${randomUUID().slice(0, 8)}`;

  if (state.contexts.has(contextId)) {
    throw new BAPServerError(
      ErrorCodes.InvalidParams,
      `Context with ID '${contextId}' already exists`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contextOptions: any = {};
  if (params.options) {
    if (params.options.viewport) contextOptions.viewport = params.options.viewport;
    if (params.options.userAgent) contextOptions.userAgent = params.options.userAgent;
    if (params.options.locale) contextOptions.locale = params.options.locale;
    if (params.options.timezoneId) contextOptions.timezoneId = params.options.timezoneId;
    if (params.options.geolocation) contextOptions.geolocation = params.options.geolocation;
    if (params.options.permissions) contextOptions.permissions = params.options.permissions;
    if (params.options.colorScheme) contextOptions.colorScheme = params.options.colorScheme;
    if (params.options.offline) contextOptions.offline = params.options.offline;
    if (params.options.storageState) contextOptions.storageState = params.options.storageState;
  }

  const context = await state.browser.newContext(contextOptions);

  context.on("close", () => {
    state.contexts.delete(contextId);
    for (const [pageId, ctxId] of state.pageToContext) {
      if (ctxId === contextId) {
        state.pages.delete(pageId);
        state.pageToContext.delete(pageId);
        state.elementRegistries.delete(pageId);
        state.frameContexts.delete(pageId);
      }
    }
  });

  state.contexts.set(contextId, {
    context,
    created: Date.now(),
    options: params.options,
  });

  if (!state.defaultContextId) {
    state.defaultContextId = contextId;
    state.context = context;
  }

  return { contextId };
}

export async function handleContextList(state: ClientState): Promise<ContextListResult> {
  const contexts: ContextInfo[] = [];

  for (const [id, ctxState] of state.contexts) {
    const pageCount = Array.from(state.pageToContext.values()).filter(
      (ctxId) => ctxId === id
    ).length;

    contexts.push({
      id,
      pageCount,
      created: ctxState.created,
      options: ctxState.options,
    });
  }

  return {
    contexts,
    limits: {
      maxContexts: 5,
      currentCount: state.contexts.size,
    },
  };
}

export async function handleContextDestroy(
  state: ClientState,
  params: ContextDestroyParams
): Promise<ContextDestroyResult> {
  const ctxState = state.contexts.get(params.contextId);
  if (!ctxState) {
    throw new BAPServerError(ErrorCodes.ContextNotFound, `Context not found: ${params.contextId}`);
  }

  let pagesDestroyed = 0;
  for (const [, ctxId] of state.pageToContext) {
    if (ctxId === params.contextId) {
      pagesDestroyed++;
    }
  }

  await ctxState.context.close();

  if (state.defaultContextId === params.contextId) {
    state.defaultContextId = null;
    state.context = null;

    const firstContext = state.contexts.values().next().value;
    if (firstContext) {
      state.defaultContextId = Array.from(state.contexts.keys())[0];
      state.context = firstContext.context;
    }
  }

  return { pagesDestroyed };
}

// =============================================================================
// Frame Handlers
// =============================================================================

function getFrameId(frame: import("playwright").Frame): string {
  const name = frame.name() || "main";
  const url = frame.url();
  let hash = 0;
  const str = `${name}:${url}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return `frame-${Math.abs(hash).toString(36).slice(0, 8)}`;
}

export async function handleFrameList(
  state: ClientState,
  params: FrameListParams,
  ctx: HandlerContext
): Promise<FrameListResult> {
  const page = ctx.getPage(state, params.pageId);
  const frames: FrameInfo[] = [];

  for (const frame of page.frames()) {
    const parentFrame = frame.parentFrame();
    frames.push({
      frameId: getFrameId(frame),
      name: frame.name(),
      url: frame.url(),
      parentFrameId: parentFrame ? getFrameId(parentFrame) : undefined,
      isMain: frame === page.mainFrame(),
    });
  }

  return { frames };
}

export async function handleFrameSwitch(
  state: ClientState,
  params: FrameSwitchParams,
  ctx: HandlerContext
): Promise<FrameSwitchResult> {
  const page = ctx.getPage(state, params.pageId);
  const pageId = params.pageId ?? state.activePage!;
  let targetFrame: import("playwright").Frame | null = null;

  if (params.frameId) {
    targetFrame = page.frames().find((f) => getFrameId(f) === params.frameId) ?? null;
  } else if (params.selector) {
    const locator = ctx.resolveSelector(page, params.selector);
    const element = await locator.elementHandle();
    if (element) {
      targetFrame = await element.contentFrame();
    }
  } else if (params.url) {
    targetFrame = page.frames().find((f) => f.url().includes(params.url!)) ?? null;
  }

  if (!targetFrame) {
    throw new BAPServerError(ErrorCodes.FrameNotFound, "Frame not found");
  }

  const frameUrl = targetFrame.url();
  try {
    ctx.validateUrl(frameUrl);
  } catch {
    throw new BAPServerError(ErrorCodes.DomainNotAllowed, `Frame URL not allowed: ${frameUrl}`);
  }

  state.frameContexts.set(pageId, {
    pageId,
    frameId: getFrameId(targetFrame),
  });

  return {
    frameId: getFrameId(targetFrame),
    url: frameUrl,
  };
}

export async function handleFrameMain(
  state: ClientState,
  params: FrameMainParams,
  ctx: HandlerContext
): Promise<FrameMainResult> {
  const page = ctx.getPage(state, params.pageId);
  const pageId = params.pageId ?? state.activePage!;

  state.frameContexts.delete(pageId);

  return {
    frameId: getFrameId(page.mainFrame()),
  };
}

// =============================================================================
// Stream Handlers
// =============================================================================

export async function handleStreamCancel(
  state: ClientState,
  params: StreamCancelParams
): Promise<StreamCancelResult> {
  const stream = state.activeStreams.get(params.streamId);
  if (!stream) {
    return { cancelled: false };
  }

  stream.cancelled = true;
  state.activeStreams.delete(params.streamId);

  return { cancelled: true };
}

// =============================================================================
// Approval Handlers
// =============================================================================

export async function handleApprovalRespond(
  state: ClientState,
  params: ApprovalRespondParams
): Promise<ApprovalRespondResult> {
  const pending = state.pendingApprovals.get(params.requestId);
  if (!pending) {
    throw new BAPServerError(
      ErrorCodes.InvalidParams,
      `No pending approval with ID: ${params.requestId}`
    );
  }

  clearTimeout(pending.timeoutHandle);
  state.pendingApprovals.delete(params.requestId);

  if (params.decision === "deny") {
    pending.reject(
      new BAPServerError(ErrorCodes.ApprovalDenied, params.reason ?? "Approval denied by user")
    );
  } else {
    if (params.decision === "approve-session") {
      state.sessionApprovals.add(pending.rule);
    }
    pending.resolve({ approved: true, decision: params.decision });
  }

  return { acknowledged: true };
}
