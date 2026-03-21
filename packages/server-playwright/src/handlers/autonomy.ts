/**
 * @fileoverview Autonomous agent mode — agent/plan handler
 * @module @browseragentprotocol/server-playwright/handlers/autonomy
 *
 * Semi-autonomous browser workflow: agent sends a goal, server observes
 * the current page and suggests next actions based on available elements.
 * The AI agent remains the decision-maker — BAP provides structured
 * observations and action suggestions, not decisions.
 *
 * Flow: observe page → suggest actions → agent approves → server executes
 */

import type { HandlerContext, ClientState } from "../types.js";

export interface AgentPlanParams {
  /** Natural language goal description */
  goal: string;
  /** Page to plan on (defaults to active page) */
  pageId?: string;
  /** Maximum number of suggested actions */
  maxSuggestions?: number;
  /** Include screenshot in observation */
  includeScreenshot?: boolean;
}

export interface SuggestedAction {
  /** Human-readable description of the action */
  description: string;
  /** BAP method to call (e.g., "action/click") */
  method: string;
  /** Parameters for the method */
  params: Record<string, unknown>;
  /** Confidence: how relevant this action is to the goal (0-1) */
  relevance: number;
}

export interface AgentPlanResult {
  /** Current page URL */
  url: string;
  /** Current page title */
  title: string;
  /** Interactive elements on the page */
  elements: Array<{
    ref: string;
    role: string;
    name?: string;
    tagName: string;
    value?: string;
    actionHints: string[];
  }>;
  /** Suggested actions based on available elements */
  suggestions: SuggestedAction[];
  /** Screenshot data (base64) if requested */
  screenshot?: string;
  /** Total interactive elements on the page */
  totalElements: number;
}

/**
 * Observe the page and suggest actions based on available elements.
 *
 * This is NOT an AI — it's a structured observation + heuristic suggestion engine.
 * The suggestions are based on element types, roles, and names:
 * - Forms → suggest fill actions
 * - Links → suggest click actions
 * - Buttons → suggest click actions
 * - Search inputs → suggest fill + submit
 * - Navigation elements → suggest navigation
 */
export async function handleAgentPlan(
  state: ClientState,
  params: AgentPlanParams,
  ctx: HandlerContext
): Promise<AgentPlanResult> {
  const page = ctx.getPage(state, params.pageId);
  const maxSuggestions = params.maxSuggestions ?? 10;

  // Observe the page
  const observation = (await ctx.dispatch(null, state, "agent/observe", {
    pageId: params.pageId,
    maxElements: 50,
    includeMetadata: true,
    includeScreenshot: params.includeScreenshot,
  })) as Record<string, unknown>;

  const metadata = observation.metadata as { url: string; title: string } | undefined;
  const interactiveElements = (observation.interactiveElements ?? []) as Array<{
    ref: string;
    role: string;
    name?: string;
    tagName: string;
    value?: string;
    actionHints: string[];
    selector: Record<string, unknown>;
  }>;

  const screenshot = observation.screenshot as { data: string } | undefined;

  // Generate action suggestions based on elements and goal keywords
  const goalLower = params.goal.toLowerCase();
  const suggestions: SuggestedAction[] = [];

  for (const el of interactiveElements) {
    const name = el.name?.toLowerCase() ?? "";
    const role = el.role.toLowerCase();

    // Score relevance based on goal keyword matching
    let relevance = 0;
    const goalWords = goalLower.split(/\s+/);
    for (const word of goalWords) {
      if (word.length < 3) continue;
      if (name.includes(word)) relevance += 0.3;
      if (role.includes(word)) relevance += 0.2;
    }

    // Suggest based on element type
    if (
      role === "textbox" ||
      role === "searchbox" ||
      el.tagName === "input" ||
      el.tagName === "textarea"
    ) {
      if (
        goalLower.includes("search") ||
        goalLower.includes("fill") ||
        goalLower.includes("type")
      ) {
        relevance += 0.3;
      }
      suggestions.push({
        description: `Fill "${el.name ?? el.role}" input`,
        method: "action/fill",
        params: { selector: el.selector, value: "" },
        relevance: Math.min(relevance + 0.1, 1),
      });
    } else if (role === "link") {
      if (
        goalLower.includes("navigate") ||
        goalLower.includes("go to") ||
        goalLower.includes("click")
      ) {
        relevance += 0.2;
      }
      suggestions.push({
        description: `Click link "${el.name ?? "unnamed"}"`,
        method: "action/click",
        params: { selector: el.selector },
        relevance: Math.min(relevance + 0.1, 1),
      });
    } else if (role === "button") {
      if (
        goalLower.includes("submit") ||
        goalLower.includes("click") ||
        goalLower.includes("press")
      ) {
        relevance += 0.3;
      }
      suggestions.push({
        description: `Click button "${el.name ?? "unnamed"}"`,
        method: "action/click",
        params: { selector: el.selector },
        relevance: Math.min(relevance + 0.2, 1),
      });
    } else if (role === "combobox" || role === "listbox" || el.tagName === "select") {
      suggestions.push({
        description: `Select option in "${el.name ?? el.role}"`,
        method: "action/select",
        params: { selector: el.selector, value: "" },
        relevance: Math.min(relevance + 0.1, 1),
      });
    } else if (role === "checkbox") {
      suggestions.push({
        description: `Toggle checkbox "${el.name ?? "unnamed"}"`,
        method: "action/check",
        params: { selector: el.selector },
        relevance: Math.min(relevance + 0.1, 1),
      });
    }
  }

  // Sort by relevance, take top N
  suggestions.sort((a, b) => b.relevance - a.relevance);
  const topSuggestions = suggestions.slice(0, maxSuggestions);

  return {
    url: metadata?.url ?? page.url(),
    title: metadata?.title ?? "",
    elements: interactiveElements.map((el) => ({
      ref: el.ref,
      role: el.role,
      name: el.name,
      tagName: el.tagName,
      value: el.value,
      actionHints: el.actionHints,
    })),
    suggestions: topSuggestions,
    screenshot: screenshot?.data,
    totalElements: interactiveElements.length,
  };
}
