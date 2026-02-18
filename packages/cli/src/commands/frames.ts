/**
 * bap frames — List frames in current page
 * bap frame-switch <id> — Switch to a frame
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { register } from "./registry.js";

async function framesCommand(
  _args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const result = await client.listFrames();

  console.log("### Frames");
  if (result.frames && result.frames.length > 0) {
    for (const frame of result.frames) {
      const main = frame.isMain ? " (main)" : "";
      console.log(`  ${frame.frameId} ${frame.url ?? ""}${main}`);
    }
  } else {
    console.log("  No frames found");
  }
}

async function frameSwitchCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  const frameId = args[0];
  if (!frameId) {
    console.error("Usage: bap frame-switch <id>");
    process.exit(1);
  }

  await client.switchFrame({ frameId });
  console.log(`### Switched to frame: ${frameId}`);
}

register("frames", framesCommand);
register("frame-switch", frameSwitchCommand);
