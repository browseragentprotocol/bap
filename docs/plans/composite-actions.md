# Implementation Plan: Composite Actions (Feature 1)

**Status**: ✅ IMPLEMENTED

## Overview

This plan details the implementation of Composite Actions for BAP v0.2.0. The feature enables AI agents to execute multi-step action sequences in a single round-trip and get AI-optimized observations for planning.

**Key Design Principle**: The server remains a **deterministic executor**—no LLM on the server. AI reasoning stays with the client (MCP host, agent framework). This keeps infrastructure simple and avoids prompt injection risks.

> **Implementation Note**: This feature was implemented as `agent/act`, `agent/observe`, and `agent/extract` methods. See the protocol types in `packages/protocol/src/types/agent.ts` and server implementation in `packages/server-playwright/src/server.ts`.

---

## New Methods

| Method | Purpose |
|--------|---------|
| `agent/execute` | Execute a pre-planned sequence of atomic actions |
| `agent/snapshot` | Get an AI-optimized page snapshot for planning |

---

## Phase 1: Protocol Types

**Package**: `@browseragentprotocol/protocol`
**Files**: `packages/protocol/src/types/methods.ts`, `packages/protocol/src/types/agent.ts` (new)

### 1.1 Create Agent Types File

Create `packages/protocol/src/types/agent.ts`:

