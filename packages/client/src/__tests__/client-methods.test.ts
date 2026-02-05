import { describe, it, expect } from "vitest";
import { BAPClient, type BAPTransport, role, css, label } from "../index.js";

/**
 * Mock transport for testing client methods
 */
class MockTransport implements BAPTransport {
  onMessage: ((message: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  sentMessages: string[] = [];
  responses: Map<string, unknown> = new Map();

  async send(message: string): Promise<void> {
    this.sentMessages.push(message);
    const parsed = JSON.parse(message);

    // Auto-respond to requests
    if (parsed.id !== undefined && this.responses.has(parsed.method)) {
      // Use queueMicrotask instead of setTimeout to avoid timer issues
      queueMicrotask(() => {
        this.receiveMessage({
          jsonrpc: "2.0",
          id: parsed.id,
          result: this.responses.get(parsed.method),
        });
      });
    }
  }

  async close(): Promise<void> {
    // no-op
  }

  receiveMessage(message: object): void {
    if (this.onMessage) {
      this.onMessage(JSON.stringify(message));
    }
  }

  respondTo(requestId: number, result: unknown): void {
    this.receiveMessage({
      jsonrpc: "2.0",
      id: requestId,
      result,
    });
  }

  getLastRequest(): { method: string; params: unknown; id: number } | null {
    if (this.sentMessages.length === 0) return null;
    return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
  }

  setAutoResponse(method: string, response: unknown): void {
    this.responses.set(method, response);
  }

  clearAutoResponses(): void {
    this.responses.clear();
  }
}

/**
 * Helper to set up a connected client
 */
async function createConnectedClient(
  overrideTransport?: MockTransport
): Promise<{ client: BAPClient; transport: MockTransport }> {
  const transport = overrideTransport ?? new MockTransport();

  transport.setAutoResponse("initialize", {
    protocolVersion: "0.2.0",
    serverInfo: { name: "test-server", version: "1.0.0" },
    capabilities: { browsers: ["chromium"] },
  });
  transport.setAutoResponse("notifications/initialized", {});
  transport.setAutoResponse("events/subscribe", {
    subscribed: [],
  });

  const client = new BAPClient(transport, { events: [] });
  await client.connect();

  return { client, transport };
}

describe("BAPClient Methods", () => {
  describe("constructor and options", () => {
    it("creates client with URL string", () => {
      const client = new BAPClient("ws://localhost:9222");
      expect(client).toBeDefined();
    });

    it("creates client with custom transport", () => {
      const transport = new MockTransport();
      const client = new BAPClient(transport);
      expect(client).toBeDefined();
    });

    it("accepts client options", () => {
      const client = new BAPClient("ws://localhost:9222", {
        name: "test-client",
        version: "2.0.0",
        timeout: 60000,
        events: ["page"],
      });
      expect(client).toBeDefined();
    });

    it("accepts token option", () => {
      const client = new BAPClient("ws://localhost:9222", {
        token: "secret-token",
      });
      expect(client).toBeDefined();
    });
  });

  describe("connect()", () => {
    it("sends initialize request with client info", async () => {
      const transport = new MockTransport();

      transport.setAutoResponse("initialize", {
        protocolVersion: "0.2.0",
        serverInfo: { name: "test", version: "1.0.0" },
        capabilities: {},
      });
      transport.setAutoResponse("notifications/initialized", {});

      const client = new BAPClient(transport, {
        name: "my-client",
        version: "1.2.3",
        events: [],
      });

      await client.connect();

      const initRequest = JSON.parse(transport.sentMessages[0]);
      expect(initRequest.method).toBe("initialize");
      expect(initRequest.params.clientInfo.name).toBe("my-client");
      expect(initRequest.params.clientInfo.version).toBe("1.2.3");
    });

    it("stores server capabilities after connection", async () => {
      const { client } = await createConnectedClient();

      expect(client.capabilities).toBeDefined();
      expect(client.capabilities?.browsers).toContain("chromium");
    });

    it("throws on major version mismatch", async () => {
      const transport = new MockTransport();

      transport.setAutoResponse("initialize", {
        protocolVersion: "99.0.0", // Major version mismatch
        serverInfo: { name: "test", version: "1.0.0" },
        capabilities: {},
      });

      const client = new BAPClient(transport, { events: [] });

      await expect(client.connect()).rejects.toThrow("Protocol version mismatch");
    });
  });

  describe("close()", () => {
    it("sends shutdown request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("shutdown", {});

      await client.close();

      const hasShutdown = transport.sentMessages.some((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.method === "shutdown";
      });
      expect(hasShutdown).toBe(true);
    });
  });

  describe("browser methods", () => {
    it("launch() sends correct request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("browser/launch", { browserId: "browser-1" });

      const result = await client.launch({ browser: "chromium", headless: true });

      expect(result.browserId).toBe("browser-1");

      const launchRequest = transport.sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.method === "browser/launch";
      });
      expect(launchRequest).toBeDefined();
      const parsed = JSON.parse(launchRequest!);
      expect(parsed.params.browser).toBe("chromium");
      expect(parsed.params.headless).toBe(true);
    });

    it("closeBrowser() sends correct request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("browser/close", {});

      await client.closeBrowser("browser-1");

      const closeRequest = transport.sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.method === "browser/close";
      });
      expect(closeRequest).toBeDefined();
      const parsed = JSON.parse(closeRequest!);
      expect(parsed.params.browserId).toBe("browser-1");
    });
  });

  describe("page methods", () => {
    it("createPage() sends correct request and tracks active page", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", {
        id: "page-1",
        url: "https://example.com",
        title: "Example",
      });
      transport.setAutoResponse("action/click", {});

      const page = await client.createPage({ url: "https://example.com" });
      expect(page.id).toBe("page-1");

      // Verify active page is tracked
      await client.click(css(".button"));

      const clickRequest = transport.sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.method === "action/click";
      });
      const parsed = JSON.parse(clickRequest!);
      expect(parsed.params.pageId).toBe("page-1");
    });

    it("navigate() sends correct request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("page/navigate", { url: "https://example.com", status: 200 });

      await client.createPage({});
      const result = await client.navigate("https://example.com", { waitUntil: "load" });

      expect(result.url).toBe("https://example.com");
    });

    it("listPages() returns page list", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/list", {
        pages: [
          { id: "page-1", url: "https://example.com", title: "Example" },
          { id: "page-2", url: "https://test.com", title: "Test" },
        ],
        activePage: "page-1",
      });

      const result = await client.listPages();

      expect(result.pages).toHaveLength(2);
      expect(result.activePage).toBe("page-1");
    });

    it("activatePage() updates active page tracking", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/activate", {});
      transport.setAutoResponse("action/click", {});

      await client.activatePage("page-2");

      // Now click should use page-2
      await client.click(css(".button"));

      const clickRequest = transport.sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.method === "action/click";
      });
      const parsed = JSON.parse(clickRequest!);
      expect(parsed.params.pageId).toBe("page-2");
    });
  });

  describe("action methods", () => {
    it("click() sends selector in request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("action/click", {});

      await client.createPage({});
      await client.click(role("button", "Submit"));

      const request = transport.getLastRequest();
      expect(request?.method).toBe("action/click");
      expect(request?.params).toMatchObject({
        selector: { type: "role", role: "button", name: "Submit" },
        pageId: "page-1",
      });
    });

    it("type() sends text in request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("action/type", {});

      await client.createPage({});
      await client.type(label("Email"), "test@example.com", { delay: 50 });

      const request = transport.getLastRequest();
      expect(request?.method).toBe("action/type");
      expect(request?.params).toMatchObject({
        selector: { type: "label", value: "Email" },
        text: "test@example.com",
        options: { delay: 50 },
      });
    });

    it("fill() sends value in request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("action/fill", {});

      await client.createPage({});
      await client.fill(css("#password"), "secret123");

      const request = transport.getLastRequest();
      expect(request?.method).toBe("action/fill");
      expect(request?.params).toMatchObject({
        selector: { type: "css", value: "#password" },
        value: "secret123",
      });
    });

    it("press() sends key in request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("action/press", {});

      await client.createPage({});
      await client.press("Enter");

      const request = transport.getLastRequest();
      expect(request?.method).toBe("action/press");
      expect(request?.params).toMatchObject({
        key: "Enter",
        pageId: "page-1",
      });
    });

    it("scroll() supports options-only call", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("action/scroll", {});

      await client.createPage({});
      await client.scroll({ deltaY: 100 });

      const request = transport.getLastRequest();
      expect(request?.params).toMatchObject({
        options: { deltaY: 100 },
      });
    });

    it("scroll() supports selector + options call", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("action/scroll", {});

      await client.createPage({});
      await client.scroll(css(".scrollable"), { deltaY: 200 });

      const request = transport.getLastRequest();
      expect(request?.params).toMatchObject({
        selector: { type: "css", value: ".scrollable" },
        options: { deltaY: 200 },
      });
    });
  });

  describe("observation methods", () => {
    it("screenshot() returns image data", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("observe/screenshot", {
        data: "base64encodedimage",
        format: "png",
        width: 1920,
        height: 1080,
      });

      await client.createPage({});
      const result = await client.screenshot({ fullPage: true });

      expect(result.data).toBe("base64encodedimage");
      expect(result.format).toBe("png");
    });

    it("accessibility() returns tree data", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("observe/accessibility", {
        tree: { role: "document", name: "Page", children: [] },
      });

      await client.createPage({});
      const result = await client.accessibility({ interestingOnly: true });

      expect(result.tree.role).toBe("document");
    });

    it("content() returns page content", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("observe/content", {
        content: "Hello World",
        format: "text",
      });

      await client.createPage({});
      const result = await client.content("text");

      expect(result.content).toBe("Hello World");
    });
  });

  describe("agent methods", () => {
    it("act() sends steps in request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("agent/act", {
        success: true,
        completed: 2,
        duration: 1500,
        stepResults: [],
      });

      await client.createPage({});
      const result = await client.act({
        steps: [
          { action: "action/fill", params: { selector: label("Email"), value: "test@example.com" } },
          { action: "action/click", params: { selector: role("button", "Submit") } },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.completed).toBe(2);

      const request = transport.getLastRequest();
      expect(request?.method).toBe("agent/act");
      expect((request?.params as { steps: unknown[] }).steps).toHaveLength(2);
    });

    it("observe() returns interactive elements", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("agent/observe", {
        pageInfo: { url: "https://example.com", title: "Example" },
        interactiveElements: [
          {
            ref: "@submit",
            role: "button",
            name: "Submit",
            selector: { type: "role", role: "button", name: "Submit" },
            actionHints: ["click"],
          },
        ],
      });

      await client.createPage({});
      const result = await client.observe({
        includeInteractiveElements: true,
        maxElements: 50,
      });

      expect(result.interactiveElements).toHaveLength(1);
      expect(result.interactiveElements?.[0].ref).toBe("@submit");
    });

    it("extract() sends schema in request", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("agent/extract", {
        success: true,
        data: [{ name: "Product 1", price: 99.99 }],
      });

      await client.createPage({});
      const result = await client.extract({
        instruction: "Extract products",
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              price: { type: "number" },
            },
          },
        },
        mode: "list",
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });

  describe("context methods", () => {
    it("createContext() creates isolated context", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("context/create", { contextId: "ctx-1" });

      const result = await client.createContext({
        options: { viewport: { width: 1920, height: 1080 } },
      });

      expect(result.contextId).toBe("ctx-1");
    });

    it("listContexts() returns context list", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("context/list", {
        contexts: [
          { contextId: "ctx-1", pageCount: 2 },
          { contextId: "ctx-2", pageCount: 1 },
        ],
        defaultContextId: "ctx-1",
      });

      const result = await client.listContexts();

      expect(result.contexts).toHaveLength(2);
    });

    it("destroyContext() destroys context", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("context/destroy", { pagesDestroyed: 2 });

      const result = await client.destroyContext("ctx-1");

      expect(result.pagesDestroyed).toBe(2);
    });
  });

  describe("frame methods", () => {
    it("listFrames() returns frame list", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("frame/list", {
        frames: [
          { frameId: "main", url: "https://example.com", parentFrameId: null },
          { frameId: "iframe-1", url: "https://ads.example.com", parentFrameId: "main" },
        ],
        currentFrameId: "main",
      });

      await client.createPage({});
      const result = await client.listFrames();

      expect(result.frames).toHaveLength(2);
      expect(result.currentFrameId).toBe("main");
    });

    it("switchFrame() switches to frame", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("frame/switch", {
        frameId: "iframe-1",
        url: "https://checkout.stripe.com",
      });

      await client.createPage({});
      const result = await client.switchFrame({ url: "checkout.stripe.com" });

      expect(result.frameId).toBe("iframe-1");
    });

    it("mainFrame() switches to main frame", async () => {
      const { client, transport } = await createConnectedClient();
      transport.setAutoResponse("page/create", { id: "page-1", url: "", title: "" });
      transport.setAutoResponse("frame/main", {
        frameId: "main",
        url: "https://example.com",
      });

      await client.createPage({});
      const result = await client.mainFrame();

      expect(result.frameId).toBe("main");
    });
  });

  describe("static step() helper", () => {
    it("creates execution step with basic params", () => {
      const step = BAPClient.step("action/click", {
        selector: role("button", "Submit"),
      });

      expect(step.action).toBe("action/click");
      expect(step.params).toMatchObject({
        selector: { type: "role", role: "button", name: "Submit" },
      });
    });

    it("creates execution step with all options", () => {
      const step = BAPClient.step(
        "action/fill",
        { selector: label("Email"), value: "test@example.com" },
        {
          label: "Fill email field",
          condition: { selector: label("Email"), state: "visible" },
          onError: "retry",
          maxRetries: 3,
          retryDelay: 1000,
        }
      );

      expect(step.label).toBe("Fill email field");
      expect(step.condition).toBeDefined();
      expect(step.onError).toBe("retry");
      expect(step.maxRetries).toBe(3);
      expect(step.retryDelay).toBe(1000);
    });
  });

  describe("createClient factory", () => {
    it("exports createClient function", async () => {
      const { createClient } = await import("../index.js");
      expect(typeof createClient).toBe("function");
    });
  });
});
