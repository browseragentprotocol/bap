/**
 * @fileoverview Dialog, tracing, and event subscription handlers
 * @module @browseragentprotocol/server-playwright/handlers/misc
 */

import type { HandlerContext, ClientState } from "../types.js";

// =============================================================================
// Dialog Handler
// =============================================================================

export async function handleDialogHandle(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const action = params.action as "accept" | "dismiss";
  const promptText = params.promptText as string | undefined;

  page.once("dialog", async (dialog) => {
    if (action === "accept") {
      await dialog.accept(promptText);
    } else {
      await dialog.dismiss();
    }
  });
}

// =============================================================================
// Tracing Handlers
// =============================================================================

export async function handleTraceStart(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  ctx.ensureBrowser(state);

  await state.context!.tracing.start({
    name: params.name as string | undefined,
    screenshots: params.screenshots as boolean | undefined,
    snapshots: params.snapshots as boolean | undefined,
    sources: params.sources as boolean | undefined,
  });

  state.tracing = true;
}

export async function handleTraceStop(
  state: ClientState,
  ctx: HandlerContext
): Promise<{ data?: string }> {
  ctx.ensureBrowser(state);

  if (!state.tracing) {
    return {};
  }

  const result = await state.context!.tracing.stop();
  state.tracing = false;

  const buffer = result as Buffer | undefined;
  return {
    data: buffer?.toString("base64"),
  };
}

// =============================================================================
// Event Subscription
// =============================================================================

export async function handleEventsSubscribe(
  state: ClientState,
  params: Record<string, unknown>
): Promise<void> {
  const events = params.events as string[];
  for (const event of events) {
    state.eventSubscriptions.add(event);
  }
}
