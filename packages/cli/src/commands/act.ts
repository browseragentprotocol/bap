/**
 * bap act <step1> <step2> ... — Execute multiple steps atomically
 *
 * This is the killer feature. A login flow that costs playwright-cli
 * 3 commands / 3 snapshots / ~6000 tokens costs BAP 1 command / 1 snapshot / ~150 tokens.
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
import type { AgentObserveParams, AgentObserveResult } from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { parseCompositeSteps, toExecutionSteps } from "../selectors/composite-parser.js";
import { printActResult, printObserveResult } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function actCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  if (args.length === 0) {
    console.error("Usage: bap act <step1> <step2> ...");
    console.error("");
    console.error("Steps use the syntax: action:selector=value or action:selector");
    console.error("Flags: --observe (fused post-observation), --tier=<full|interactive|minimal>");
    console.error("");
    console.error("Examples:");
    console.error('  bap act fill:e5="user@example.com" fill:e8="pass" click:e12');
    console.error('  bap act fill:role:textbox:"Email"="user@example.com" \\');
    console.error('          fill:role:textbox:"Password"="secret" \\');
    console.error('          click:role:button:"Sign in"');
    console.error('  bap act click:e3 --observe  # fused act+observe (1 call)');
    process.exit(1);
  }

  // Parse each arg as a composite step
  const parsedSteps = parseCompositeSteps(args);
  const executionSteps = toExecutionSteps(parsedSteps);

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
}

register("act", actCommand);