```typescript
import { z } from "zod";
import { BAPSelectorSchema } from "./selectors.js";
import { AccessibilityNodeSchema } from "./accessibility.js";
import { BAPErrorDataSchema } from "./errors.js";

// =============================================================================
// agent/execute - Multi-step action execution
// =============================================================================

/**
 * Pre-condition for a step (must be true before step executes)
 */
export const StepConditionSchema = z.object({
  /** Element that must exist/match condition */
  selector: BAPSelectorSchema,
  /** Required state of the element */
  state: z.enum(["visible", "enabled", "exists", "hidden", "disabled"]),
  /** Timeout for condition check (ms) */
  timeout: z.number().optional(),
});
export type StepCondition = z.infer<typeof StepConditionSchema>;

/**
 * Error handling strategy for a step
 */
export const StepErrorHandlingSchema = z.enum([
  "stop",      // Stop execution, return error (default)
  "skip",      // Skip this step, continue to next
  "retry",     // Retry this step (with backoff)
]);
export type StepErrorHandling = z.infer<typeof StepErrorHandlingSchema>;

/**
 * A single step in an action sequence
 */
export const ExecutionStepSchema = z.object({
  /** Human-readable label for this step (for logging/debugging) */
  label: z.string().optional(),

  /** The BAP method to execute (e.g., "action/click", "action/fill") */
  action: z.string(),

  /** Parameters for the action */
  params: z.record(z.unknown()),

  /** Pre-condition that must be met before executing */
  condition: StepConditionSchema.optional(),

  /** How to handle errors for this step */
  onError: StepErrorHandlingSchema.optional(),

  /** Max retries if onError is "retry" */
  maxRetries: z.number().min(1).max(5).optional(),

  /** Delay between retries (ms) */
  retryDelay: z.number().min(100).max(5000).optional(),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

/**
 * Parameters for agent/execute
 */
export const AgentExecuteParamsSchema = z.object({
  /** Page to execute on (defaults to active page) */
  pageId: z.string().optional(),

  /** Sequence of steps to execute */
  steps: z.array(ExecutionStepSchema).min(1).max(50),

  /** Stop on first error (default: true) */
  stopOnFirstError: z.boolean().optional(),

  /** Continue execution even if a condition fails (default: false) */
  continueOnConditionFail: z.boolean().optional(),

  /** Global timeout for entire sequence (ms) */
  timeout: z.number().optional(),
});
export type AgentExecuteParams = z.infer<typeof AgentExecuteParamsSchema>;

/**
 * Result of a single step execution
 */
export const StepResultSchema = z.object({
  /** Step index (0-based) */
  step: z.number(),

  /** Step label if provided */
  label: z.string().optional(),

  /** Whether step succeeded */
  success: z.boolean(),

  /** Result data from the action (if any) */
  result: z.unknown().optional(),

  /** Error if step failed */
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: BAPErrorDataSchema.optional(),
  }).optional(),

  /** Time taken for this step (ms) */
  duration: z.number(),

  /** Number of retries attempted */
  retries: z.number().optional(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

/**
 * Result of agent/execute
 */
export const AgentExecuteResultSchema = z.object({
  /** Number of steps completed successfully */
  completed: z.number(),

  /** Total number of steps */
  total: z.number(),

  /** Whether all steps succeeded */
  success: z.boolean(),

  /** Results for each step (in order) */
  results: z.array(StepResultSchema),

  /** Total execution time (ms) */
  duration: z.number(),

  /** Index of first failed step (if any) */
  failedAt: z.number().optional(),
});
export type AgentExecuteResult = z.infer<typeof AgentExecuteResultSchema>;

// =============================================================================
// agent/snapshot - AI-optimized page observation
// =============================================================================

/**
 * Action hint for an interactive element
 */
export const ActionHintSchema = z.enum([
  "clickable",
  "editable",
  "selectable",
  "checkable",
  "expandable",
  "draggable",
  "scrollable",
  "submittable",
]);
export type ActionHint = z.infer<typeof ActionHintSchema>;

/**
 * Interactive element with pre-computed selector
 */
export const InteractiveElementSchema = z.object({
  /** Element reference ID (e.g., "@e1") */
  ref: z.string(),

  /** Pre-computed selector that targets this element */
  selector: BAPSelectorSchema,

  /** ARIA role */
  role: z.string(),

  /** Accessible name */
  name: z.string().optional(),

  /** Current value (for inputs) */
  value: z.string().optional(),

  /** What actions can be performed */
  actionHints: z.array(ActionHintSchema),

  /** Bounding box (if requested) */
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),

  /** Tag name */
  tagName: z.string(),

  /** Whether element is focused */
  focused: z.boolean().optional(),

  /** Whether element is disabled */
  disabled: z.boolean().optional(),
});
export type InteractiveElement = z.infer<typeof InteractiveElementSchema>;

/**
 * Parameters for agent/snapshot
 */
export const AgentSnapshotParamsSchema = z.object({
  /** Page to snapshot (defaults to active page) */
  pageId: z.string().optional(),

  /** Include full accessibility tree */
  includeAccessibility: z.boolean().optional(),

  /** Include screenshot (base64) */
  includeScreenshot: z.boolean().optional(),

  /** Include list of interactive elements with selectors */
  includeInteractiveElements: z.boolean().optional(),

  /** Include page metadata (title, URL) */
  includeMetadata: z.boolean().optional(),

  /** Max elements to return (for token efficiency) */
  maxElements: z.number().min(1).max(200).optional(),

  /** Filter to specific ARIA roles */
  filterRoles: z.array(z.string()).optional(),

  /** Include bounding boxes for elements */
  includeBounds: z.boolean().optional(),
});
export type AgentSnapshotParams = z.infer<typeof AgentSnapshotParamsSchema>;

/**
 * Result of agent/snapshot
 */
export const AgentSnapshotResultSchema = z.object({
  /** Page metadata */
  metadata: z.object({
    url: z.string(),
    title: z.string(),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
    }),
  }).optional(),

  /** Accessibility tree (if requested) */
  accessibility: z.object({
    tree: z.array(AccessibilityNodeSchema),
  }).optional(),

  /** Screenshot data (if requested) */
  screenshot: z.object({
    data: z.string(),
    format: z.enum(["png", "jpeg", "webp"]),
    width: z.number(),
    height: z.number(),
  }).optional(),

  /** Interactive elements with selectors (if requested) */
  interactiveElements: z.array(InteractiveElementSchema).optional(),

  /** Total interactive elements on page (may be more than returned) */
  totalInteractiveElements: z.number().optional(),
});
export type AgentSnapshotResult = z.infer<typeof AgentSnapshotResultSchema>;
```

### 1.2 Update Methods Index

Update `packages/protocol/src/types/methods.ts`:

```typescript
// Add to imports
import {
  AgentExecuteParamsSchema,
  AgentExecuteResultSchema,
  AgentSnapshotParamsSchema,
  AgentSnapshotResultSchema,
} from "./agent.js";

// Add to BAPMethodSchema enum
export const BAPMethodSchema = z.enum([
  // ... existing methods ...

  // Agent methods (new)
  "agent/execute",
  "agent/snapshot",
]);

// Add to exports
export * from "./agent.js";
```

