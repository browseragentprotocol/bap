/**
 * @fileoverview Workflow recorder — captures BAP commands into workflow files
 * @module @browseragentprotocol/cli/workflow/recorder
 *
 * Records BAP commands as they execute and saves them as replayable workflow YAML.
 * State persisted to ~/.bap/recording.json so recording survives across CLI invocations.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { WorkflowDef, WorkflowStep } from "./types.js";
import { serializeWorkflow } from "./parser.js";

const BAP_DIR = path.join(os.homedir(), ".bap");
const WORKFLOWS_DIR = path.join(BAP_DIR, "workflows");
const RECORDING_FILE = path.join(BAP_DIR, "recording.json");

interface RecordingState {
  name: string;
  startedAt: string;
  steps: WorkflowStep[];
}

/**
 * Check if a recording is currently active.
 */
export function isRecording(): boolean {
  try {
    return fs.existsSync(RECORDING_FILE);
  } catch {
    return false;
  }
}

/**
 * Get the current recording state, or null if not recording.
 */
export function getRecordingState(): RecordingState | null {
  try {
    if (!fs.existsSync(RECORDING_FILE)) return null;
    return JSON.parse(fs.readFileSync(RECORDING_FILE, "utf-8")) as RecordingState;
  } catch {
    return null;
  }
}

/**
 * Start recording a new workflow.
 */
export function startRecording(name: string): void {
  fs.mkdirSync(BAP_DIR, { recursive: true });

  if (isRecording()) {
    const current = getRecordingState();
    throw new Error(
      `Already recording workflow "${current?.name}". Run "bap workflow stop" first.`
    );
  }

  const state: RecordingState = {
    name,
    startedAt: new Date().toISOString(),
    steps: [],
  };

  fs.writeFileSync(RECORDING_FILE, JSON.stringify(state, null, 2));
}

/**
 * Append a step to the current recording.
 * Called from cli.ts after each command executes.
 */
export function appendStep(command: string, args: string[]): void {
  const state = getRecordingState();
  if (!state) return;

  // Map CLI commands to workflow step types
  const step = commandToStep(command, args);
  if (!step) return;

  state.steps.push(step);
  fs.writeFileSync(RECORDING_FILE, JSON.stringify(state, null, 2));
}

/**
 * Stop recording and save the workflow to disk.
 * Returns the path to the saved workflow file.
 */
export function stopRecording(): string {
  const state = getRecordingState();
  if (!state) {
    throw new Error("No recording in progress. Start one with: bap workflow record <name>");
  }

  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });

  const def: WorkflowDef = {
    name: state.name,
    description: `Recorded on ${state.startedAt}`,
    steps: state.steps,
  };

  const yaml = serializeWorkflow(def);
  const filePath = path.join(WORKFLOWS_DIR, `${state.name}.yaml`);
  fs.writeFileSync(filePath, yaml);

  // Clean up recording state
  fs.unlinkSync(RECORDING_FILE);

  return filePath;
}

/**
 * List saved workflows.
 */
export function listWorkflows(): { name: string; path: string; stepCount: number }[] {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];

  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => {
      const filePath = path.join(WORKFLOWS_DIR, f);
      const content = fs.readFileSync(filePath, "utf-8");
      const stepCount = (content.match(/^  - /gm) || []).length;
      return {
        name: f.replace(/\.ya?ml$/, ""),
        path: filePath,
        stepCount,
      };
    });
}

/**
 * Load a workflow by name.
 */
export function loadWorkflow(name: string): string {
  const filePath = path.join(WORKFLOWS_DIR, `${name}.yaml`);
  if (!fs.existsSync(filePath)) {
    const ymlPath = path.join(WORKFLOWS_DIR, `${name}.yml`);
    if (fs.existsSync(ymlPath)) {
      return fs.readFileSync(ymlPath, "utf-8");
    }
    throw new Error(`Workflow "${name}" not found at ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

// Map BAP CLI commands to workflow steps
function commandToStep(command: string, args: string[]): WorkflowStep | null {
  const joinedArgs = args.join(" ");

  switch (command) {
    case "goto":
      return { type: "goto", args: args[0] ?? "" };
    case "act":
      return { type: "act", args: joinedArgs };
    case "click":
      return { type: "click", args: args[0] ?? "" };
    case "fill":
      return { type: "fill", args: joinedArgs };
    case "observe":
      return { type: "observe", args: "" };
    case "extract":
      return { type: "extract", args: joinedArgs };
    case "screenshot":
      return { type: "screenshot", args: "" };
    case "scroll":
      return { type: "scroll", args: args[0] ?? "300" };
    case "type":
      return { type: "act", args: `type:${joinedArgs}` };
    case "press":
      return { type: "act", args: `press:${args[0] ?? "Enter"}` };
    case "select":
      return { type: "act", args: `select:${joinedArgs}` };
    default:
      // Skip non-automatable commands (sessions, tabs, config, etc.)
      return null;
  }
}
