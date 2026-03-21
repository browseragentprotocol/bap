/**
 * @fileoverview Observation handlers (screenshot, accessibility, dom, element, pdf, content, ariaSnapshot)
 * @module @browseragentprotocol/server-playwright/handlers/observe
 */

import type {
  BAPSelector,
  ScreenshotOptions,
  AccessibilityTreeOptions,
  ObserveScreenshotResult,
  ObserveAccessibilityResult,
  ObserveDOMResult,
  ObserveElementResult,
  ObservePDFResult,
  ObserveContentResult,
  ContentFormat,
  ElementProperty,
} from "@browseragentprotocol/protocol";
import type { HandlerContext, ClientState } from "../types.js";
import { cdpScreenshot } from "../cdp/fast-screenshot.js";

export async function handleObserveScreenshot(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<ObserveScreenshotResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const options = params.options as ScreenshotOptions | undefined;

  ctx.checkRateLimit(state, "screenshot");

  const screenshotType =
    options?.format === "jpeg" || options?.format === "png" ? options.format : "jpeg";

  // CDP fast path — bypasses Playwright's rendering pipeline
  if (!options?.clip) {
    const cdpBuffer = await cdpScreenshot(page, {
      format: screenshotType,
      quality: options?.quality ?? 80,
      fullPage: options?.fullPage,
    });
    if (cdpBuffer) {
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      return {
        data: cdpBuffer.toString("base64"),
        format: screenshotType,
        width: viewport.width,
        height: viewport.height,
      };
    }
  }

  // Playwright fallback (Firefox/WebKit, or clip option which CDP doesn't support well)
  const buffer = await page.screenshot({
    fullPage: options?.fullPage,
    clip: options?.clip,
    type: screenshotType,
    quality: options?.quality ?? (screenshotType === "jpeg" ? 80 : undefined),
    scale: options?.scale ?? "css",
  });

  let width: number;
  let height: number;
  const format = screenshotType;

  if (format === "png" && buffer[0] === 0x89 && buffer[1] === 0x50) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  } else if (format === "jpeg" && buffer.length > 0) {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    if (options?.clip) {
      width = options.clip.width;
      height = options.clip.height;
    } else if (options?.fullPage) {
      width = viewport.width;
      const scrollHeight = await page.evaluate("document.documentElement.scrollHeight");
      height = (scrollHeight as number) || viewport.height;
    } else {
      width = viewport.width;
      height = viewport.height;
    }
  } else {
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    width = options?.clip?.width ?? viewport.width;
    height = options?.clip?.height ?? viewport.height;
  }

  return { data: buffer.toString("base64"), format, width, height };
}

export async function handleObserveAccessibility(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<ObserveAccessibilityResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const options = params.options as AccessibilityTreeOptions | undefined;

  let root: import("playwright").Locator | undefined;
  if (options?.root) {
    root = ctx.resolveSelector(page, options.root);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await (page as any).accessibility.snapshot({
    root: root ? await root.elementHandle() : undefined,
    interestingOnly: options?.interestingOnly ?? true,
  });

  const tree = ctx.convertAccessibilityNode(snapshot);
  return { tree };
}

export async function handleObserveDOM(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<ObserveDOMResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);

  let html = await page.content();
  const text = await page.innerText("body").catch(() => "");
  const title = await page.title();
  const url = page.url();

  html = ctx.redactSensitiveContent(html);

  return { html, text, title, url };
}

export async function handleObserveElement(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<ObserveElementResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const selector = params.selector as BAPSelector;
  const properties = params.properties as ElementProperty[];

  const locator = ctx.resolveSelector(page, selector);
  const count = await locator.count();

  if (count === 0) {
    return { found: false };
  }

  const result: {
    found: boolean;
    visible?: boolean;
    enabled?: boolean;
    checked?: boolean;
    text?: string;
    value?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    attributes?: Record<string, string>;
    computedStyle?: Record<string, string>;
  } = { found: true };

  for (const prop of properties) {
    switch (prop) {
      case "visible":
        result.visible = await locator.isVisible();
        break;
      case "enabled":
        result.enabled = await locator.isEnabled();
        break;
      case "checked":
        result.checked = await locator.isChecked().catch(() => undefined);
        break;
      case "text":
        result.text = await locator.innerText().catch(() => "");
        break;
      case "value": {
        const inputType = await locator.getAttribute("type").catch(() => "");
        const isSensitive = await locator.getAttribute("data-sensitive").catch(() => null);
        if (inputType?.toLowerCase() === "password" || isSensitive !== null) {
          result.value = "[REDACTED]";
          ctx.logSecurity("VALUE_REDACTED", {
            selector: JSON.stringify(selector),
            reason: "password_field",
          });
        } else {
          result.value = await locator.inputValue().catch(() => undefined);
        }
        break;
      }
      case "boundingBox":
        result.boundingBox = (await locator.boundingBox()) ?? undefined;
        break;
      case "attributes":
        result.attributes = await locator.evaluate((el) => {
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
          }
          return attrs;
        });
        break;
      case "computedStyle":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.computedStyle = await locator.evaluate((el: any) => {
          const style = el.ownerDocument.defaultView.getComputedStyle(el);
          const obj: Record<string, string> = {};
          for (let i = 0; i < style.length; i++) {
            const prop = style[i];
            obj[prop] = style.getPropertyValue(prop);
          }
          return obj;
        });
        break;
    }
  }

  return result;
}

export async function handleObservePDF(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<ObservePDFResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const options = params.options as Record<string, unknown> | undefined;

  const buffer = await page.pdf({
    format: (options?.format as "Letter" | "A4" | undefined) ?? "A4",
    landscape: options?.landscape as boolean | undefined,
    scale: options?.scale as number | undefined,
    margin: options?.margin as Record<string, string> | undefined,
    printBackground: options?.printBackground as boolean | undefined,
  });

  return { data: buffer.toString("base64") };
}

export async function handleObserveContent(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<ObserveContentResult> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const format = params.format as ContentFormat;

  let content: string;

  switch (format) {
    case "html":
      content = await page.content();
      break;
    case "text":
      content = await page.innerText("body");
      break;
    case "markdown": {
      const html = await page.content();
      content = ctx.htmlToMarkdown(html);
      break;
    }
    default:
      content = await page.innerText("body");
  }

  return {
    content,
    url: page.url(),
    title: await page.title(),
  };
}

export async function handleObserveAriaSnapshot(
  state: ClientState,
  params: Record<string, unknown>,
  ctx: HandlerContext
): Promise<{ snapshot: string; url: string; title: string }> {
  const page = ctx.getPage(state, params.pageId as string | undefined);
  const selector = params.selector as BAPSelector | undefined;
  const options = params.options as { timeout?: number } | undefined;

  let snapshot: string;

  if (selector) {
    const locator = ctx.resolveSelector(page, selector);
    snapshot = await locator.ariaSnapshot({
      timeout: options?.timeout ?? ctx.options.timeout,
    });
  } else {
    snapshot = await page.locator("body").ariaSnapshot({
      timeout: options?.timeout ?? ctx.options.timeout,
    });
  }

  return {
    snapshot,
    url: page.url(),
    title: await page.title(),
  };
}