### 1.3 Update Protocol Index

Update `packages/protocol/src/index.ts` to export agent types.

---

## Phase 2: Server Implementation

**Package**: `@browseragentprotocol/server-playwright`
**File**: `packages/server-playwright/src/server.ts`

### 2.1 Add Scope Mappings

Add to `METHOD_SCOPES` map:

```typescript
const METHOD_SCOPES: Record<string, string[]> = {
  // ... existing mappings ...

  // Agent methods
  "agent/execute": ["agent:execute", "agent:*", "*"],
  "agent/snapshot": ["agent:snapshot", "observe:*", "agent:*", "*"],
};
```

### 2.2 Add Dispatch Cases

Add to `dispatch()` method:

```typescript
case "agent/execute":
  return this.handleAgentExecute(state, params as AgentExecuteParams);

case "agent/snapshot":
  return this.handleAgentSnapshot(state, params as AgentSnapshotParams);
```

### 2.3 Implement handleAgentExecute

```typescript
/**
 * Execute a sequence of actions atomically
 */
private async handleAgentExecute(
  state: ClientState,
  params: AgentExecuteParams
): Promise<AgentExecuteResult> {
  const startTime = Date.now();
  const page = this.getPage(state, params.pageId);

  const results: StepResult[] = [];
  let completed = 0;
  let failedAt: number | undefined;

  const stopOnFirstError = params.stopOnFirstError ?? true;
  const globalTimeout = params.timeout ?? this.options.timeout ?? 30000;

  // Create a timeout promise for the entire sequence
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new BAPTimeoutError("Sequence timeout exceeded")), globalTimeout);
  });

  try {
    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i];
      const stepStart = Date.now();

      // Check if we've exceeded global timeout
      if (Date.now() - startTime >= globalTimeout) {
        throw new BAPTimeoutError("Sequence timeout exceeded");
      }

      let stepResult: StepResult;

      try {
        // Check pre-condition if specified
        if (step.condition) {
          const conditionMet = await this.checkStepCondition(page, step.condition);
          if (!conditionMet) {
            if (params.continueOnConditionFail) {
              stepResult = {
                step: i,
                label: step.label,
                success: false,
                error: {
                  code: ErrorCodes.ConditionFailed,
                  message: `Condition not met: ${step.condition.state} for selector`,
                },
                duration: Date.now() - stepStart,
              };
              results.push(stepResult);
              continue;
            }
            throw new BAPError(ErrorCodes.ConditionFailed, "Step condition not met");
          }
        }

        // Execute the action with retry support
        const actionResult = await this.executeStepWithRetry(state, step, page);

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
        const bapError = this.toBAPError(error);

        stepResult = {
          step: i,
          label: step.label,
          success: false,
          error: {
            code: bapError.code,
            message: bapError.message,
            data: bapError.data,
          },
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
  } catch (error) {
    // Global timeout or other fatal error
    const bapError = this.toBAPError(error);
    if (results.length < params.steps.length && !failedAt) {
      failedAt = results.length;
    }
  }

  return {
    completed,
    total: params.steps.length,
    success: completed === params.steps.length,
    results,
    duration: Date.now() - startTime,
    failedAt,
  };
}

/**
 * Execute a single step with retry support
 */
private async executeStepWithRetry(
  state: ClientState,
  step: ExecutionStep,
  page: Page
): Promise<{ result: unknown; retries: number }> {
  const maxRetries = step.onError === "retry" ? (step.maxRetries ?? 3) : 1;
  const retryDelay = step.retryDelay ?? 500;

  let lastError: Error | null = null;
  let retries = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Validate the action is allowed
      const allowedActions = [
        "action/click", "action/fill", "action/type", "action/press",
        "action/hover", "action/scroll", "action/select", "action/check",
        "action/uncheck", "action/clear", "action/upload", "action/drag",
        "page/navigate", "page/reload", "page/goBack", "page/goForward",
      ];

      if (!allowedActions.includes(step.action)) {
        throw new BAPError(
          ErrorCodes.InvalidParams,
          `Action not allowed in execute: ${step.action}`
        );
      }

      // Dispatch to the actual handler
      const result = await this.dispatch(
        state.ws,
        state,
        step.action,
        { ...step.params, pageId: page.url() }
      );

      return { result, retries };

    } catch (error) {
      lastError = error as Error;
      retries = attempt + 1;

      if (attempt < maxRetries - 1 && step.onError === "retry") {
        await this.sleep(retryDelay * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  throw lastError;
}

/**
 * Check a step pre-condition
 */
private async checkStepCondition(
  page: Page,
  condition: StepCondition
): Promise<boolean> {
  const timeout = condition.timeout ?? 5000;
  const locator = this.toLocator(page, condition.selector);

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

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 2.4 Implement handleAgentSnapshot

```typescript
/**
 * Get an AI-optimized snapshot of the page
 */
