/**
 * @fileoverview Storage handlers (getState, setState, getCookies, setCookies, clearCookies)
 * @module @browseragentprotocol/server-playwright/handlers/storage
 */

import type { StorageState, Cookie } from "@browseragentprotocol/protocol";
import { ErrorCodes } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";

export async function handleStorageGetState(
  state: ClientState,
  ctx: HandlerContext
): Promise<StorageState> {
  if (ctx.options.security?.blockStorageStateExtraction) {
    ctx.logSecurity("STORAGE_STATE_BLOCKED", { reason: "security_policy" });
    throw new BAPServerError(
      ErrorCodes.InvalidRequest,
      "Storage state extraction is disabled by security policy"
    );
  }

  ctx.ensureBrowser(state);
  ctx.logSecurity("STORAGE_STATE_EXTRACTED", {
    warning: "Contains session tokens - handle securely",
  });
  return (await state.context!.storageState()) as StorageState;
}

export async function handleStorageSetState(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  ctx.ensureBrowser(state);
  const storageState = params.state as StorageState;

  if (storageState.cookies?.length) {
    await state.context!.addCookies(storageState.cookies as Cookie[]);
  }

  for (const origin of storageState.origins ?? []) {
    ctx.validateUrl(origin.origin);
    const page = await state.context!.newPage();
    await page.goto(origin.origin);

    for (const item of origin.localStorage) {
      await page.evaluate(
        ([key, value]) => localStorage.setItem(key, value),
        [item.name, item.value]
      );
    }

    for (const item of origin.sessionStorage ?? []) {
      await page.evaluate(
        ([key, value]) => sessionStorage.setItem(key, value),
        [item.name, item.value]
      );
    }

    await page.close();
  }
}

export async function handleStorageGetCookies(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<{ cookies: Cookie[] }> {
  ctx.ensureBrowser(state);
  const urls = params.urls as string[] | undefined;
  const cookies = await state.context!.cookies(urls);
  return { cookies: cookies as Cookie[] };
}

export async function handleStorageSetCookies(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  ctx.ensureBrowser(state);
  const cookies = params.cookies as Cookie[];
  await state.context!.addCookies(cookies);
}

export async function handleStorageClearCookies(
  state: ClientState,
  _params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  ctx.ensureBrowser(state);
  await state.context!.clearCookies();
}
