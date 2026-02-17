/**
 * @fileoverview Command registry — standalone module with no circular deps.
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";

export type CommandHandler = (
  args: string[],
  flags: GlobalFlags,
  client: BAPClient,
) => Promise<void>;

const commands = new Map<string, CommandHandler>();

export function register(name: string, handler: CommandHandler): void {
  commands.set(name, handler);
}

export function getCommand(name: string): CommandHandler | undefined {
  return commands.get(name);
}

export function listCommands(): string[] {
  return [...commands.keys()].sort();
}