private async handleAgentSnapshot(
  state: ClientState,
  params: AgentSnapshotParams
): Promise<AgentSnapshotResult> {
  const page = this.getPage(state, params.pageId);
  const result: AgentSnapshotResult = {};

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
    const snapshot = await page.accessibility.snapshot();
    result.accessibility = {
      tree: snapshot ? this.convertAccessibilityTree(snapshot) : [],
    };
  }

  // Screenshot
  if (params.includeScreenshot) {
    const buffer = await page.screenshot({ type: "png" });
    const viewport = page.viewportSize();
    result.screenshot = {
      data: buffer.toString("base64"),
      format: "png",
      width: viewport?.width ?? 0,
      height: viewport?.height ?? 0,
    };
  }

  // Interactive elements
  if (params.includeInteractiveElements) {
    const elements = await this.getInteractiveElements(page, {
      maxElements: params.maxElements ?? 100,
      filterRoles: params.filterRoles,
      includeBounds: params.includeBounds ?? false,
    });
    result.interactiveElements = elements.elements;
    result.totalInteractiveElements = elements.total;
  }

  return result;
}

/**
 * Get interactive elements with pre-computed selectors
 */
private async getInteractiveElements(
  page: Page,
  options: {
    maxElements: number;
    filterRoles?: string[];
    includeBounds: boolean;
  }
): Promise<{ elements: InteractiveElement[]; total: number }> {
  // Use page.evaluate for performance (single round-trip)
  const rawElements = await page.evaluate((opts) => {
    const selectors = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '[role="slider"]',
      '[contenteditable="true"]',
      '[onclick]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const elements = Array.from(document.querySelectorAll(selectors));

    return elements
      .filter(el => {
        // Filter out hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return true;
      })
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const role = el.getAttribute('role') || el.tagName.toLowerCase();

        // Determine action hints
        const hints: string[] = [];
        if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
          hints.push('clickable');
        }
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable')) {
          hints.push('editable');
        }
        if (el.tagName === 'SELECT') {
          hints.push('selectable');
        }
        if (el.getAttribute('type') === 'checkbox' || el.getAttribute('role') === 'checkbox') {
          hints.push('checkable');
        }

        // Build the best selector for this element
        let selectorValue = '';
        let selectorType = 'css';

        const ariaLabel = el.getAttribute('aria-label');
        const text = el.textContent?.trim().slice(0, 50);
        const testId = el.getAttribute('data-testid');
        const name = el.getAttribute('name');
        const id = el.getAttribute('id');

        if (testId) {
          selectorType = 'testId';
          selectorValue = testId;
        } else if (ariaLabel) {
          selectorType = 'role';
          selectorValue = JSON.stringify({ role, name: ariaLabel });
        } else if (text && text.length < 50) {
          selectorType = 'text';
          selectorValue = text;
        } else if (id) {
          selectorType = 'css';
          selectorValue = `#${id}`;
        } else if (name) {
          selectorType = 'css';
          selectorValue = `[name="${name}"]`;
        } else {
          // Fallback to nth-child path
          selectorType = 'css';
          selectorValue = getCssPath(el);
        }

        return {
          index,
          role,
          name: ariaLabel || text || undefined,
          value: (el as HTMLInputElement).value || undefined,
          tagName: el.tagName.toLowerCase(),
          focused: document.activeElement === el,
          disabled: (el as HTMLButtonElement).disabled || false,
          actionHints: hints,
          selectorType,
          selectorValue,
          bounds: opts.includeBounds ? {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          } : undefined,
        };
      });

    function getCssPath(el: Element): string {
      const path: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector = `#${current.id}`;
          path.unshift(selector);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }
        path.unshift(selector);
        current = parent;
      }
      return path.join(' > ');
    }
  }, { includeBounds: options.includeBounds });

  const total = rawElements.length;

  // Apply filters and limit
  let filtered = rawElements;
  if (options.filterRoles) {
    filtered = filtered.filter(el => options.filterRoles!.includes(el.role));
  }
  filtered = filtered.slice(0, options.maxElements);

  // Convert to InteractiveElement format with proper selectors
  const elements: InteractiveElement[] = filtered.map((el, i) => {
    let selector: BAPSelector;

    if (el.selectorType === 'testId') {
      selector = { type: 'testId', value: el.selectorValue };
    } else if (el.selectorType === 'role') {
      const parsed = JSON.parse(el.selectorValue);
      selector = { type: 'role', role: parsed.role, name: parsed.name };
    } else if (el.selectorType === 'text') {
      selector = { type: 'text', value: el.selectorValue };
    } else {
      selector = { type: 'css', value: el.selectorValue };
    }

    return {
      ref: `@e${i + 1}`,
      selector,
      role: el.role,
      name: el.name,
      value: el.value,
      actionHints: el.actionHints as ActionHint[],
      bounds: el.bounds,
      tagName: el.tagName,
      focused: el.focused,
      disabled: el.disabled,
    };
  });

  return { elements, total };
}
```

### 2.5 Security Hardening

Add validation in `handleAgentExecute`:

```typescript
// Validate all steps before execution
for (const step of params.steps) {
  // Check scope for each action
  const requiredScopes = METHOD_SCOPES[step.action];
  if (requiredScopes && !this.hasScope(state.scopes, requiredScopes)) {
    throw new BAPError(
      ErrorCodes.AuthorizationError,
      `Insufficient scope for action: ${step.action}`
    );
  }

  // Validate params don't contain sensitive overrides
  if (step.params.pageId && step.params.pageId !== params.pageId) {
    throw new BAPError(
      ErrorCodes.InvalidParams,
      "Cannot override pageId in step params"
    );
  }

  // Redact credentials in params
  if (step.action === "action/fill" || step.action === "action/type") {
    step.params = this.redactSensitiveParams(step.params);
  }
}
```

---

## Phase 3: Client Implementation

**Package**: `@browseragentprotocol/client`
**File**: `packages/client/src/index.ts`

### 3.1 Add Client Methods

```typescript
/**
 * Execute a sequence of actions in a single request
 */
