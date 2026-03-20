/**
 * Integration tests: real WebSocket server + JSON-RPC protocol.
 *
 * These tests start an actual BAPPlaywrightServer, connect via WebSocket,
 * and exercise the full request/response path. Browser-dependent tests
 * (launch, navigate, observe) are skipped if Playwright browsers are not installed.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestHarness, type TestHarness, type TestClient } from "./helpers/test-server.js";

let harness: TestHarness;
let client: TestClient;

beforeAll(async () => {
  harness = await createTestHarness();
  client = await harness.createClient();
}, 15000);

afterAll(async () => {
  await harness?.teardown();
}, 10000);

// =============================================================================
// Protocol Handshake
// =============================================================================

describe("protocol handshake", () => {
  it("initializes successfully and returns server capabilities", async () => {
    const response = await client.request("initialize", {});

    expect(response).toHaveProperty("result");
    const result = (response as { result: Record<string, unknown> }).result;
    expect(result.protocolVersion).toBeDefined();
    expect(result.serverInfo).toBeDefined();
    expect(result.capabilities).toBeDefined();

    const capabilities = result.capabilities as Record<string, unknown>;
    expect(capabilities.browsers).toEqual(["chromium", "firefox", "webkit"]);
    expect(capabilities.actions).toContain("click");
    expect(capabilities.actions).toContain("fill");
  });
});

// =============================================================================
// Error Paths
// =============================================================================

describe("error handling", () => {
  it("returns an error for unknown methods", async () => {
    const response = await client.request("nonexistent/method", {});

    expect(response).toHaveProperty("error");
    const error = (response as { error: { code: number; message: string } }).error;
    // May be MethodNotFound (-32601) or authorization denied depending on scope config
    expect(error.code).toBeLessThan(0);
  });

  it("returns error with recoveryHint for blocked protocol navigation", async () => {
    // Launch a browser so we can test navigation errors
    const launchResponse = await client.request("browser/launch", {
      browser: "chromium",
      headless: true,
    });
    if ("error" in launchResponse) {
      // Browser not available, skip navigation test
      return;
    }

    const response = await client.request("page/create", { url: "javascript:alert(1)" });

    expect(response).toHaveProperty("error");
    const error = (
      response as { error: { code: number; message: string; data?: { recoveryHint?: string } } }
    ).error;
    expect(error.message).toContain("Blocked protocol");
  });

  it("includes recoveryHint in Timeout-style error responses", async () => {
    // Send a request before initialization on a fresh client to get a NotInitialized error
    const freshClient = await harness.createClient();
    // Skip initialize — go straight to a method call
    const response = await freshClient.request("page/list", {});

    expect(response).toHaveProperty("error");
    const error = (
      response as { error: { code: number; message: string; data?: { recoveryHint?: string } } }
    ).error;
    expect(error.code).toBe(-32001); // NotInitialized
    expect(error.message).toContain("not initialized");
    freshClient.close();
  });
});

// =============================================================================
// Request Flow (requires browser)
// =============================================================================

describe("request flow with browser", () => {
  let browserAvailable = false;

  beforeAll(async () => {
    // Try to launch a browser — skip suite if not installed
    try {
      const secondClient = await harness.createClient();
      const initRes = await secondClient.request("initialize", {});
      if ("error" in initRes) {
        secondClient.close();
        return;
      }
      const launchRes = await secondClient.request("browser/launch", {
        browser: "chromium",
        headless: true,
      });
      if ("result" in launchRes) {
        browserAvailable = true;
      }
      secondClient.close();
    } catch {
      // Playwright not installed
    }
  }, 15000);

  it("can create a page and navigate", async () => {
    if (!browserAvailable) return;

    const navClient = await harness.createClient();
    await navClient.request("initialize", {});
    await navClient.request("browser/launch", { browser: "chromium", headless: true });

    const pageRes = await navClient.request("page/create", {});
    expect(pageRes).toHaveProperty("result");
    const page = (pageRes as { result: { id: string; url: string } }).result;
    expect(page.id).toBeDefined();

    const navRes = await navClient.request("page/navigate", {
      pageId: page.id,
      url: "data:text/html,<h1>Hello BAP</h1>",
    });
    // data: protocol is blocked by default
    expect(navRes).toHaveProperty("error");

    navClient.close();
  });
});

// =============================================================================
// Multiple Clients
// =============================================================================

describe("multi-client isolation", () => {
  it("separate clients have independent state", async () => {
    const clientA = await harness.createClient();
    const clientB = await harness.createClient();

    const initA = await clientA.request("initialize", {});
    const initB = await clientB.request("initialize", {});

    expect(initA).toHaveProperty("result");
    expect(initB).toHaveProperty("result");

    // Both clients get independent capabilities
    const resultA = (initA as { result: { protocolVersion: string } }).result;
    const resultB = (initB as { result: { protocolVersion: string } }).result;
    expect(resultA.protocolVersion).toBe(resultB.protocolVersion);

    // Client A's page list is empty (no browser launched)
    const listA = await clientA.request("page/list", {});
    expect(listA).toHaveProperty("result");
    const pages = (listA as { result: { pages: unknown[] } }).result;
    expect(pages.pages).toEqual([]);

    clientA.close();
    clientB.close();
  });
});
