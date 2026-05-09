import { describe, expect, it } from "vitest";
import { handleSessionList } from "../handlers/session.js";
import type { ClientState, DormantSession, HandlerContext } from "../types.js";

function createPage(url: string, title: string) {
  return {
    url: () => url,
    title: async () => title,
  };
}

describe("handleSessionList", () => {
  it("returns active and dormant sessions without restoring them", async () => {
    const activePage = createPage("https://example.com/live", "Live");
    const dormantPage = createPage("https://example.com/dormant", "Dormant");

    const activeState = {
      sessionId: "cli-9222",
      clientId: "client-1",
      pages: new Map([["page-live", activePage]]),
      activePage: "page-live",
      launchState: {
        browser: "chromium",
        channel: "chrome",
        headless: false,
      },
      isPersistent: false,
      handoffPending: false,
      lastActivityTime: 200,
    } as unknown as ClientState;

    const dormantState = {
      sessionId: "cli-9444",
      pages: new Map([["page-dormant", dormantPage]]),
      activePage: "page-dormant",
      launchState: {
        browser: "firefox",
        headless: true,
      },
      isPersistent: false,
      handoffPending: true,
      parkedAt: 100,
      dormantTtlMs: 5000,
    } as unknown as DormantSession;

    const ctx = {
      clients: new Map([[{} as never, activeState]]),
      dormantSessions: new Map([["cli-9444", dormantState]]),
      getClientScopes: () => ["page:*", "action:click", "action:type", "observe:*"],
      options: {
        security: {
          allowedHosts: undefined,
          redactSensitiveContent: true,
          blockPasswordValueExtraction: true,
          redactPasswordsInScreenshots: false,
          blockStorageStateExtraction: false,
        },
      },
    } as unknown as HandlerContext;

    const result = await handleSessionList(ctx);

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toMatchObject({
      sessionId: "cli-9222",
      state: "active",
      activePageUrl: "https://example.com/live",
      activePageTitle: "Live",
      trust: {
        approvalMode: "standard",
        redaction: {
          content: true,
          passwordValues: true,
          screenshots: false,
          storageState: false,
        },
      },
    });
    expect(result.sessions[1]).toMatchObject({
      sessionId: "cli-9444",
      state: "dormant",
      handoffPending: true,
      expiresAt: 5100,
    });
  });
});
