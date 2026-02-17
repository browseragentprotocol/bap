/**
 * bap config <key> [value] — View or set configuration
 *
 * Examples:
 *   bap config browser firefox
 *   bap config headless false
 *   bap config timeout 60000
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { loadConfig, saveConfig } from "../config/state.js";
import { register } from "./registry.js";

async function configCommand(
  args: string[],
  _flags: GlobalFlags,
  _client: BAPClient,
): Promise<void> {
  const key = args[0];
  const value = args[1];

  if (!key) {
    // Show current config
    const config = loadConfig();
    console.log("### BAP Configuration");
    for (const [k, v] of Object.entries(config)) {
      console.log(`  ${k}: ${v}`);
    }
    return;
  }

  if (!value) {
    // Show specific key
    const config = loadConfig();
    const val = (config as unknown as Record<string, unknown>)[key];
    if (val !== undefined) {
      console.log(`${key}: ${val}`);
    } else {
      console.error(`Unknown config key: ${key}`);
      console.error("Valid keys: browser, headless, timeout, port");
      process.exit(1);
    }
    return;
  }

  // Set value
  const updates: Record<string, unknown> = {};

  switch (key) {
    case "browser":
      if (!["chrome", "chromium", "firefox", "webkit", "edge"].includes(value)) {
        console.error("Valid browsers: chrome, chromium, firefox, webkit, edge");
        process.exit(1);
      }
      updates.browser = value;
      break;
    case "headless":
      updates.headless = value === "true";
      break;
    case "timeout":
      updates.timeout = parseInt(value, 10);
      break;
    case "port":
      updates.port = parseInt(value, 10);
      break;
    default:
      console.error(`Unknown config key: ${key}`);
      console.error("Valid keys: browser, headless, timeout, port");
      process.exit(1);
  }

  saveConfig(updates);
  console.log(`Set ${key} = ${value}`);
}

register("config", configCommand);
