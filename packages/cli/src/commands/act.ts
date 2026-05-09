/**
 * bap act <step1> <step2> ... — Execute multiple steps atomically
 *
 * This is the killer feature. A login flow that costs playwright-cli
 * 3 commands / 3 snapshots / 3 LLM reasoning cycles costs BAP 1 command / 1 snapshot / 1 cycle.
 *
 * Fusion: --observe flag fuses act + post-observe into 1 server call (50% token reduction)
 *
 * Examples:
 *   bap act fill:e5="user@example.com" fill:e8="password" click:e12
 *   bap act fill:role:textbox:"Email"="user@example.com" \
 *           fill:role:textbox:"Password"="secret123" \
 *           click:role:button:"Sign in"
 *   bap act click:e3 --observe  # fused act+observe (1 call)
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type {
  AgentObserveParams,
  AgentObserveResult,
  SessionInfo,
  TrustSurface,
} from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { parseCompositeSteps, toExecutionSteps } from "../selectors/composite-parser.js";
import {
  printActAudit,
  printActPlan,
  printActResult,
  printObserveResult,
  type RiskClass,
} from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

function sessionIdFor(flags: GlobalFlags): string {
  return flags.session ?? `cli-${flags.port}`;
}

function selectorText(step: ReturnType<typeof parseCompositeSteps>[number]): string | undefined {
  if (step.url) {
    return step.url;
  }
  if (step.key) {
    return step.key;
  }
  if (!step.selector) {
    return undefined;
  }

  switch (step.selector.type) {
    case "role":
      return `role:${step.selector.role}${step.selector.name ? `:${step.selector.name}` : ""}`;
    case "text":
    case "label":
    case "placeholder":
    case "testId":
    case "css":
    case "xpath":
      return step.selector.value;
    case "ref":
      return step.selector.ref;
    case "coordinates":
      return `${step.selector.x},${step.selector.y}`;
    default:
      return undefined;
  }
}

function classifyRisk(step: ReturnType<typeof parseCompositeSteps>[number]): RiskClass[] {
  const risk = new Set<RiskClass>();
  const selector = selectorText(step)?.toLowerCase() ?? "";
  const value = step.value?.toLowerCase() ?? "";

  if (step.action.startsWith("observe/")) {
    risk.add("observe");
  }

  if (
    step.action === "page/navigate" ||
    step.action === "page/goBack" ||
    step.action === "page/goForward" ||
    step.action === "page/reload"
  ) {
    risk.add("navigate");
  }

  if (step.action.startsWith("action/")) {
    risk.add("mutate");
  }

  if (step.action === "action/upload") {
    risk.add("upload/download");
  }

  if (
    step.action === "action/press" && step.key?.toLowerCase() === "enter" ||
    /(submit|sign in|log in|login|checkout|place order|confirm|save)/.test(selector)
  ) {
    risk.add("submit");
  }

  if (
    /(password|passcode|otp|token|secret|credential|username|email|login)/.test(selector) ||
    /(password|token|secret)/.test(value)
  ) {
    risk.add("credential-affecting");
  }

  return Array.from(risk);
}

function deltaSummary(observation?: AgentObserveResult): string | undefined {
  const changes = observation?.changes;
  if (!changes) {
    return undefined;
  }
  return `+${changes.added.length} ~${changes.updated.length} -${changes.removed.length}`;
}

async function getTrustSurface(client: BAPClient, flags: GlobalFlags): Promise<TrustSurface | undefined> {
  const result = await client.listSessions();
  const current = result.sessions.find((session: SessionInfo) => session.sessionId === sessionIdFor(flags));
  return current?.trust;
}

export async function actCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  if (args.length === 0) {
    console.error("Usage: bap act <step1> <step2> ...");
    console.error("");
    console.error("Steps use the syntax: action:selector=value or action:selector");
    console.error("Flags: --observe, --tier=<full|interactive|minimal>, --explain, --audit");
    console.error("");
    console.error("Examples:");
    console.error('  bap act fill:e5="user@example.com" fill:e8="pass" click:e12');
    console.error('  bap act fill:role:textbox:"Email"="user@example.com" \\');
    console.error('          fill:role:textbox:"Password"="secret" \\');
    console.error('          click:role:button:"Sign in"');
    console.error('  bap act click:e3 --observe  # fused act+observe (1 call)');
    console.error('  bap act --explain click:e3');
    console.error('  bap act --audit fill:e5="user@example.com" click:e12');
    process.exit(1);
  }

  // Parse each arg as a composite step
  const parsedSteps = parseCompositeSteps(args);
  const executionSteps = toExecutionSteps(parsedSteps);
  const stepRisk = parsedSteps.map(classifyRisk);
  const overallRisk = Array.from(new Set(stepRisk.flat()));
  const trust = await getTrustSurface(client, flags);

  if (flags.explain || flags.audit) {
    printActPlan({
      fusedObserve: Boolean(flags.observe),
      steps: parsedSteps.map((step, index) => ({
        action: executionSteps[index]!.action,
        target: selectorText(step),
        valuePreview: step.value ? JSON.stringify(step.value.length > 48 ? `${step.value.slice(0, 45)}...` : step.value) : undefined,
        riskClasses: stepRisk[index]!,
      })),
      overallRisk,
      trust,
    });

    if (flags.explain && !flags.audit) {
      return;
    }
  }

  // Fusion path: --observe flag fuses act + post-observe into 1 server call
  if (flags.observe) {
    const postObserve: AgentObserveParams = {
      includeMetadata: true,
      includeInteractiveElements: true,
      maxElements: flags.max ?? 50,
      responseTier: (flags.tier as "full" | "interactive" | "minimal") ?? "interactive",
    };

    const result = await client.act({
      steps: executionSteps,
      stopOnFirstError: true,
      postObserve,
    });

    // Access fused observation from result
    const postObs = (result as Record<string, unknown>).postObservation as AgentObserveResult | undefined;

    printActResult(result, postObs?.metadata?.url, postObs?.metadata?.title);

    if (flags.audit) {
      printActAudit({
        trust,
        overallRisk,
        delta: deltaSummary(postObs),
        steps: result.results.map((step, index) => ({
          index,
          action: executionSteps[index]?.action ?? `step-${index + 1}`,
          status: step.success ? "ok" : "error",
          durationMs: step.duration,
          riskClasses: stepRisk[index] ?? [],
          error: step.error?.message,
          recovery:
            (step.error?.data?.details as { recoveryHint?: string } | undefined)?.recoveryHint,
        })),
      });
    }

    if (postObs) {
      printObserveResult(postObs);
    }
    return;
  }

  // Default path: 3 separate calls (act + ariaSnapshot + observe)
  const result = await client.act({
    steps: executionSteps,
    stopOnFirstError: true,
  });

  // Take a snapshot after execution
  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  // Get page metadata
  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });

  printActResult(result, obs.metadata?.url, obs.metadata?.title, snapshotPath);

  if (flags.audit) {
    printActAudit({
      trust,
      overallRisk,
      steps: result.results.map((step, index) => ({
        index,
        action: executionSteps[index]?.action ?? `step-${index + 1}`,
        status: step.success ? "ok" : "error",
        durationMs: step.duration,
        riskClasses: stepRisk[index] ?? [],
        error: step.error?.message,
        recovery:
          (step.error?.data?.details as { recoveryHint?: string } | undefined)?.recoveryHint,
      })),
    });
  }
}

register("act", actCommand);
