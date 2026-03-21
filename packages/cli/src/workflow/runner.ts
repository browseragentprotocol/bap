/**
 * @fileoverview Workflow runner — executes workflow steps sequentially
 * @module @browseragentprotocol/cli/workflow/runner
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type {
  WorkflowDef,
  WorkflowAssertion,
  WorkflowStepResult,
  WorkflowResult,
} from "./types.js";
import { substituteParams } from "./parser.js";

/**
 * Execute a workflow against a connected BAPClient.
 * Steps run sequentially. Assertions checked after each step.
 * Stops on first failure unless continueOnError is true.
 */
export async function runWorkflow(
  def: WorkflowDef,
  client: BAPClient,
  params: Record<string, string> = {},
  options: { continueOnError?: boolean } = {}
): Promise<WorkflowResult> {
  const mergedParams = { ...def.params, ...params };
  const results: WorkflowStepResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < def.steps.length; i++) {
    const step = def.steps[i]!;
    const stepStart = Date.now();
    const args = substituteParams(step.args, mergedParams);

    let status: "pass" | "fail" | "error" = "pass";
    let error: string | undefined;

    try {
      await executeStep(client, step.type, args, step.observe);

      // Run assertions
      if (step.assert) {
        const assertError = await checkAssertions(client, step.assert);
        if (assertError) {
          status = "fail";
          error = assertError;
        }
      }
    } catch (err) {
      status = "error";
      error = err instanceof Error ? err.message : String(err);
    }

    results.push({
      step: i + 1,
      type: step.type,
      label: step.label,
      status,
      duration: Date.now() - stepStart,
      error,
    });

    if (status !== "pass" && !options.continueOnError) {
      break;
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status !== "pass").length;

  return {
    name: def.name,
    status: failed === 0 ? "pass" : "fail",
    steps: results,
    totalDuration: Date.now() - startTime,
    passed,
    failed,
  };
}

async function executeStep(
  client: BAPClient,
  type: string,
  args: string,
  observe?: boolean
): Promise<void> {
  switch (type) {
    case "goto":
      await client.navigate(args, observe ? { observe: {} } : undefined);
      break;

    case "act": {
      // Parse composite action string into steps
      const { parseCompositeSteps, toExecutionSteps } =
        await import("../selectors/composite-parser.js");
      const parsed = parseCompositeSteps(args.split(/\s+/));
      const steps = toExecutionSteps(parsed);
      await client.act({ steps, postObserve: observe ? {} : undefined });
      break;
    }

    case "click":
      await client.click({ type: "text", value: args });
      break;

    case "fill": {
      // Format: "selector=value"
      const eqIdx = args.indexOf("=");
      if (eqIdx > 0) {
        const selector = args.slice(0, eqIdx).trim();
        const value = args.slice(eqIdx + 1).trim();
        await client.fill({ type: "text", value: selector }, value);
      }
      break;
    }

    case "observe":
      await client.observe({ maxElements: 50 });
      break;

    case "extract":
      await client.extract({
        instruction: `Extract fields: ${args}`,
        schema: {
          type: "object",
          properties: Object.fromEntries(
            args.split(",").map((f) => [f.trim(), { type: "string" as const }])
          ),
        },
      });
      break;

    case "screenshot":
      await client.screenshot();
      break;

    case "scroll":
      await client.scroll(undefined, { direction: "down", amount: parseInt(args, 10) || 300 });
      break;

    case "wait": {
      const ms = parseInt(args, 10) || 1000;
      await new Promise((resolve) => setTimeout(resolve, ms));
      break;
    }

    default:
      throw new Error(`Unknown workflow step type: ${type}`);
  }
}

async function checkAssertions(
  client: BAPClient,
  assert: WorkflowAssertion
): Promise<string | null> {
  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });

  if (assert.url) {
    const currentUrl = obs.metadata?.url ?? "";
    if (!currentUrl.includes(assert.url)) {
      return `URL assertion failed: expected "${assert.url}" in "${currentUrl}"`;
    }
  }

  if (assert.text) {
    // Check if text is visible on the page
    try {
      const content = await client.command<{ content: string }>("observe/content", {
        format: "text",
      });
      if (!content.content.includes(assert.text)) {
        return `Text assertion failed: "${assert.text}" not found on page`;
      }
    } catch {
      return `Text assertion failed: could not read page content`;
    }
  }

  if (assert.element) {
    try {
      const result = await client.command<{ found: boolean }>("observe/element", {
        selector: { type: "text", value: assert.element },
      });
      if (!result.found) {
        return `Element assertion failed: "${assert.element}" not found`;
      }
    } catch {
      return `Element assertion failed: "${assert.element}" not found`;
    }
  }

  return null;
}
