/**
 * @fileoverview Workflow type definitions
 * @module @browseragentprotocol/cli/workflow/types
 */

export interface WorkflowParam {
  name: string;
  default?: string;
  description?: string;
}

export interface WorkflowAssertion {
  /** Assert URL contains this string */
  url?: string;
  /** Assert this text is visible on the page */
  text?: string;
  /** Assert this element exists (BAP selector string) */
  element?: string;
}

export interface WorkflowStep {
  /** Step type: goto, act, observe, extract, screenshot, scroll, click, fill */
  type: string;
  /** Arguments for the step (URL, composite action string, fields, etc.) */
  args: string;
  /** Post-step assertions */
  assert?: WorkflowAssertion;
  /** Whether to observe after this step */
  observe?: boolean;
  /** Human-readable label */
  label?: string;
}

export interface WorkflowDef {
  /** Workflow name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Parameterized values with optional defaults */
  params?: Record<string, string>;
  /** Ordered steps */
  steps: WorkflowStep[];
}

export interface WorkflowStepResult {
  step: number;
  type: string;
  label?: string;
  status: "pass" | "fail" | "error";
  /** Duration in ms */
  duration: number;
  /** Error or assertion failure message */
  error?: string;
}

export interface WorkflowResult {
  name: string;
  status: "pass" | "fail";
  steps: WorkflowStepResult[];
  totalDuration: number;
  passed: number;
  failed: number;
}