async execute(params: AgentExecuteParams): Promise<AgentExecuteResult> {
  return this.request<AgentExecuteResult>("agent/execute", {
    pageId: params.pageId ?? this.activePage,
    steps: params.steps,
    stopOnFirstError: params.stopOnFirstError,
    continueOnConditionFail: params.continueOnConditionFail,
    timeout: params.timeout,
  });
}

/**
 * Get an AI-optimized snapshot of the current page
 */
async snapshot(params?: AgentSnapshotParams): Promise<AgentSnapshotResult> {
  return this.request<AgentSnapshotResult>("agent/snapshot", {
    pageId: params?.pageId ?? this.activePage,
    includeAccessibility: params?.includeAccessibility,
    includeScreenshot: params?.includeScreenshot,
    includeInteractiveElements: params?.includeInteractiveElements,
    includeMetadata: params?.includeMetadata,
    maxElements: params?.maxElements,
    filterRoles: params?.filterRoles,
    includeBounds: params?.includeBounds,
  });
}

/**
 * Helper to build an execution step
 */
static step(
  action: string,
  params: Record<string, unknown>,
  options?: {
    label?: string;
    condition?: StepCondition;
    onError?: StepErrorHandling;
    maxRetries?: number;
    retryDelay?: number;
  }
): ExecutionStep {
  return {
    action,
    params,
    label: options?.label,
    condition: options?.condition,
    onError: options?.onError,
    maxRetries: options?.maxRetries,
    retryDelay: options?.retryDelay,
  };
}
```

### 3.2 Export Types

Add to client exports:

```typescript
export type {
  AgentExecuteParams,
  AgentExecuteResult,
  AgentSnapshotParams,
  AgentSnapshotResult,
  ExecutionStep,
  StepResult,
  StepCondition,
  StepErrorHandling,
  InteractiveElement,
  ActionHint,
} from "@browseragentprotocol/protocol";
```

---

## Phase 4: MCP Integration

**Package**: `@browseragentprotocol/mcp`
**File**: `packages/mcp/src/index.ts`

### 4.1 Add MCP Tools

```typescript
// Add to TOOLS array
{
  name: "browser_execute",
  description: `Execute a sequence of browser actions in a single call.
    Useful for multi-step flows like login, form submission, or navigation sequences.
    Each step can have conditions and error handling.`,
  inputSchema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        description: "Array of action steps to execute in order",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Human-readable label for this step",
            },
            action: {
              type: "string",
              description: "BAP action to execute (e.g., 'action/click', 'action/fill')",
              enum: [
                "action/click", "action/fill", "action/type", "action/press",
                "action/hover", "action/scroll", "action/select",
                "page/navigate", "page/reload",
              ],
            },
            selector: {
              type: "string",
              description: "Element selector (e.g., 'role:button:Submit', 'text:Login')",
            },
            value: {
              type: "string",
              description: "Value for fill/type actions",
            },
            url: {
              type: "string",
              description: "URL for navigate action",
            },
          },
          required: ["action"],
        },
      },
      stopOnFirstError: {
        type: "boolean",
        description: "Stop execution if any step fails (default: true)",
      },
    },
    required: ["steps"],
  },
},
{
  name: "browser_snapshot",
  description: `Get an AI-optimized snapshot of the current page.
    Returns interactive elements with pre-computed selectors, making it easy to determine
    what actions are possible on the page.`,
  inputSchema: {
    type: "object",
    properties: {
      includeScreenshot: {
        type: "boolean",
        description: "Include a screenshot of the page",
      },
      includeAccessibility: {
        type: "boolean",
        description: "Include the full accessibility tree",
      },
      maxElements: {
        type: "number",
        description: "Maximum number of interactive elements to return (default: 50)",
      },
    },
  },
},
```

### 4.2 Add Tool Handlers

```typescript
case "browser_execute": {
  const client = await this.ensureClient();

  // Convert MCP steps format to BAP format
  const steps: ExecutionStep[] = (args.steps as any[]).map(s => {
    const step: ExecutionStep = {
      label: s.label,
      action: s.action,
      params: {},
    };

    if (s.selector) {
      step.params.selector = parseSelector(s.selector);
    }
    if (s.value !== undefined) {
      step.params.value = s.value;
    }
    if (s.url) {
      step.params.url = s.url;
    }

    return step;
  });

  const result = await client.execute({
    steps,
    stopOnFirstError: args.stopOnFirstError as boolean ?? true,
  });

  // Format result for AI consumption
  const summary = result.success
    ? `✓ Executed ${result.completed}/${result.total} steps successfully`
    : `✗ Failed at step ${result.failedAt}: ${result.results[result.failedAt!]?.error?.message}`;

  const stepDetails = result.results.map(r =>
    `${r.success ? '✓' : '✗'} Step ${r.step + 1}${r.label ? ` (${r.label})` : ''}: ${
      r.success ? 'OK' : r.error?.message
    }`
  ).join('\n');

  return {
    content: [{
      type: "text",
      text: `${summary}\n\n${stepDetails}\n\nTotal time: ${result.duration}ms`,
    }],
    isError: !result.success,
  };
}

