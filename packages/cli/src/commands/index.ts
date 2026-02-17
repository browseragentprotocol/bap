/**
 * @fileoverview Command registration — re-exports registry and triggers
 * side-effect imports to register all commands.
 */

export { register, getCommand, listCommands } from "./registry.js";
export type { CommandHandler } from "./registry.js";

// Register all commands — side-effect imports
import "./open.js";
import "./goto.js";
import "./click.js";
import "./fill.js";
import "./type.js";
import "./press.js";
import "./select.js";
import "./check.js";
import "./hover.js";
import "./screenshot.js";
import "./snapshot.js";
import "./close.js";
import "./back.js";
import "./observe.js";
import "./act.js";
import "./extract.js";
import "./sessions.js";
import "./tabs.js";
import "./frames.js";
import "./eval.js";
import "./config.js";
import "./recipe.js";
import "./install-skill.js";
