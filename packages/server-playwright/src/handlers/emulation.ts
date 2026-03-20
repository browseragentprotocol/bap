/**
 * @fileoverview Emulation handlers (setViewport, setUserAgent, setGeolocation, setOffline)
 * @module @browseragentprotocol/server-playwright/handlers/emulation
 */

import type { HandlerContext, ClientState } from "../types.js";

export async function handleEmulateSetViewport(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  await page.setViewportSize({
    width: params.width as number,
    height: params.height as number,
  });
}

export async function handleEmulateSetUserAgent(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const userAgent = params.userAgent as string;

  const safeUserAgent = JSON.stringify(userAgent);
  await page.context().addInitScript(`
    Object.defineProperty(navigator, 'userAgent', { get: () => ${safeUserAgent} });
  `);
}

export async function handleEmulateSetGeolocation(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  ctx.ensureBrowser(state);
  await state.context!.setGeolocation({
    latitude: params.latitude as number,
    longitude: params.longitude as number,
    accuracy: params.accuracy as number | undefined,
  });
}

export async function handleEmulateSetOffline(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  ctx.ensureBrowser(state);
  await state.context!.setOffline(params.offline as boolean);
}
