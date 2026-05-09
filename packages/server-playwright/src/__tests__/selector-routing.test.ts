import { describe, expect, it, vi } from "vitest";
import type { BAPSelector } from "@browseragentprotocol/protocol";
import { handleObserveAccessibility, handleObserveAriaSnapshot, handleObserveElement } from "../handlers/observe.js";
import { handleAgentAct, handleAgentExtract } from "../handlers/agent.js";
import type { ClientState, HandlerContext } from "../types.js";
import { ActionCache } from "../cache/action-cache.js";

function createState(): ClientState {
  return {
    activePage: "page-1",
  } as unknown as ClientState;
}

function createContext(
  page: Record<string, unknown>,
  locator: Record<string, unknown>
): HandlerContext {
  return {
    options: { timeout: 30000 },
    getPage: vi.fn().mockReturnValue(page),
    resolveSelector: vi.fn(() => {
      throw new Error("resolveSelector should not run for ref selectors");
    }),
    resolveSelectorWithRefHealing: vi.fn().mockResolvedValue(locator),
    resolveSelectorWithHealing: vi.fn().mockResolvedValue(locator),
    convertAccessibilityNode: vi.fn().mockReturnValue({ role: "document" }),
    checkAuthorization: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
    actionCache: new ActionCache({ enabled: false }),
  } as unknown as HandlerContext;
}

describe("ref selector routing", () => {
  it("uses the stale-aware resolver for observe/element", async () => {
    const page = {};
    const locator = {
      count: vi.fn().mockResolvedValue(1),
    };
    const ctx = createContext(page, locator);
    const selector: BAPSelector = { type: "ref", ref: "@e5" };

    const result = await handleObserveElement(
      createState(),
      { selector, properties: [] },
      ctx
    );

    expect(result).toEqual({ found: true });
    expect(ctx.resolveSelectorWithRefHealing).toHaveBeenCalledWith(page, selector);
  });

  it("uses the stale-aware resolver for observe/aria_snapshot", async () => {
    const page = {
      url: vi.fn().mockReturnValue("https://example.com"),
      title: vi.fn().mockResolvedValue("Example"),
    };
    const locator = {
      ariaSnapshot: vi.fn().mockResolvedValue("- button \"Continue\""),
    };
    const ctx = createContext(page, locator);
    const selector: BAPSelector = { type: "ref", ref: "@e5" };

    const result = await handleObserveAriaSnapshot(
      createState(),
      { selector },
      ctx
    );

    expect(result.snapshot).toContain("Continue");
    expect(ctx.resolveSelectorWithRefHealing).toHaveBeenCalledWith(page, selector);
  });

  it("uses the stale-aware resolver for observe/accessibility roots", async () => {
    const page = {
      accessibility: {
        snapshot: vi.fn().mockResolvedValue({ role: "WebArea", children: [] }),
      },
    };
    const locator = {
      elementHandle: vi.fn().mockResolvedValue({}),
    };
    const ctx = createContext(page, locator);
    const selector: BAPSelector = { type: "ref", ref: "@frame" };

    await handleObserveAccessibility(
      createState(),
      { options: { root: selector } },
      ctx
    );

    expect(ctx.resolveSelectorWithRefHealing).toHaveBeenCalledWith(page, selector);
    expect(page.accessibility.snapshot).toHaveBeenCalled();
  });

  it("uses the stale-aware resolver for agent/extract", async () => {
    const emptyLocator = {
      first: vi.fn().mockReturnThis(),
      count: vi.fn().mockResolvedValue(0),
      textContent: vi.fn().mockResolvedValue(""),
    };
    const bodyLocator = {
      textContent: vi.fn().mockResolvedValue("Checkout"),
    };
    const page = {
      locator: vi.fn((selector: string) => (selector === "body" ? bodyLocator : emptyLocator)),
    };
    const locator = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      textContent: vi.fn().mockResolvedValue("Checkout"),
    };
    const ctx = createContext(page, locator);
    const selector: BAPSelector = { type: "ref", ref: "@checkout" };

    const result = await handleAgentExtract(
      createState(),
      {
        selector,
        instruction: "Extract the CTA",
        schema: { type: "object" },
      },
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.resolveSelectorWithRefHealing).toHaveBeenCalledWith(page, selector);
  });

  it("uses the stale-aware resolver for step conditions in agent/act", async () => {
    const page = {
      url: vi.fn().mockReturnValue("https://example.com"),
    };
    const locator = {
      waitFor: vi.fn().mockResolvedValue(undefined),
    };
    const ctx = createContext(page, locator);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    const result = await handleAgentAct(
      null,
      createState(),
      {
        steps: [
          {
            action: "action/press",
            params: { key: "Enter" },
            condition: {
              selector,
              state: "exists",
            },
          },
        ],
      },
      ctx
    );

    expect(result.success).toBe(true);
    expect(ctx.resolveSelectorWithRefHealing).toHaveBeenCalledWith(page, selector);
  });
});
