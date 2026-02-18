/**
 * bap goto <url> — Navigate to URL
 *
 * Fusion: --observe flag fuses navigate + observe into 1 server call
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { AgentObserveResult } from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { printPageSummary, printObserveResult } from "../output/formatter.js";
import { register } from "./registry.js";

async function gotoCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const url = args[0];
  if (!url) {
    console.error("Usage: bap goto <url>");
    console.error("Flags: --observe (fused observation), --max=N, --tier=<full|interactive|minimal>");
    process.exit(1);
  }

  // Fusion path: --observe flag fuses navigate + observe into 1 call
  if (flags.observe) {
    const result = await client.navigate(url, {
      observe: {
        includeMetadata: true,
        includeInteractiveElements: true,
        maxElements: flags.max ?? 50,
        responseTier: (flags.tier as "full" | "interactive" | "minimal") ?? undefined,
      },
    });

    const observation = (result as Record<string, unknown>).observation as AgentObserveResult | undefined;

    if (observation) {
      printObserveResult(observation);
    } else {
      printPageSummary(result.url);
    }
    return;
  }

  // Default path
  const result = await client.navigate(url);
  printPageSummary(result.url);
}

register("goto", gotoCommand);
