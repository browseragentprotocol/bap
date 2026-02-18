/**
 * bap recipe <name> — Pre-built multi-step workflows
 *
 * Recipes:
 *   bap recipe login <url> --user=<u> --pass=<p>
 *   bap recipe fill-form <url> --data=data.json
 *   bap recipe wait-for <selector> [--timeout=ms]
 */

import fs from "node:fs/promises";
import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { parseSelector } from "../selectors/parser.js";
import { printActResult } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function recipeCommand(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const recipeName = args[0];

  if (!recipeName) {
    console.error("Usage: bap recipe <name> [args]");
    console.error("");
    console.error("Available recipes:");
    console.error("  login <url> --user=<u> --pass=<p>     Log in to a website");
    console.error("  fill-form <url> --data=data.json      Fill a form from JSON");
    console.error("  wait-for <selector> [--timeout=ms]    Wait for element");
    process.exit(1);
  }

  switch (recipeName) {
    case "login":
      await recipeLogin(args.slice(1), flags, client);
      break;
    case "fill-form":
      await recipeFillForm(args.slice(1), flags, client);
      break;
    case "wait-for":
      await recipeWaitFor(args.slice(1), flags, client);
      break;
    default:
      console.error(`Unknown recipe: ${recipeName}`);
      process.exit(1);
  }
}

async function recipeLogin(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const url = args[0];
  if (!url || !flags.user || !flags.pass) {
    console.error("Usage: bap recipe login <url> --user=<u> --pass=<p>");
    process.exit(1);
  }

  // Navigate to URL
  await client.navigate(url);

  // Build steps: find username/password fields, then submit
  const steps = [];

  // Use custom field selectors or auto-detect from observe
  const userSelector = flags.userField
    ? parseSelector(flags.userField)
    : { type: "label" as const, value: "Email" };
  const passSelector = flags.passField
    ? parseSelector(flags.passField)
    : { type: "label" as const, value: "Password" };

  steps.push(
    { action: "action/fill", params: { selector: userSelector, value: flags.user } },
    { action: "action/fill", params: { selector: passSelector, value: flags.pass } },
    { action: "action/click", params: { selector: { type: "role" as const, role: "button" as const, name: "Sign in" } } },
  );

  const result = await client.act({ steps, stopOnFirstError: true });

  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const meta = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });

  printActResult(result, meta.metadata?.url, meta.metadata?.title, snapshotPath);
}

async function recipeFillForm(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const url = args[0];
  if (!url || !flags.data) {
    console.error("Usage: bap recipe fill-form <url> --data=data.json");
    process.exit(1);
  }

  // Navigate to URL
  await client.navigate(url);

  // Read form data
  const dataContent = await fs.readFile(flags.data, "utf-8");
  const formData = JSON.parse(dataContent) as Record<string, string>;

  // Build fill steps from form data
  const steps = Object.entries(formData).map(([label, value]) => ({
    action: "action/fill",
    params: {
      selector: { type: "label" as const, value: label },
      value,
    },
  }));

  const result = await client.act({ steps, stopOnFirstError: false });

  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const meta = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });

  printActResult(result, meta.metadata?.url, meta.metadata?.title, snapshotPath);
}

async function recipeWaitFor(
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const selectorStr = args[0];
  if (!selectorStr) {
    console.error("Usage: bap recipe wait-for <selector> [--timeout=ms]");
    process.exit(1);
  }

  const timeout = flags.timeout ?? 30000;
  const interval = 500;
  const start = Date.now();
  const selector = parseSelector(selectorStr);

  while (Date.now() - start < timeout) {
    try {
      const result = await client.element(selector, ["visible"]);
      if (result.found && result.visible) {
        console.log("### Element found");
        return;
      }
    } catch {
      // Element not found yet
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  console.error(`Timeout: element ${selectorStr} not found within ${timeout}ms`);
  process.exit(1);
}

register("recipe", recipeCommand);
