/**
 * bap observe — Smart observation of interactive elements
 *
 * Flags:
 *   --full       Full accessibility tree
 *   --forms      Form fields only
 *   --navigation Navigation elements only
 *   --max=N      Limit to N elements (default: 50)
 */

import type { BAPClient, AgentObserveParams } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { printObserveResult } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function observeCommand(
  _args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const params: AgentObserveParams = {
    includeInteractiveElements: true,
    includeMetadata: true,
    maxElements: flags.max ?? 50,
  };

  // --full: include accessibility tree
  if (flags.full) {
    params.includeAccessibility = true;
    params.maxElements = 200;
  }

  // --forms: filter to form-related roles
  if (flags.forms) {
    params.filterRoles = [
      "textbox", "combobox", "checkbox", "radio",
      "searchbox", "spinbutton", "slider", "switch",
    ];
  }

  // --navigation: filter to nav-related roles
  if (flags.navigation) {
    params.filterRoles = ["link", "button", "menuitem", "tab"];
  }

  const result = await client.observe(params);

  // Write accessibility tree if full mode
  if (flags.full && result.accessibility) {
    const snapshotPath = await writeSnapshot(
      JSON.stringify(result.accessibility.tree, null, 2)
    );
    console.log("### Accessibility Tree");
    console.log(`[Full Tree](${snapshotPath})`);
    console.log("");
  }

  printObserveResult(result);
}

register("observe", observeCommand);
