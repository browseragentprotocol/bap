/**
 * bap screenshot [--file=F] — Take a screenshot
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { writeScreenshot } from "../output/filesystem.js";
import { register } from "./registry.js";

async function screenshotCommand(
  _args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const result = await client.screenshot({ fullPage: false });
  const screenshotPath = await writeScreenshot(result.data, flags.file);

  console.log("### Screenshot");
  console.log(`[Screenshot](${screenshotPath})`);
}

register("screenshot", screenshotCommand);
