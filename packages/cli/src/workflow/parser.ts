/**
 * @fileoverview Workflow YAML parser
 * @module @browseragentprotocol/cli/workflow/parser
 *
 * Minimal YAML parser for workflow files — no external dependencies.
 * Supports the subset of YAML needed for workflow definitions:
 * scalars, maps, sequences, and multi-line strings.
 */

import type { WorkflowDef, WorkflowStep, WorkflowAssertion } from "./types.js";

/**
 * Parse a workflow YAML string into a WorkflowDef.
 * Uses a simple line-based parser — no js-yaml dependency.
 */
export function parseWorkflow(yaml: string): WorkflowDef {
  const lines = yaml.split("\n");
  const def: WorkflowDef = { name: "", steps: [] };
  let currentStep: Partial<WorkflowStep> | null = null;
  let currentAssert: WorkflowAssertion | null = null;
  let section: "root" | "params" | "steps" | "step" | "assert" = "root";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Top-level keys
    if (indent === 0) {
      flushStep();
      if (trimmed.startsWith("name:")) {
        def.name = parseValue(trimmed, "name:");
        section = "root";
      } else if (trimmed.startsWith("description:")) {
        def.description = parseValue(trimmed, "description:");
        section = "root";
      } else if (trimmed === "params:") {
        def.params = {};
        section = "params";
      } else if (trimmed === "steps:") {
        section = "steps";
      }
      continue;
    }

    // Params section (indent 2)
    if (section === "params" && indent === 2 && def.params) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed
          .slice(colonIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        def.params[key] = val;
      }
      continue;
    }

    // Steps section — new step starts with "- "
    if (section === "steps" || section === "step" || section === "assert") {
      if (trimmed.startsWith("- ")) {
        flushStep();
        // Parse inline step: "- goto: https://example.com"
        const stepContent = trimmed.slice(2).trim();
        const colonIdx = stepContent.indexOf(":");
        if (colonIdx > 0) {
          const type = stepContent.slice(0, colonIdx).trim();
          const args = stepContent
            .slice(colonIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          currentStep = { type, args };
        }
        section = "step";
        continue;
      }

      // Step properties (indent 4+)
      if (section === "step" && currentStep) {
        if (trimmed.startsWith("observe:")) {
          currentStep.observe = parseValue(trimmed, "observe:") === "true";
        } else if (trimmed.startsWith("label:")) {
          currentStep.label = parseValue(trimmed, "label:");
        } else if (trimmed.startsWith("args:")) {
          currentStep.args = parseValue(trimmed, "args:");
        } else if (trimmed === "assert:") {
          currentAssert = {};
          section = "assert";
        }
        continue;
      }

      // Assert properties (indent 6+)
      if (section === "assert" && currentAssert) {
        if (trimmed.startsWith("url:")) {
          currentAssert.url = parseValue(trimmed, "url:");
        } else if (trimmed.startsWith("text:")) {
          currentAssert.text = parseValue(trimmed, "text:");
        } else if (trimmed.startsWith("element:")) {
          currentAssert.element = parseValue(trimmed, "element:");
        }
        continue;
      }
    }
  }

  flushStep();
  return def;

  function flushStep() {
    if (currentStep?.type && currentStep.args !== undefined) {
      if (currentAssert && Object.keys(currentAssert).length > 0) {
        currentStep.assert = currentAssert;
      }
      def.steps.push(currentStep as WorkflowStep);
    }
    currentStep = null;
    currentAssert = null;
    section = "steps";
  }
}

function parseValue(line: string, prefix: string): string {
  return line
    .slice(line.indexOf(prefix) + prefix.length)
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * Substitute {{param}} placeholders in a string with values.
 */
export function substituteParams(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (key in params) return params[key]!;
    return `{{${key}}}`; // Leave unresolved params as-is
  });
}

/**
 * Serialize a WorkflowDef to YAML string.
 */
export function serializeWorkflow(def: WorkflowDef): string {
  const lines: string[] = [];

  lines.push(`name: ${def.name}`);
  if (def.description) {
    lines.push(`description: ${def.description}`);
  }

  if (def.params && Object.keys(def.params).length > 0) {
    lines.push("params:");
    for (const [key, value] of Object.entries(def.params)) {
      lines.push(`  ${key}: "${value}"`);
    }
  }

  lines.push("steps:");
  for (const step of def.steps) {
    lines.push(`  - ${step.type}: "${step.args}"`);
    if (step.label) {
      lines.push(`    label: ${step.label}`);
    }
    if (step.observe) {
      lines.push(`    observe: true`);
    }
    if (step.assert) {
      lines.push(`    assert:`);
      if (step.assert.url) lines.push(`      url: "${step.assert.url}"`);
      if (step.assert.text) lines.push(`      text: "${step.assert.text}"`);
      if (step.assert.element) lines.push(`      element: "${step.assert.element}"`);
    }
  }

  return lines.join("\n") + "\n";
}