case "browser_snapshot": {
  const client = await this.ensureClient();

  const result = await client.snapshot({
    includeScreenshot: args.includeScreenshot as boolean,
    includeAccessibility: args.includeAccessibility as boolean,
    includeInteractiveElements: true,
    includeMetadata: true,
    maxElements: args.maxElements as number ?? 50,
  });

  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

  // Metadata
  if (result.metadata) {
    content.push({
      type: "text",
      text: `Page: ${result.metadata.title}\nURL: ${result.metadata.url}\nViewport: ${result.metadata.viewport.width}x${result.metadata.viewport.height}`,
    });
  }

  // Interactive elements (formatted for AI)
  if (result.interactiveElements && result.interactiveElements.length > 0) {
    const elementList = result.interactiveElements.map((el, i) => {
      const selector = formatSelectorForMCP(el.selector);
      const hints = el.actionHints.join(', ');
      return `[${i + 1}] ${el.role}${el.name ? `: "${el.name}"` : ''} - ${selector} (${hints})`;
    }).join('\n');

    content.push({
      type: "text",
      text: `\nInteractive Elements (${result.interactiveElements.length}/${result.totalInteractiveElements}):\n${elementList}`,
    });
  }

  // Screenshot
  if (result.screenshot) {
    content.push({
      type: "image",
      data: result.screenshot.data,
      mimeType: `image/${result.screenshot.format}`,
    });
  }

  return { content };
}
```

---

## Phase 5: Testing

### 5.1 Unit Tests

Create `packages/protocol/src/__tests__/agent.test.ts`:
- Schema validation tests for all new types
- Edge cases for step validation

Create `packages/server-playwright/src/__tests__/agent.test.ts`:
- Test execute with successful steps
- Test execute with failing steps
- Test error handling modes (stop, skip, retry)
- Test pre-conditions
- Test snapshot with various options

### 5.2 Integration Tests

Create `packages/client/src/__tests__/agent.integration.test.ts`:
- End-to-end test of execute flow
- Test snapshot returns valid selectors
- Test selectors from snapshot work in actions

---

## Phase 6: Documentation

### 6.1 Update README Files

Update `packages/protocol/README.md`:
- Document new agent types
- Show example schemas

Update `packages/server-playwright/README.md`:
- Document new methods
- Security considerations

Update `packages/client/README.md`:
- Document execute() and snapshot() methods
- Show usage examples

Update `packages/mcp/README.md`:
- Document browser_execute and browser_snapshot tools
- Show example conversations

### 6.2 Update CLAUDE.md

Add agent methods to the MCP tools list.

---

## Checklist

### Protocol Package
- [ ] Create `packages/protocol/src/types/agent.ts`
- [ ] Add Zod schemas for AgentExecuteParams, AgentExecuteResult
- [ ] Add Zod schemas for AgentSnapshotParams, AgentSnapshotResult
- [ ] Add ExecutionStep, StepResult, StepCondition schemas
- [ ] Add InteractiveElement, ActionHint schemas
- [ ] Update methods.ts with new method names
- [ ] Export all new types from index.ts
- [ ] Add unit tests for schema validation

### Server Package
- [ ] Add agent/* methods to METHOD_SCOPES
- [ ] Add dispatch cases for agent/execute, agent/snapshot
- [ ] Implement handleAgentExecute with step execution
- [ ] Implement step condition checking
- [ ] Implement retry logic with exponential backoff
- [ ] Implement handleAgentSnapshot
- [ ] Implement getInteractiveElements with selector generation
- [ ] Add security validation (scope checking, param redaction)
- [ ] Add integration tests

### Client Package
- [ ] Add execute() method
- [ ] Add snapshot() method
- [ ] Add static step() helper
- [ ] Export new types
- [ ] Add usage examples in tests

### MCP Package
- [ ] Add browser_execute tool definition
- [ ] Add browser_snapshot tool definition
- [ ] Implement tool handlers
- [ ] Add selector formatting for AI output
- [ ] Update README with examples

### Documentation
- [ ] Update all package READMEs
- [ ] Update CLAUDE.md
- [ ] Add CHANGELOG entry

---

## Security Considerations

1. **Allowed Actions Whitelist**: Only specific actions can be used in execute sequences
2. **Scope Validation**: Each step's action checked against client scopes
3. **No pageId Override**: Steps cannot target different pages than the sequence
4. **Credential Redaction**: Fill/type actions have values redacted in logs
5. **Rate Limiting**: Execute counts as N actions for rate limiting (where N = step count)
6. **Timeout Protection**: Global timeout prevents runaway sequences
7. **Max Steps Limit**: Sequences capped at 50 steps to prevent abuse

---

## Migration Notes

This is an **additive change** with no breaking changes:
- New methods added, existing methods unchanged
- New scopes added, existing scopes unchanged
- Clients not using new features are unaffected
