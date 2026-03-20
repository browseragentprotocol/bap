/**
 * @fileoverview Action handlers (click, dblclick, type, fill, clear, press, hover, scroll, select, check, uncheck, upload, drag)
 * @module @browseragentprotocol/server-playwright/handlers/actions
 */

import type {
  BAPSelector,
  ClickOptions,
  TypeOptions,
  ScrollOptions,
  ActionOptions,
  FileUpload,
} from "@browseragentprotocol/protocol";
import { ErrorCodes } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";

export async function handleActionClick(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const selector = params.selector as BAPSelector;
  const options = params.options as ClickOptions | undefined;

  if (selector.type === "coordinates") {
    await page.mouse.click(selector.x, selector.y, {
      button: options?.button as "left" | "right" | "middle" | undefined,
      clickCount: options?.clickCount,
    });
    return;
  }

  const locator = ctx.resolveSelector(page, selector);
  await locator.click({
    button: options?.button,
    clickCount: options?.clickCount,
    modifiers: options?.modifiers as ("Alt" | "Control" | "Meta" | "Shift")[] | undefined,
    position: options?.position,
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
    trial: options?.trial,
  });
}

export async function handleActionDblclick(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const selector = params.selector as BAPSelector;
  const options = params.options as ClickOptions | undefined;

  if (selector.type === "coordinates") {
    await page.mouse.dblclick(selector.x, selector.y, {
      button: options?.button as "left" | "right" | "middle" | undefined,
    });
    return;
  }

  const locator = ctx.resolveSelector(page, selector);
  await locator.dblclick({
    button: options?.button,
    modifiers: options?.modifiers as ("Alt" | "Control" | "Meta" | "Shift")[] | undefined,
    position: options?.position,
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
    trial: options?.trial,
  });
}

export async function handleActionType(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const text = params.text as string;
  const options = params.options as TypeOptions | undefined;

  if (options?.clear) {
    await locator.clear({ timeout: options?.timeout ?? ctx.options.timeout });
  }

  await locator.pressSequentially(text, {
    delay: options?.delay,
    timeout: options?.timeout ?? ctx.options.timeout,
  });
}

export async function handleActionFill(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const value = params.value as string;
  const options = params.options as ActionOptions | undefined;

  await locator.fill(value, {
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
  });
}

export async function handleActionClear(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const options = params.options as ActionOptions | undefined;

  await locator.clear({
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
  });
}

export async function handleActionPress(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const key = params.key as string;
  const selector = params.selector as BAPSelector | undefined;
  const options = params.options as ActionOptions | undefined;

  if (selector) {
    const locator = ctx.resolveSelector(page, selector);
    await locator.press(key, {
      timeout: options?.timeout ?? ctx.options.timeout,
      noWaitAfter: options?.noWaitAfter,
    });
  } else {
    await page.keyboard.press(key);
  }
}

export async function handleActionHover(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const selector = params.selector as BAPSelector;
  const options = params.options as
    | (ActionOptions & { position?: { x: number; y: number } })
    | undefined;

  if (selector.type === "coordinates") {
    await page.mouse.move(selector.x, selector.y);
    return;
  }

  const locator = ctx.resolveSelector(page, selector);
  await locator.hover({
    position: options?.position,
    force: options?.force,
    timeout: options?.timeout ?? ctx.options.timeout,
    trial: options?.trial,
  });
}

export async function handleActionScroll(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const selector = params.selector as BAPSelector | undefined;
  const options = params.options as ScrollOptions | undefined;

  if (selector) {
    const locator = ctx.resolveSelector(page, selector);
    await locator.scrollIntoViewIfNeeded({
      timeout: options?.timeout ?? ctx.options.timeout,
    });
  } else {
    const direction = options?.direction ?? "down";
    const amount = options?.amount ?? 300;

    let deltaX = 0;
    let deltaY = 0;

    if (typeof amount === "number") {
      switch (direction) {
        case "up":
          deltaY = -amount;
          break;
        case "down":
          deltaY = amount;
          break;
        case "left":
          deltaX = -amount;
          break;
        case "right":
          deltaX = amount;
          break;
      }
    } else if (amount === "page") {
      const viewport = page.viewportSize();
      switch (direction) {
        case "up":
          deltaY = -(viewport?.height ?? 600);
          break;
        case "down":
          deltaY = viewport?.height ?? 600;
          break;
        case "left":
          deltaX = -(viewport?.width ?? 800);
          break;
        case "right":
          deltaX = viewport?.width ?? 800;
          break;
      }
    }

    await page.mouse.wheel(deltaX, deltaY);
  }
}

export async function handleActionSelect(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const values = params.values as string | string[];
  const options = params.options as ActionOptions | undefined;

  const valuesArray = Array.isArray(values) ? values : [values];
  await locator.selectOption(valuesArray, {
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
  });
}

export async function handleActionCheck(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const options = params.options as ActionOptions | undefined;

  await locator.check({
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
    trial: options?.trial,
  });
}

export async function handleActionUncheck(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const options = params.options as ActionOptions | undefined;

  await locator.uncheck({
    force: options?.force,
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
    trial: options?.trial,
  });
}

export async function handleActionUpload(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const locator = ctx.resolveSelector(page, params.selector as BAPSelector);
  const files = params.files as FileUpload[];
  const options = params.options as ActionOptions | undefined;

  const buffers = files.map((f) => ({
    name: f.name,
    mimeType: f.mimeType,
    buffer: Buffer.from(f.buffer, "base64"),
  }));

  await locator.setInputFiles(buffers, {
    noWaitAfter: options?.noWaitAfter,
    timeout: options?.timeout ?? ctx.options.timeout,
  });
}

export async function handleActionDrag(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<void> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const source = ctx.resolveSelector(page, params.source as BAPSelector);
  const target = params.target as BAPSelector | { x: number; y: number };
  const options = params.options as ActionOptions | undefined;

  if ("type" in target) {
    const targetLocator = ctx.resolveSelector(page, target);
    await source.dragTo(targetLocator, {
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? ctx.options.timeout,
      trial: options?.trial,
    });
  } else {
    const sourceBox = await source.boundingBox();
    if (!sourceBox) {
      throw new BAPServerError(ErrorCodes.ElementNotFound, "Source element not found");
    }

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y);
    await page.mouse.up();
  }
}
