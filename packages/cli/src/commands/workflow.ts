/**
 * bap workflow — Record, run, and manage deterministic browser workflows
 *
 * Usage:
 *   bap workflow record <name>                    Start recording
 *   bap workflow stop                             Stop recording, save YAML
 *   bap workflow run <name> [--param key=value]   Replay a workflow
 *   bap workflow list                             List saved workflows
 */

import { pc } from "@browseragentprotocol/logger";
import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { getOutputFormat } from "../output/formatter.js";
import { register } from "./registry.js";

async function workflowCommand(
  args: string[],
  _flags: GlobalFlags,
  client: BAPClient
): Promise<void> {
  const subcommand = args[0];
  const format = getOutputFormat();
  const isJson = format === "json";

  if (!subcommand || subcommand === "--help") {
    console.log(`
${pc.bold("bap workflow")} ${pc.dim("— deterministic browser workflows")}

${pc.cyan("Commands:")}
  bap workflow record <name>                  Start recording commands
  bap workflow stop                           Stop recording, save as YAML
  bap workflow run <name> [--param k=v ...]   Replay a saved workflow
  bap workflow list                           List saved workflows

${pc.cyan("Example:")}
  bap workflow record qa-checkout
  bap goto https://shop.example.com --observe
  bap act fill:label:"Search"="headphones" press:Enter
  bap workflow stop

  bap workflow run qa-checkout --param search=speakers
`);
    return;
  }

  const { startRecording, stopRecording, listWorkflows, loadWorkflow } =
    await import("../workflow/recorder.js");

  switch (subcommand) {
    case "record": {
      const name = args[1];
      if (!name) {
        console.error("Usage: bap workflow record <name>");
        process.exit(1);
      }
      startRecording(name);
      console.log(`${pc.green("Recording started:")} ${name}`);
      console.log(pc.dim("Run BAP commands normally. They will be captured."));
      console.log(pc.dim('Run "bap workflow stop" when done.'));
      return;
    }

    case "stop": {
      const filePath = stopRecording();
      console.log(`${pc.green("Workflow saved:")} ${filePath}`);
      return;
    }

    case "list": {
      const workflows = listWorkflows();
      if (workflows.length === 0) {
        console.log(pc.dim("No saved workflows. Record one with: bap workflow record <name>"));
        return;
      }
      if (isJson) {
        console.log(JSON.stringify(workflows));
        return;
      }
      console.log(pc.bold("Saved workflows:"));
      for (const w of workflows) {
        console.log(`  ${pc.cyan(w.name)} ${pc.dim(`(${w.stepCount} steps)`)}`);
      }
      return;
    }

    case "run": {
      const name = args[1];
      if (!name) {
        console.error("Usage: bap workflow run <name> [--param key=value ...]");
        process.exit(1);
      }

      // Parse --param flags
      const params: Record<string, string> = {};
      for (let i = 2; i < args.length; i++) {
        const arg = args[i]!;
        if (arg.startsWith("--param=") || arg.startsWith("--param ")) {
          const kv = arg.startsWith("--param=") ? arg.slice(8) : (args[++i] ?? "");
          const eqIdx = kv.indexOf("=");
          if (eqIdx > 0) {
            params[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
          }
        }
      }

      const yaml = loadWorkflow(name);
      const { parseWorkflow } = await import("../workflow/parser.js");
      const def = parseWorkflow(yaml);

      console.log(`${pc.bold("Running workflow:")} ${def.name}`);
      if (def.description) console.log(pc.dim(def.description));
      console.log(pc.dim(`${def.steps.length} steps\n`));

      const { runWorkflow } = await import("../workflow/runner.js");
      const result = await runWorkflow(def, client, params);

      if (isJson) {
        console.log(JSON.stringify(result));
        return;
      }

      // Print results
      for (const step of result.steps) {
        const icon = step.status === "pass" ? pc.green("PASS") : pc.red("FAIL");
        const label = step.label ?? step.type;
        const duration = pc.dim(`${step.duration}ms`);
        console.log(`  ${icon} Step ${step.step}: ${label} ${duration}`);
        if (step.error) {
          console.log(`       ${pc.red(step.error)}`);
        }
      }

      console.log("");
      const statusColor = result.status === "pass" ? pc.green : pc.red;
      console.log(
        `${statusColor(result.status.toUpperCase())} — ${result.passed} passed, ${result.failed} failed (${result.totalDuration}ms)`
      );
      return;
    }

    default:
      console.error(`Unknown workflow command: ${subcommand}`);
      console.error('Run "bap workflow --help" for usage.');
      process.exit(1);
  }
}

register("workflow", workflowCommand);
