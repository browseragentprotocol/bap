/**
 * bap demo — Guided walkthrough of BAP capabilities
 *
 * Navigates to example.com, observes elements, clicks a link,
 * and explains each step for first-time users.
 */

import { pc } from "@browseragentprotocol/logger";
import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { register } from "./registry.js";

function step(n: number, text: string): void {
  console.log(`\n${pc.cyan(`Step ${n}:`)} ${pc.bold(text)}`);
}

function explain(text: string): void {
  console.log(pc.dim(`  ${text}`));
}

async function demoCommand(_args: string[], _flags: GlobalFlags, client: BAPClient): Promise<void> {
  console.log(`\n${pc.bold("BAP Demo")} ${pc.dim("— see BAP in action")}\n`);

  // Step 1: Navigate
  step(1, "Navigate to a page");
  explain("bap goto https://example.com");
  const nav = await client.navigate("https://example.com");
  console.log(`  ${pc.green("Loaded:")} ${nav.url} (${nav.status})`);

  // Step 2: Observe
  step(2, "Observe interactive elements");
  explain("bap observe");
  const obs = await client.observe({ maxElements: 10 });
  const elements = obs.interactiveElements ?? [];
  if (elements.length > 0) {
    console.log(`  ${pc.green(`Found ${elements.length} element(s):`)}`);
    for (const el of elements.slice(0, 5)) {
      const ref = el.ref ?? "";
      const role = el.role ?? el.tagName ?? "";
      const name = el.name ?? "";
      console.log(`    ${pc.yellow(ref)} ${role}${name ? ` "${name}"` : ""}`);
    }
    if (elements.length > 5) {
      console.log(pc.dim(`    ... and ${elements.length - 5} more`));
    }
  } else {
    console.log(`  ${pc.dim("No interactive elements found on this page")}`);
  }

  // Step 3: Click a link
  const link = elements.find((e: { role: string; name?: string }) => e.role === "link" && e.name);
  if (link) {
    step(3, `Click a link using its ref`);
    explain(`bap click ${link.ref}`);
    await client.click({ type: "ref", ref: link.ref! });
    const afterClick = await client.observe({
      includeMetadata: true,
      includeInteractiveElements: false,
      maxElements: 0,
    });
    console.log(`  ${pc.green("Navigated to:")} ${afterClick.metadata?.url ?? "unknown"}`);
  } else {
    step(3, "Click an element");
    console.log(`  ${pc.dim("No clickable links found — skipping")}`);
  }

  // Step 4: Take a screenshot
  step(link ? 4 : 3, "Take a screenshot");
  explain("bap screenshot");
  await client.screenshot();
  console.log(`  ${pc.green("Screenshot saved to .bap/ directory")}`);

  // Summary
  console.log(`
${pc.bold("What you just saw:")}
  ${pc.cyan("goto")}        Navigate to any URL
  ${pc.cyan("observe")}     See interactive elements with refs (${pc.yellow("e1")}, ${pc.yellow("e2")}, ...)
  ${pc.cyan("click")}       Click elements using refs or semantic selectors
  ${pc.cyan("screenshot")}  Capture the page

${pc.bold("Try next:")}
  ${pc.green("bap goto")} <your-url> ${pc.dim("--observe")}
  ${pc.green("bap act")} fill:e5="hello" click:e12
  ${pc.green("bap extract")} --fields="title,content"
  ${pc.green("bap --help")} ${pc.dim("for all commands")}
`);
}

register("demo", demoCommand);
