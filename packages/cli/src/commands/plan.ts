/**
 * bap plan <goal> — Observe page and suggest next actions
 *
 * Usage:
 *   bap plan "login to the site"
 *   bap plan "search for products" --max=5
 */

import { pc } from "@browseragentprotocol/logger";
import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { getOutputFormat } from "../output/formatter.js";
import { register } from "./registry.js";

async function planCommand(args: string[], _flags: GlobalFlags, client: BAPClient): Promise<void> {
  const goal = args.filter((a) => !a.startsWith("--")).join(" ");
  if (!goal) {
    console.error("Usage: bap plan <goal>");
    console.error('Example: bap plan "login to the site"');
    process.exit(1);
  }

  const maxArg = args.find((a) => a.startsWith("--max="));
  const maxSuggestions = maxArg ? parseInt(maxArg.slice(6), 10) : 10;

  const result = await client.command<{
    url: string;
    title: string;
    elements: Array<{
      ref: string;
      role: string;
      name?: string;
      tagName: string;
      actionHints: string[];
    }>;
    suggestions: Array<{ description: string; method: string; relevance: number }>;
    totalElements: number;
  }>("agent/plan", { goal, maxSuggestions });

  const format = getOutputFormat();
  if (format === "json") {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`\n${pc.bold("Plan")} ${pc.dim(`for: "${goal}"`)}`);
  console.log(`${pc.dim("Page:")} ${result.url}`);
  console.log(`${pc.dim("Elements:")} ${result.totalElements} interactive\n`);

  if (result.suggestions.length > 0) {
    console.log(pc.bold("Suggested actions:"));
    for (let i = 0; i < result.suggestions.length; i++) {
      const s = result.suggestions[i]!;
      const relevance = Math.round(s.relevance * 100);
      const color = relevance >= 50 ? pc.green : relevance >= 20 ? pc.yellow : pc.dim;
      console.log(`  ${i + 1}. ${s.description} ${color(`(${relevance}% match)`)}`);
    }
  } else {
    console.log(pc.dim("No relevant actions found for this goal."));
  }

  console.log(
    `\n${pc.dim("Use")} bap act ${pc.dim("to execute actions, or")} bap observe ${pc.dim("for full element list")}`
  );
}

register("plan", planCommand);
