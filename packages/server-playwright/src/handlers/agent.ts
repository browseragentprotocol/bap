/**
 * @fileoverview Agent handlers (act, observe, extract) with fusion optimizations
 * @module @browseragentprotocol/server-playwright/handlers/agent
 */

import type { Page as PlaywrightPage } from "playwright";
import type { WebSocket } from "ws";
import {
  type AgentActParams,
  type AgentActResult,
  type AgentObserveParams,
  type AgentObserveResult,
  type AgentExtractParams,
  type AgentExtractResult,
  type ExecutionStep,
  type StepResult,
  type StepCondition,
  type InteractiveElement,
  type AnnotationOptions,
  type AnnotationMapping,
  ALLOWED_ACT_ACTIONS,
  ErrorCodes,
  createElementRegistry,
  cleanupStaleEntries,
} from "@browseragentprotocol/protocol";
import type { BAPSelector } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";
import { getInteractiveElements } from "../elements/interactive.js";
import { discoverWebMCPTools } from "./discovery.js";
import { extractDataFromContent } from "./extract.js";
import { ActionCache } from "../cache/action-cache.js";

// =============================================================================
// Agent Act
// =============================================================================

export async function handleAgentAct(
  ws: WebSocket | null,
  state: ClientState,
  params: AgentActParams,
  ctx: HandlerContext
): Promise<AgentActResult> {
  const startTime = Date.now();
  const page = ctx.getPage(state, params.pageId);

  const results: StepResult[] = [];
  let completed = 0;
  let failedAt: number | undefined;

  const stopOnFirstError = params.stopOnFirstError ?? true;
  const globalTimeout = params.timeout ?? ctx.options.timeout ?? 30000;

  // Validate all steps before execution
  for (const step of params.steps) {
    if (!ALLOWED_ACT_ACTIONS.includes(step.action as (typeof ALLOWED_ACT_ACTIONS)[number])) {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Action not allowed in agent/act: ${step.action}. Allowed actions: ${ALLOWED_ACT_ACTIONS.join(", ")}`
      );
    }
    ctx.checkAuthorization(state, step.action);
  }

  // Fusion 1: observe-act-observe kernel — pre-observation (runs BEFORE steps)
  const preObserve = (params as Record<string, unknown>).preObserve as
    | AgentObserveParams
    | undefined;
  let preObservation: AgentObserveResult | undefined;
  if (preObserve) {
    try {
      preObservation = await handleAgentObserve(
        state,
        { ...preObserve, pageId: params.pageId },
        ctx
      );
    } catch {
      // Non-fatal: pre-observation failure doesn't block act execution
    }
  }

  try {
    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i];
      const stepStart = Date.now();

      if (Date.now() - startTime >= globalTimeout) {
        throw new BAPServerError(ErrorCodes.Timeout, "Sequence timeout exceeded");
      }

      let stepResult: StepResult;

      try {
        if (step.condition) {
          const conditionMet = await checkStepCondition(page, step.condition, ctx);
          if (!conditionMet) {
            if (params.continueOnConditionFail) {
              stepResult = {
                step: i,
                label: step.label,
                success: false,
                error: {
                  code: ErrorCodes.InvalidParams,
                  message: `Condition not met: ${step.condition.state} for selector`,
                },
                duration: Date.now() - stepStart,
              };
              results.push(stepResult);
              continue;
            }
            throw new BAPServerError(ErrorCodes.InvalidParams, "Step condition not met");
          }
        }

        const actionResult = await executeStepWithRetry(ws, state, step, ctx);

        stepResult = {
          step: i,
          label: step.label,
          success: true,
          result: actionResult.result,
          duration: Date.now() - stepStart,
          retries: actionResult.retries,
        };

        completed++;
      } catch (error) {
        const errorInfo = extractErrorInfo(error);

        stepResult = {
          step: i,
          label: step.label,
          success: false,
          error: errorInfo,
          duration: Date.now() - stepStart,
        };

        if (step.onError === "skip") {
          // Continue to next step
        } else if (stopOnFirstError) {
          failedAt = i;
          results.push(stepResult);
          break;
        }
      }

      results.push(stepResult);
    }
  } catch {
    if (results.length < params.steps.length && failedAt === undefined) {
      failedAt = results.length;
    }
  }

  const actResult: AgentActResult = {
    completed,
    total: params.steps.length,
    success: completed === params.steps.length,
    results,
    duration: Date.now() - startTime,
    failedAt,
  };

  // Attach pre-observation result (captured before steps ran)
  if (preObservation) {
    (actResult as Record<string, unknown>).preObservation = preObservation;
  }

  // Fusion 1: observe-act-observe kernel — post-observation (runs AFTER steps)
  const postObserve = (params as Record<string, unknown>).postObserve as
    | AgentObserveParams
    | undefined;
  if (postObserve) {
    try {
      (actResult as Record<string, unknown>).postObservation = await handleAgentObserve(
        state,
        { ...postObserve, pageId: params.pageId },
        ctx
      );
    } catch {
      // Non-fatal
    }
  }

  // Fusion 6: speculative prefetch
  if (!postObserve && results.length > 0) {
    const lastStep = params.steps[results.length - 1];
    if (lastStep && (lastStep.action === "page/navigate" || lastStep.action === "action/click")) {
      speculativeObserve(state, ctx, params.pageId);
    }
  }

  return actResult;
}

async function executeStepWithRetry(
  ws: WebSocket | null,
  state: ClientState,
  step: ExecutionStep,
  ctx: HandlerContext
): Promise<{ result: unknown; retries: number }> {
  const maxRetries = step.onError === "retry" ? (step.maxRetries ?? 3) : 1;
  const retryDelay = step.retryDelay ?? 500;

  // Action cache: build key from action + URL + selector
  let cacheKey: string | undefined;
  const selector = step.params.selector as BAPSelector | undefined;
  try {
    const page = ctx.getPage(state, step.params.pageId as string | undefined);
    const urlOrigin = new URL(page.url()).origin;
    const selectorHint = selector ? JSON.stringify(selector) : "";
    cacheKey = ActionCache.cacheKey(step.action, urlOrigin, selectorHint);

    // Check cache for a previously successful resolution
    const cached = ctx.actionCache.get(cacheKey);
    if (cached) {
      // Use cached CSS selector for faster resolution
      const cachedParams = {
        ...step.params,
        selector: cached.resolvedSelector,
      };
      try {
        const result = await ctx.dispatch(ws, state, step.action, cachedParams);
        return { result, retries: 0 };
      } catch {
        // Cached selector failed — invalidate and fall through to fresh execution
        ctx.actionCache.delete(cacheKey);
      }
    }
  } catch {
    // Page may not exist yet — skip cache
  }

  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // On retry attempts, try self-healing the selector if the step has one
      if (attempt > 0 && selector) {
        try {
          const page = ctx.getPage(state, step.params.pageId as string | undefined);
          const healed = await ctx.resolveSelectorWithHealing(page, selector);
          const box = await healed.boundingBox();
          if (box) {
            // Healing succeeded — the healed locator works
          }
        } catch {
          // Healing failed — proceed with original params anyway
        }
      }

      const result = await ctx.dispatch(ws, state, step.action, step.params);

      // Cache successful resolution (if selector-based action)
      // Store a CSS selector for fast replay — avoids re-resolving semantic selectors
      if (cacheKey && selector && selector.type !== "css") {
        try {
          const page = ctx.getPage(state, step.params.pageId as string | undefined);
          const urlOrigin = new URL(page.url()).origin;
          // Resolve the semantic selector to get a CSS path for caching
          const locator = ctx.resolveSelector(page, selector);
          const elementHandle = await locator.first().elementHandle();
          let cssSelector: string | undefined;
          if (elementHandle) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cssSelector = await page.evaluate((el: any) => {
              // Build a minimal CSS selector from id or unique path
              const CSSObj = (globalThis as any).CSS;
              if (el.id) return `#${CSSObj?.escape ? CSSObj.escape(el.id) : el.id}`;
              if (el.dataset?.testid) {
                const escaped = CSSObj?.escape
                  ? CSSObj.escape(el.dataset.testid)
                  : el.dataset.testid;
                return `[data-testid="${escaped}"]`;
              }
              return undefined;
            }, elementHandle);
          }
          if (cssSelector) {
            ctx.actionCache.set(cacheKey, {
              action: step.action,
              resolvedSelector: { type: "css", value: cssSelector },
              urlPattern: urlOrigin,
              domFingerprint: "",
            });
          }
        } catch {
          // Non-fatal — cache is best-effort
        }
      }

      return { result, retries };
    } catch (error) {
      lastError = error as Error;
      retries = attempt + 1;

      // Invalidate cache on failure
      if (cacheKey) {
        ctx.actionCache.delete(cacheKey);
      }

      if (attempt < maxRetries - 1 && step.onError === "retry") {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

async function checkStepCondition(
  page: PlaywrightPage,
  condition: StepCondition,
  ctx: HandlerContext
): Promise<boolean> {
  const timeout = condition.timeout ?? 5000;
  const locator = ctx.resolveSelector(page, condition.selector);

  try {
    switch (condition.state) {
      case "visible":
        await locator.waitFor({ state: "visible", timeout });
        return true;
      case "hidden":
        await locator.waitFor({ state: "hidden", timeout });
        return true;
      case "enabled":
        await locator.waitFor({ state: "visible", timeout });
        return await locator.isEnabled();
      case "disabled":
        await locator.waitFor({ state: "visible", timeout });
        return await locator.isDisabled();
      case "exists":
        await locator.waitFor({ state: "attached", timeout });
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function extractErrorInfo(error: unknown): {
  code: number;
  message: string;
  data?: { retryable: boolean; retryAfterMs?: number; details?: Record<string, unknown> };
} {
  if (error instanceof BAPServerError) {
    return {
      code: error.code,
      message: error.message,
      data: {
        retryable: error.retryable,
        retryAfterMs: error.retryAfterMs,
        details: error.details,
      },
    };
  }

  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("Timeout")) {
      return { code: ErrorCodes.Timeout, message, data: { retryable: true } };
    }
    if (message.includes("not visible") || message.includes("not enabled")) {
      return { code: ErrorCodes.ElementNotFound, message, data: { retryable: true } };
    }
    return { code: ErrorCodes.InternalError, message, data: { retryable: false } };
  }

  return { code: ErrorCodes.InternalError, message: "Unknown error", data: { retryable: false } };
}

// =============================================================================
// Fusion 6: Speculative Prefetch
// =============================================================================

function speculativeObserve(state: ClientState, ctx: HandlerContext, pageId?: string): void {
  if (state.speculativePrefetchTimer) {
    clearTimeout(state.speculativePrefetchTimer);
    state.speculativePrefetchTimer = undefined;
  }

  let urlAtCallTime: string | undefined;
  try {
    const p = ctx.getPage(state, pageId);
    urlAtCallTime = p.url();
  } catch {
    return;
  }

  state.speculativePrefetchTimer = setTimeout(async () => {
    state.speculativePrefetchTimer = undefined;
    try {
      if (!state.initialized) return;

      const page = ctx.getPage(state, pageId);
      if (page.url() !== urlAtCallTime) return;

      const result = await handleAgentObserve(
        state,
        {
          pageId,
          includeMetadata: true,
          includeInteractiveElements: true,
          includeScreenshot: false,
          includeAccessibility: false,
          maxElements: 50,
          responseTier: "interactive",
        },
        ctx
      );

      if (page.url() !== urlAtCallTime) return;

      state.speculativeObservation = {
        pageUrl: page.url(),
        result,
        timestamp: Date.now(),
      };
    } catch {
      // Speculative prefetch is fire-and-forget
    }
  }, 200);
}

// =============================================================================
// Agent Observe
// =============================================================================

export async function handleAgentObserve(
  state: ClientState,
  params: AgentObserveParams,
  ctx: HandlerContext
): Promise<AgentObserveResult> {
  const page = ctx.getPage(state, params.pageId);
  const pageId = params.pageId ?? state.activePage ?? "";
  const pageUrl = page.url();

  // Fusion 6: speculative cache check
  if (state.speculativeObservation) {
    const spec = state.speculativeObservation;
    const age = Date.now() - spec.timestamp;
    const canUse =
      spec.pageUrl === pageUrl &&
      age < 5000 &&
      !params.includeAccessibility &&
      !params.includeScreenshot &&
      !params.annotateScreenshot;
    state.speculativeObservation = undefined;
    if (canUse) {
      return spec.result;
    }
  }

  const result: AgentObserveResult = {};

  // Fusion 5: response tiers
  const responseTier = params.responseTier ?? "full";
  if (responseTier === "interactive" || responseTier === "minimal") {
    params = {
      ...params,
      includeAccessibility: false,
      includeScreenshot: false,
      includeInteractiveElements: true,
      includeMetadata: true,
    };
  }

  let registry = state.elementRegistries.get(pageId);

  // Snapshot previous refs for incremental diff
  const previousRefs =
    params.incremental && registry
      ? new Map(
          Array.from(registry.elements.entries()).map(([ref, entry]) => [
            ref,
            {
              name: entry.identity.name,
              value: undefined as string | undefined,
              disabled: false,
            },
          ])
        )
      : null;

  if (!registry || registry.pageUrl !== pageUrl || params.refreshRefs) {
    registry = createElementRegistry(pageUrl);
    state.elementRegistries.set(pageId, registry);
  }

  cleanupStaleEntries(registry);

  // Metadata
  if (params.includeMetadata !== false) {
    const viewport = page.viewportSize();
    result.metadata = {
      url: page.url(),
      title: await page.title(),
      viewport: viewport ?? { width: 0, height: 0 },
    };
  }

  // Accessibility tree
  if (params.includeAccessibility) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await (page as any).accessibility.snapshot();
    result.accessibility = {
      tree: snapshot ? [ctx.convertAccessibilityNode(snapshot)] : [],
    };
  }

  // Interactive elements
  let interactiveElements: InteractiveElement[] | undefined;
  const needElements = params.includeInteractiveElements || params.annotateScreenshot;

  if (needElements) {
    const includeBounds = params.includeBounds ?? !!params.annotateScreenshot;

    const elements = await getInteractiveElements(page, {
      maxElements: params.maxElements ?? 100,
      filterRoles: params.filterRoles,
      includeBounds,
      registry,
      stableRefs: params.stableRefs !== false,
      refreshRefs: params.refreshRefs,
      includeRefHistory: params.includeRefHistory,
    });
    interactiveElements = elements.elements;

    if (params.includeInteractiveElements) {
      if (responseTier === "minimal") {
        result.interactiveElements = elements.elements.map((el) => ({
          ref: el.ref,
          selector: el.selector,
          role: el.role,
          name: el.name,
          tagName: el.tagName,
          actionHints: [],
        }));
      } else {
        result.interactiveElements = elements.elements;
      }
      result.totalInteractiveElements = elements.total;
    }

    // Fusion 3: incremental observe
    if (params.incremental && previousRefs) {
      const currentRefs = new Set(elements.elements.map((el) => el.ref));
      const added: InteractiveElement[] = [];
      const updated: InteractiveElement[] = [];
      const removed: string[] = [];

      for (const el of elements.elements) {
        if (!previousRefs.has(el.ref)) {
          added.push(el);
        } else {
          const prev = previousRefs.get(el.ref)!;
          if (prev.name !== el.name) {
            updated.push(el);
          }
        }
      }

      for (const [prevRef] of previousRefs) {
        if (!currentRefs.has(prevRef)) {
          removed.push(prevRef);
        }
      }

      result.changes = { added, updated, removed };
    }
  }

  // Screenshot (with optional annotation)
  if (params.includeScreenshot || params.annotateScreenshot) {
    const viewport = page.viewportSize();
    const useAnnotation =
      params.annotateScreenshot && interactiveElements && interactiveElements.length > 0;
    const obsFormat = useAnnotation ? ("png" as const) : ("jpeg" as const);
    let buffer = await page.screenshot({
      type: obsFormat,
      quality: obsFormat === "jpeg" ? 80 : undefined,
    });
    let annotated = false;
    let annotationMap: AnnotationMapping[] | undefined;

    if (useAnnotation && interactiveElements) {
      const annotationOpts: AnnotationOptions =
        typeof params.annotateScreenshot === "object"
          ? params.annotateScreenshot
          : { enabled: true };

      if (annotationOpts.enabled) {
        const annotationResult = await annotateScreenshot(
          page,
          buffer,
          interactiveElements,
          annotationOpts
        );
        buffer = annotationResult.buffer;
        annotated = true;
        annotationMap = annotationResult.map;
      }
    }

    result.screenshot = {
      data: buffer.toString("base64"),
      format: obsFormat,
      width: viewport?.width ?? 0,
      height: viewport?.height ?? 0,
      annotated,
    };

    if (annotationMap) {
      result.annotationMap = annotationMap;
    }
  }

  // WebMCP tool discovery (opt-in)
  if (params.includeWebMCPTools) {
    const discovery = await discoverWebMCPTools(page);
    if (discovery.tools.length > 0) {
      result.webmcpTools = discovery.tools;
    }
  }

  return result;
}

// =============================================================================
// Screenshot Annotation (Set-of-Marks)
// =============================================================================

async function annotateScreenshot(
  page: PlaywrightPage,
  screenshotBuffer: Buffer,
  elements: InteractiveElement[],
  options: AnnotationOptions
): Promise<{ buffer: Buffer; map: AnnotationMapping[] }> {
  const maxLabels = options.maxLabels ?? 50;
  const labelFormat = options.labelFormat ?? "number";
  const style = options.style ?? {};

  const badgeColor = style.badge?.color ?? "#FF0000";
  const badgeTextColor = style.badge?.textColor ?? "#FFFFFF";
  const badgeSize = style.badge?.size ?? 20;
  const badgeFont = style.badge?.font ?? "bold 12px sans-serif";
  const showBox = style.showBoundingBox !== false;
  const boxColor = style.box?.color ?? "#FF0000";
  const boxWidth = style.box?.width ?? 2;
  const boxStyle = style.box?.style ?? "solid";
  const opacity = style.opacity ?? 0.8;

  const elementsWithBounds = elements.filter((el) => el.bounds).slice(0, maxLabels);

  const annotationMap: AnnotationMapping[] = elementsWithBounds.map((el, i) => {
    let label: string;
    if (labelFormat === "ref") {
      label = el.ref;
    } else if (labelFormat === "both") {
      label = `${i + 1}:${el.ref}`;
    } else {
      label = String(i + 1);
    }

    return {
      label,
      ref: el.ref,
      position: {
        x: el.bounds!.x,
        y: el.bounds!.y - badgeSize - 2,
      },
    };
  });

  const annotatedBase64 = await page.evaluate(
    (args: {
      imageData: string;
      elements: {
        label: string;
        bounds: { x: number; y: number; width: number; height: number };
      }[];
      badgeColor: string;
      badgeTextColor: string;
      badgeSize: number;
      badgeFont: string;
      showBox: boolean;
      boxColor: string;
      boxWidth: number;
      boxStyle: string;
      opacity: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }): any => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Promise<string>((resolve: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        const canvas = doc.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const img = new (globalThis as any).Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;

          ctx.drawImage(img, 0, 0);
          ctx.globalAlpha = args.opacity;

          for (const el of args.elements) {
            const { label, bounds } = el;

            if (args.showBox) {
              ctx.strokeStyle = args.boxColor;
              ctx.lineWidth = args.boxWidth;
              if (args.boxStyle === "dashed") {
                ctx.setLineDash([5, 5]);
              } else {
                ctx.setLineDash([]);
              }
              ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            }

            const textMetrics = ctx.measureText(label);
            const bw = Math.max(args.badgeSize, textMetrics.width + 8);
            const badgeX = bounds.x - 2;
            const badgeY = Math.max(0, bounds.y - args.badgeSize - 2);

            ctx.fillStyle = args.badgeColor;
            ctx.fillRect(badgeX, badgeY, bw, args.badgeSize);

            ctx.fillStyle = args.badgeTextColor;
            ctx.font = args.badgeFont;
            ctx.textBaseline = "middle";
            ctx.fillText(label, badgeX + 4, badgeY + args.badgeSize / 2);
          }

          ctx.globalAlpha = 1.0;
          resolve(canvas.toDataURL("image/png").split(",")[1]);
        };
        img.src = `data:image/png;base64,${args.imageData}`;
      });
    },
    {
      imageData: screenshotBuffer.toString("base64"),
      elements: elementsWithBounds.map((el, i) => ({
        label: annotationMap[i].label,
        bounds: el.bounds!,
      })),
      badgeColor,
      badgeTextColor,
      badgeSize,
      badgeFont,
      showBox,
      boxColor,
      boxWidth,
      boxStyle,
      opacity,
    }
  );

  return {
    buffer: Buffer.from(annotatedBase64, "base64"),
    map: annotationMap,
  };
}

// =============================================================================
// Agent Extract
// =============================================================================

export async function handleAgentExtract(
  state: ClientState,
  params: AgentExtractParams,
  ctx: HandlerContext
): Promise<AgentExtractResult> {
  const page = ctx.getPage(state, params.pageId);
  const timeout = params.timeout ?? ctx.options.timeout ?? 30000;

  try {
    let content: string;
    if (params.selector) {
      const locator = ctx.resolveSelector(page, params.selector);
      await locator.waitFor({ state: "visible", timeout });
      content = (await locator.textContent()) ?? "";
    } else {
      content = (await page.textContent("body")) ?? "";
    }

    const extractedData = await extractDataFromContent(
      page,
      content,
      params.instruction,
      params.schema,
      params.mode ?? "single",
      params.includeSourceRefs ?? false
    );

    return {
      success: true,
      data: extractedData.data,
      sources: extractedData.sources,
      confidence: extractedData.confidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    return {
      success: false,
      data: null,
      error: message,
    };
  }
}
