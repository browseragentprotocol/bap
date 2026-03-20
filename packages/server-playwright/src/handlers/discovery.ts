/**
 * @fileoverview WebMCP discovery handler
 * @module @browseragentprotocol/server-playwright/handlers/discovery
 */

import type { Page as PlaywrightPage } from "playwright";
import type {
  DiscoveryDiscoverParams,
  DiscoveryDiscoverResult,
  WebMCPTool,
} from "@browseragentprotocol/protocol";
import type { HandlerContext, ClientState } from "../types.js";

/**
 * Discover WebMCP tools exposed by the current page via progressive feature detection.
 */
export async function discoverWebMCPTools(
  page: PlaywrightPage,
  options?: { maxTools?: number; includeInputSchemas?: boolean }
): Promise<{ tools: WebMCPTool[]; totalDiscovered: number; apiVersion?: string }> {
  const maxTools = options?.maxTools ?? 50;
  const includeInputSchemas = options?.includeInputSchemas !== false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browserFn = (opts: { maxTools: number; includeInputSchemas: boolean }): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (globalThis as any).document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = (globalThis as any).navigator;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: any[] = [];
    let apiVersion: string | undefined;

    // 1. Declarative: forms with toolname attribute
    try {
      const forms = doc.querySelectorAll("form[toolname]");
      for (const form of forms) {
        if (tools.length >= opts.maxTools) break;

        const name = form.getAttribute("toolname");
        if (!name) continue;

        const description = form.getAttribute("tooldescription") || undefined;

        let inputSchema: Record<string, unknown> | undefined;
        if (opts.includeInputSchemas) {
          const properties: Record<string, { type: string; description?: string }> = {};
          const required: string[] = [];
          const inputs = form.querySelectorAll("input[name], textarea[name], select[name]");

          for (const input of inputs) {
            const inputName = input.getAttribute("name");
            if (!inputName) continue;

            const paramDesc = input.getAttribute("toolparamdescription") || undefined;
            const inputType = input.getAttribute("type") || "text";
            const schemaType =
              inputType === "number" ? "number" : inputType === "checkbox" ? "boolean" : "string";

            properties[inputName] = {
              type: schemaType,
              ...(paramDesc ? { description: paramDesc } : {}),
            };

            if (input.hasAttribute("required")) {
              required.push(inputName);
            }
          }

          if (Object.keys(properties).length > 0) {
            inputSchema = {
              type: "object",
              properties,
              ...(required.length > 0 ? { required } : {}),
            };
          }
        }

        const id = form.getAttribute("id");
        const formSelector = id ? `#${id}` : `form[toolname="${name}"]`;

        tools.push({ name, description, inputSchema, source: "webmcp-declarative", formSelector });
      }
    } catch {
      // Ignore declarative detection errors
    }

    // 2. Imperative: navigator.modelContext API
    try {
      if (typeof nav?.modelContext !== "undefined" && nav.modelContext !== null) {
        const mc = nav.modelContext;

        if (typeof mc.version === "string") {
          apiVersion = mc.version;
        }

        if (typeof mc.getTools === "function") {
          const imperativeTools = mc.getTools();

          if (Array.isArray(imperativeTools)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const tool of imperativeTools as any[]) {
              if (tools.length >= opts.maxTools) break;
              if (tool && typeof tool.name === "string") {
                tools.push({
                  name: tool.name,
                  description: typeof tool.description === "string" ? tool.description : undefined,
                  inputSchema:
                    opts.includeInputSchemas && tool.inputSchema ? tool.inputSchema : undefined,
                  source: "webmcp-imperative",
                });
              }
            }
          }
        }
      }
    } catch {
      // Ignore imperative detection errors
    }

    return { tools, totalDiscovered: tools.length, apiVersion };
  };

  try {
    const result = await page.evaluate(browserFn, { maxTools, includeInputSchemas });
    return result;
  } catch {
    return { tools: [], totalDiscovered: 0 };
  }
}

export async function handleDiscoveryDiscover(
  state: ClientState,
  params: DiscoveryDiscoverParams,
  ctx: HandlerContext
): Promise<DiscoveryDiscoverResult> {
  const page = ctx.getPage(state, params.pageId);
  return discoverWebMCPTools(page, params.options);
}
