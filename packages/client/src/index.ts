/**
 * @fileoverview BAP Client SDK
 * @module @browseragentprotocol/client
 *
 * High-level client for connecting to BAP servers.
 * Provides a fluent API for browser automation.
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import {
  // Protocol
  BAP_VERSION,
  ErrorCodes,
  isErrorResponse,
  BAPError,
  // Schemas for validation
  JSONRPCResponseSchema,
  JSONRPCNotificationSchema,
  // Types
  type JSONRPCNotification,
  type BAPSelector,
  type BAPMethod,
  type Page,
  type StorageState,
  type Cookie,
  type InitializeParams,
  type InitializeResult,
  type BrowserLaunchParams,
  type BrowserLaunchResult,
  type PageCreateParams,
  type PageNavigateResult,
  type WaitUntilState,
  type ClickOptions,
  type TypeOptions,
  type ScrollOptions,
  type ActionOptions,
  type ScreenshotOptions,
  type AccessibilityTreeOptions,
  type DOMSnapshotOptions,
  type ObserveScreenshotResult,
  type ObserveAccessibilityResult,
  type ObserveDOMResult,
  type ObserveElementResult,
  type ObservePDFResult,
  type ObserveContentResult,
  type ObserveAriaSnapshotResult,
  type ElementProperty,
  type ContentFormat,
  type FileUpload,
  type InterceptPattern,
  type InterceptHandler,
  type PageEvent,
  type ConsoleEvent,
  type NetworkEvent,
  type DialogEvent,
  type DownloadEvent,
  // Agent types (composite actions, observations, and data extraction)
  type AgentActParams,
  type AgentActResult,
  type AgentObserveParams,
  type AgentObserveResult,
  type AgentExtractParams,
  type AgentExtractResult,
  type ExecutionStep,
  type StepCondition,
  type StepErrorHandling,
  // Context types (Multi-Context Support)
  type ContextCreateParams,
  type ContextCreateResult,
  type ContextListResult,
  type ContextDestroyResult,
  // Frame types (Frame & Shadow DOM Support)
  type FrameListResult,
  type FrameSwitchParams,
  type FrameSwitchResult,
  type FrameMainResult,
  // Stream types (Streaming Responses)
  type StreamChunkParams,
  type StreamEndParams,
  type StreamCancelResult,
  // Approval types (Human-in-the-Loop)
  type ApprovalRequiredParams,
  type ApprovalRespondParams,
  type ApprovalRespondResult,
} from "@browseragentprotocol/protocol";

// Re-export protocol types and helpers
export * from "@browseragentprotocol/protocol";

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Create a JSON-RPC request object
 */
function createRequest(
  id: string | number,
  method: string,
  params?: Record<string, unknown>
): { jsonrpc: "2.0"; id: string | number; method: string; params?: Record<string, unknown> } {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Transport layer for BAP communication
 */
export interface BAPTransport {
  /** Send a message to the server */
  send(message: string): Promise<void>;
  /** Close the transport */
  close(): Promise<void>;
  /** Event handler for received messages */
  onMessage: ((message: string) => void) | null;
  /** Event handler for transport close */
  onClose: (() => void) | null;
  /** Event handler for transport errors */
  onError: ((error: Error) => void) | null;
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * Options for WebSocket transport
 */
export interface WebSocketTransportOptions {
  /** Maximum number of reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Initial delay between reconnection attempts in ms (default: 1000) */
  reconnectDelay?: number;
  /** Enable automatic reconnection on disconnect (default: false) */
  autoReconnect?: boolean;
}

/**
 * WebSocket-based transport implementation with optional auto-reconnection
 */
export class WebSocketTransport implements BAPTransport {
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectDelay: number;
  private readonly autoReconnect: boolean;
  private isClosing = false;
  private isReconnecting = false;

  onMessage: ((message: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  /** Called when reconnection is attempted */
  onReconnecting: ((attempt: number, maxAttempts: number) => void) | null = null;
  /** Called when reconnection succeeds */
  onReconnected: (() => void) | null = null;

  constructor(
    private readonly url: string,
    options: WebSocketTransportOptions = {}
  ) {
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.autoReconnect = options.autoReconnect ?? false;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.isClosing = false;
    this.connectPromise = new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.removeAllListeners();
        this.ws = null;
      }

      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (data: WebSocket.RawData) => {
        if (this.onMessage) {
          this.onMessage(data.toString());
        }
      });

      this.ws.on("close", () => {
        this.connectPromise = null;

        if (this.autoReconnect && !this.isClosing) {
          this.attemptReconnect().catch(() => {
            if (this.onClose) {
              this.onClose();
            }
          });
        } else if (this.onClose) {
          this.onClose();
        }
      });

      this.ws.on("error", (error: Error) => {
        if (this.onError) {
          this.onError(error);
        }
        reject(error);
      });
    });

    return this.connectPromise;
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }
    this.isReconnecting = true;

    try {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        throw new Error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      }

      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      if (this.onReconnecting) {
        this.onReconnecting(this.reconnectAttempts, this.maxReconnectAttempts);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this.connect();
        if (this.onReconnected) {
          this.onReconnected();
        }
      } catch {
        this.isReconnecting = false;
        await this.attemptReconnect();
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  async send(message: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(message);
  }

  async close(): Promise<void> {
    this.isClosing = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connectPromise = null;
    this.reconnectAttempts = 0;
  }
}

// =============================================================================
// Re-export BAPError for backwards compatibility
// =============================================================================

export { BAPError } from "@browseragentprotocol/protocol";

// =============================================================================
// Event Types
// =============================================================================

/** Events emitted by the BAP client */
export interface BAPClientEvents {
  /** Page lifecycle events */
  page: (event: PageEvent) => void;
  /** Console messages */
  console: (event: ConsoleEvent) => void;
  /** Network activity */
  network: (event: NetworkEvent) => void;
  /** Dialog opened */
  dialog: (event: DialogEvent) => void;
  /** Download progress */
  download: (event: DownloadEvent) => void;
  /** Connection closed */
  close: () => void;
  /** Error occurred */
  error: (error: Error) => void;
}

// =============================================================================
// BAP Client
// =============================================================================

/**
 * Options for creating a BAP client
 */
export interface BAPClientOptions {
  /** Authentication token for server connection */
  token?: string;
  /** Client name for identification */
  name?: string;
  /** Client version */
  version?: string;
  /** Default timeout for operations (ms) */
  timeout?: number;
  /** Events to subscribe to */
  events?: string[];
}

/**
 * BAP Client - Main interface for browser automation
 *
 * @example
 * ```typescript
 * const client = new BAPClient("ws://localhost:9222");
 * await client.connect();
 *
 * await client.launch({ browser: "chromium", headless: true });
 * const page = await client.createPage({ url: "https://example.com" });
 *
 * await client.click(role("button", "Submit"));
 * const screenshot = await client.screenshot();
 *
 * await client.close();
 * ```
 */
export class BAPClient extends EventEmitter {
  private transport: BAPTransport;
  private requestId = 0;
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private initialized = false;
  private serverCapabilities: InitializeResult["capabilities"] | null = null;
  private activePage: string | null = null;

  private readonly options: {
    token?: string;
    name: string;
    version: string;
    timeout: number;
    events: string[];
  };

  constructor(urlOrTransport: string | BAPTransport, options: BAPClientOptions = {}) {
    super();

    this.options = {
      token: options.token,
      name: options.name ?? "bap-client",
      version: options.version ?? "0.2.0",
      timeout: options.timeout ?? 30000,
      events: options.events ?? ["page", "console", "network", "dialog"],
    };

    if (typeof urlOrTransport === "string") {
      let url = urlOrTransport;
      if (options.token) {
        const urlObj = new URL(url);
        urlObj.searchParams.set("token", options.token);
        url = urlObj.toString();
      }
      this.transport = new WebSocketTransport(url);
    } else {
      this.transport = urlOrTransport;
    }

    this.transport.onMessage = this.handleMessage.bind(this);
    this.transport.onClose = () => this.emit("close");
    this.transport.onError = (error) => this.emit("error", error);
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to the BAP server and initialize the session
   */
  async connect(): Promise<InitializeResult> {
    if (this.transport instanceof WebSocketTransport) {
      await this.transport.connect();
    }

    const result = await this.request<InitializeResult>("initialize", {
      protocolVersion: BAP_VERSION,
      clientInfo: {
        name: this.options.name,
        version: this.options.version,
      },
      capabilities: {
        events: this.options.events,
        streaming: false,
        compression: false,
      },
    } satisfies InitializeParams);

    const serverVersion = result.protocolVersion;
    const serverParts = serverVersion.split(".").map(Number);
    const clientParts = BAP_VERSION.split(".").map(Number);
    const serverMajor = serverParts[0] ?? 0;
    const serverMinor = serverParts[1] ?? 0;
    const clientMajor = clientParts[0] ?? 0;
    const clientMinor = clientParts[1] ?? 0;

    if (serverMajor !== clientMajor) {
      throw new BAPError(
        ErrorCodes.InvalidRequest,
        `Protocol version mismatch: client=${BAP_VERSION}, server=${serverVersion}. ` +
          `Major version must match.`
      );
    }
    if (serverMinor < clientMinor) {
      console.warn(
        `[BAP] Warning: Server protocol version (${serverVersion}) is older than client (${BAP_VERSION}). ` +
          `Some features may not be available.`
      );
    }

    this.initialized = true;
    this.serverCapabilities = result.capabilities;

    await this.notify("notifications/initialized");

    if (this.options.events.length > 0) {
      await this.request("events/subscribe", {
        events: this.options.events,
      });
    }

    return result;
  }

  /**
   * Gracefully close the connection
   */
  async close(): Promise<void> {
    if (this.initialized) {
      try {
        await this.request("shutdown", {
          saveState: false,
          closePages: true,
        });
      } catch {
        // Ignore errors during shutdown
      }
    }

    await this.transport.close();
    this.initialized = false;
    this.serverCapabilities = null;

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Client closed"));
    }
    this.pendingRequests.clear();
  }

  /**
   * Get server capabilities
   */
  get capabilities(): InitializeResult["capabilities"] | null {
    return this.serverCapabilities;
  }

  // ===========================================================================
  // Browser Methods
  // ===========================================================================

  /**
   * Launch a browser instance
   */
  async launch(params: BrowserLaunchParams = {}): Promise<BrowserLaunchResult> {
    return this.request<BrowserLaunchResult>("browser/launch", params);
  }

  /**
   * Close the browser instance
   */
  async closeBrowser(browserId?: string): Promise<void> {
    await this.request("browser/close", { browserId });
  }

  // ===========================================================================
  // Page Methods
  // ===========================================================================

  /**
   * Create a new page (tab)
   */
  async createPage(options: PageCreateParams = {}): Promise<Page> {
    const page = await this.request<Page>("page/create", options);
    this.activePage = page.id;
    return page;
  }

  /**
   * Navigate to a URL
   */
  async navigate(
    url: string,
    options: {
      pageId?: string;
      waitUntil?: WaitUntilState;
      timeout?: number;
      referer?: string;
      /** Fusion: run agent/observe after navigation (fused in single call) */
      observe?: AgentObserveParams;
    } = {}
  ): Promise<PageNavigateResult> {
    return this.request<PageNavigateResult>("page/navigate", {
      pageId: options.pageId ?? this.activePage,
      url,
      ...options,
    });
  }

  /**
   * Reload the current page
   */
  async reload(
    options: { pageId?: string; waitUntil?: WaitUntilState; timeout?: number } = {}
  ): Promise<void> {
    await this.request("page/reload", {
      pageId: options.pageId ?? this.activePage,
      ...options,
    });
  }

  /**
   * Go back in history
   */
  async goBack(
    options: { pageId?: string; waitUntil?: WaitUntilState; timeout?: number } = {}
  ): Promise<void> {
    await this.request("page/goBack", {
      pageId: options.pageId ?? this.activePage,
      ...options,
    });
  }

  /**
   * Go forward in history
   */
  async goForward(
    options: { pageId?: string; waitUntil?: WaitUntilState; timeout?: number } = {}
  ): Promise<void> {
    await this.request("page/goForward", {
      pageId: options.pageId ?? this.activePage,
      ...options,
    });
  }

  /**
   * Close a page
   */
  async closePage(pageId?: string): Promise<void> {
    const id = pageId ?? this.activePage;
    if (!id) {
      throw new BAPError(ErrorCodes.PageNotFound, "No page to close");
    }
    await this.request("page/close", { pageId: id });
    if (this.activePage === id) {
      this.activePage = null;
    }
  }

  /**
   * List all pages
   */
  async listPages(): Promise<{ pages: Page[]; activePage: string }> {
    return this.request("page/list", {});
  }

  /**
   * Switch to a different page
   */
  async activatePage(pageId: string): Promise<void> {
    await this.request("page/activate", { pageId });
    this.activePage = pageId;
  }

  // ===========================================================================
  // Action Methods
  // ===========================================================================

  /**
   * Click an element
   */
  async click(selector: BAPSelector, options?: ClickOptions): Promise<void> {
    await this.request("action/click", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  /**
   * Double-click an element
   */
  async dblclick(selector: BAPSelector, options?: ClickOptions): Promise<void> {
    await this.request("action/dblclick", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  /**
   * Type text into an element (appends to existing content)
   */
  async type(selector: BAPSelector, text: string, options?: TypeOptions): Promise<void> {
    await this.request("action/type", {
      pageId: this.activePage,
      selector,
      text,
      options,
    });
  }

  /**
   * Fill an input field (clears existing content first)
   */
  async fill(selector: BAPSelector, value: string, options?: ActionOptions): Promise<void> {
    await this.request("action/fill", {
      pageId: this.activePage,
      selector,
      value,
      options,
    });
  }

  /**
   * Clear an input field
   */
  async clear(selector: BAPSelector, options?: ActionOptions): Promise<void> {
    await this.request("action/clear", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  /**
   * Press a keyboard key
   */
  async press(key: string, selector?: BAPSelector, options?: ActionOptions): Promise<void> {
    await this.request("action/press", {
      pageId: this.activePage,
      key,
      selector,
      options,
    });
  }

  /**
   * Hover over an element
   */
  async hover(
    selector: BAPSelector,
    options?: ActionOptions & { position?: { x: number; y: number } }
  ): Promise<void> {
    await this.request("action/hover", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  /**
   * Scroll the page or an element
   */
  async scroll(
    selectorOrOptions?: BAPSelector | ScrollOptions,
    options?: ScrollOptions
  ): Promise<void> {
    let selector: BAPSelector | undefined;
    let scrollOptions: ScrollOptions | undefined;

    if (selectorOrOptions && "type" in selectorOrOptions) {
      selector = selectorOrOptions;
      scrollOptions = options;
    } else {
      scrollOptions = selectorOrOptions;
    }

    await this.request("action/scroll", {
      pageId: this.activePage,
      selector,
      options: scrollOptions,
    });
  }

  /**
   * Select option(s) from a dropdown
   */
  async select(
    selector: BAPSelector,
    values: string | string[],
    options?: ActionOptions
  ): Promise<void> {
    await this.request("action/select", {
      pageId: this.activePage,
      selector,
      values,
      options,
    });
  }

  /**
   * Check a checkbox or radio button
   */
  async check(selector: BAPSelector, options?: ActionOptions): Promise<void> {
    await this.request("action/check", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(selector: BAPSelector, options?: ActionOptions): Promise<void> {
    await this.request("action/uncheck", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  /**
   * Upload files to a file input
   */
  async upload(
    selector: BAPSelector,
    files: FileUpload[],
    options?: ActionOptions
  ): Promise<void> {
    await this.request("action/upload", {
      pageId: this.activePage,
      selector,
      files,
      options,
    });
  }

  /**
   * Drag an element to a target
   */
  async drag(
    source: BAPSelector,
    target: BAPSelector | { x: number; y: number },
    options?: ActionOptions
  ): Promise<void> {
    await this.request("action/drag", {
      pageId: this.activePage,
      source,
      target,
      options,
    });
  }

  // ===========================================================================
  // Observation Methods
  // ===========================================================================

  /**
   * Capture a screenshot
   */
  async screenshot(options?: ScreenshotOptions): Promise<ObserveScreenshotResult> {
    return this.request<ObserveScreenshotResult>("observe/screenshot", {
      pageId: this.activePage,
      options,
    });
  }

  /**
   * Get the accessibility tree (ideal for AI agents)
   */
  async accessibility(options?: AccessibilityTreeOptions): Promise<ObserveAccessibilityResult> {
    return this.request<ObserveAccessibilityResult>("observe/accessibility", {
      pageId: this.activePage,
      options,
    });
  }

  /**
   * Get DOM snapshot
   */
  async dom(options?: DOMSnapshotOptions): Promise<ObserveDOMResult> {
    return this.request<ObserveDOMResult>("observe/dom", {
      pageId: this.activePage,
      options,
    });
  }

  /**
   * Query element properties
   */
  async element(
    selector: BAPSelector,
    properties: ElementProperty[]
  ): Promise<ObserveElementResult> {
    return this.request<ObserveElementResult>("observe/element", {
      pageId: this.activePage,
      selector,
      properties,
    });
  }

  /**
   * Generate PDF of the page
   */
  async pdf(options?: ObservePDFResult): Promise<ObservePDFResult> {
    return this.request<ObservePDFResult>("observe/pdf", {
      pageId: this.activePage,
      options,
    });
  }

  /**
   * Get page content in specified format
   */
  async content(format: ContentFormat = "text"): Promise<ObserveContentResult> {
    return this.request<ObserveContentResult>("observe/content", {
      pageId: this.activePage,
      format,
    });
  }

  /**
   * Get ARIA snapshot of the page or an element (token-efficient for AI agents)
   */
  async ariaSnapshot(
    selector?: BAPSelector,
    options?: { timeout?: number }
  ): Promise<ObserveAriaSnapshotResult> {
    return this.request<ObserveAriaSnapshotResult>("observe/ariaSnapshot", {
      pageId: this.activePage,
      selector,
      options,
    });
  }

  // ===========================================================================
  // Storage Methods
  // ===========================================================================

  /**
   * Get current storage state (for authentication persistence)
   */
  async getStorageState(): Promise<StorageState> {
    return this.request<StorageState>("storage/getState", {
      pageId: this.activePage,
    });
  }

  /**
   * Set storage state
   */
  async setStorageState(state: StorageState): Promise<void> {
    await this.request("storage/setState", { state });
  }

  /**
   * Get cookies
   */
  async getCookies(urls?: string[]): Promise<Cookie[]> {
    const result = await this.request<{ cookies: Cookie[] }>("storage/getCookies", { urls });
    return result.cookies;
  }

  /**
   * Set cookies
   */
  async setCookies(cookies: Cookie[]): Promise<void> {
    await this.request("storage/setCookies", { cookies });
  }

  /**
   * Clear cookies
   */
  async clearCookies(urls?: string[]): Promise<void> {
    await this.request("storage/clearCookies", { urls });
  }

  // ===========================================================================
  // Network Methods
  // ===========================================================================

  /**
   * Enable request interception
   */
  async intercept(patterns: InterceptPattern[], handler: InterceptHandler): Promise<void> {
    await this.request("network/intercept", { patterns, handler });
  }

  /**
   * Fulfill an intercepted request
   */
  async fulfill(
    requestId: string,
    response: {
      status?: number;
      headers?: Record<string, string>;
      body?: string;
      contentType?: string;
    }
  ): Promise<void> {
    await this.request("network/fulfill", { requestId, response });
  }

  /**
   * Abort an intercepted request
   */
  async abort(requestId: string, reason?: string): Promise<void> {
    await this.request("network/abort", { requestId, reason });
  }

  /**
   * Continue an intercepted request
   */
  async continue(
    requestId: string,
    overrides?: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      postData?: string;
    }
  ): Promise<void> {
    await this.request("network/continue", { requestId, overrides });
  }

  // ===========================================================================
  // Emulation Methods
  // ===========================================================================

  /**
   * Set viewport size
   */
  async setViewport(
    width: number,
    height: number,
    options?: {
      deviceScaleFactor?: number;
      isMobile?: boolean;
      hasTouch?: boolean;
    }
  ): Promise<void> {
    await this.request("emulate/setViewport", {
      pageId: this.activePage,
      width,
      height,
      ...options,
    });
  }

  /**
   * Set user agent
   */
  async setUserAgent(userAgent: string, platform?: string): Promise<void> {
    await this.request("emulate/setUserAgent", {
      pageId: this.activePage,
      userAgent,
      platform,
    });
  }

  /**
   * Set geolocation
   */
  async setGeolocation(latitude: number, longitude: number, accuracy?: number): Promise<void> {
    await this.request("emulate/setGeolocation", {
      pageId: this.activePage,
      latitude,
      longitude,
      accuracy,
    });
  }

  /**
   * Set offline mode
   */
  async setOffline(offline: boolean): Promise<void> {
    await this.request("emulate/setOffline", {
      pageId: this.activePage,
      offline,
    });
  }

  // ===========================================================================
  // Dialog Methods
  // ===========================================================================

  /**
   * Set dialog handler
   */
  async handleDialog(action: "accept" | "dismiss", promptText?: string): Promise<void> {
    await this.request("dialog/handle", {
      pageId: this.activePage,
      action,
      promptText,
    });
  }

  // ===========================================================================
  // Tracing Methods
  // ===========================================================================

  /**
   * Start tracing
   */
  async startTracing(options?: {
    name?: string;
    screenshots?: boolean;
    snapshots?: boolean;
    sources?: boolean;
  }): Promise<void> {
    await this.request("trace/start", options ?? {});
  }

  /**
   * Stop tracing and get trace data
   */
  async stopTracing(): Promise<{ path?: string; data?: string }> {
    return this.request("trace/stop", {});
  }

  // ===========================================================================
  // Agent Methods (Composite Actions, Observations, and Data Extraction)
  // ===========================================================================

  /**
   * Execute a sequence of actions in a single request
   *
   * @example
   * ```typescript
   * // Login flow as a single request
   * const result = await client.act({
   *   steps: [
   *     { action: "action/fill", params: { selector: label("Email"), value: "user@example.com" } },
   *     { action: "action/fill", params: { selector: label("Password"), value: "secret" } },
   *     { action: "action/click", params: { selector: role("button", "Log in") } },
   *   ],
   * });
   *
   * if (result.success) {
   *   console.log(`Completed ${result.completed} steps in ${result.duration}ms`);
   * } else {
   *   console.error(`Failed at step ${result.failedAt}`);
   * }
   * ```
   */
  async act(params: AgentActParams): Promise<AgentActResult> {
    return this.request<AgentActResult>("agent/act", {
      pageId: params.pageId ?? this.activePage,
      steps: params.steps,
      stopOnFirstError: params.stopOnFirstError,
      continueOnConditionFail: params.continueOnConditionFail,
      timeout: params.timeout,
      // Fusion: observe-act-observe kernel
      preObserve: params.preObserve,
      postObserve: params.postObserve,
    });
  }

  /**
   * Get an AI-optimized observation of the current page
   *
   * Returns interactive elements with pre-computed selectors, making it easy
   * for AI agents to determine what actions are possible on the page.
   *
   * @example
   * ```typescript
   * // Get elements for AI planning
   * const observation = await client.observe({
   *   includeInteractiveElements: true,
   *   maxElements: 50,
   * });
   *
   * // Each element has a ready-to-use selector
   * for (const element of observation.interactiveElements ?? []) {
   *   console.log(`${element.ref}: ${element.role} "${element.name}" - ${element.actionHints.join(", ")}`);
   *   // Can directly use element.selector in actions
   *   // await client.click(element.selector);
   * }
   * ```
   */
  async observe(params: AgentObserveParams = {}): Promise<AgentObserveResult> {
    return this.request<AgentObserveResult>("agent/observe", {
      pageId: params.pageId ?? this.activePage,
      includeAccessibility: params.includeAccessibility,
      includeScreenshot: params.includeScreenshot,
      includeInteractiveElements: params.includeInteractiveElements,
      includeMetadata: params.includeMetadata,
      maxElements: params.maxElements,
      filterRoles: params.filterRoles,
      includeBounds: params.includeBounds,
      // Element Reference System options
      stableRefs: params.stableRefs,
      refreshRefs: params.refreshRefs,
      includeRefHistory: params.includeRefHistory,
      // Screenshot Annotation options
      annotateScreenshot: params.annotateScreenshot,
      // Fusion options
      responseTier: params.responseTier,
      incremental: params.incremental,
    });
  }

  /**
   * Extract structured data from the page
   *
   * @example
   * ```typescript
   * // Extract product information
   * const result = await client.extract({
   *   instruction: "Extract all product names and prices",
   *   schema: {
   *     type: "array",
   *     items: {
   *       type: "object",
   *       properties: {
   *         name: { type: "string", description: "Product name" },
   *         price: { type: "number", description: "Price in dollars" },
   *       },
   *     },
   *   },
   *   mode: "list",
   * });
   *
   * if (result.success) {
   *   console.log("Extracted data:", result.data);
   * }
   * ```
   */
  async extract(params: AgentExtractParams): Promise<AgentExtractResult> {
    return this.request<AgentExtractResult>("agent/extract", {
      pageId: params.pageId ?? this.activePage,
      instruction: params.instruction,
      schema: params.schema,
      mode: params.mode,
      selector: params.selector,
      includeSourceRefs: params.includeSourceRefs,
      timeout: params.timeout,
    });
  }

  // ===========================================================================
  // Context Methods (Multi-Context Support)
  // ===========================================================================

  /**
   * Create a new isolated browser context
   *
   * @example
   * ```typescript
   * const { contextId } = await client.createContext({
   *   options: { viewport: { width: 1920, height: 1080 } }
   * });
   * await client.createPage({ url: "https://example.com", contextId });
   * ```
   */
  async createContext(params?: ContextCreateParams): Promise<ContextCreateResult> {
    return this.request<ContextCreateResult>("context/create", params ?? {});
  }

  /**
   * List all browser contexts
   */
  async listContexts(): Promise<ContextListResult> {
    return this.request<ContextListResult>("context/list", {});
  }

  /**
   * Destroy a browser context and all its pages
   */
  async destroyContext(contextId: string): Promise<ContextDestroyResult> {
    return this.request<ContextDestroyResult>("context/destroy", { contextId });
  }

  // ===========================================================================
  // Frame Methods (Frame & Shadow DOM Support)
  // ===========================================================================

  /**
   * List all frames in the current page
   */
  async listFrames(pageId?: string): Promise<FrameListResult> {
    return this.request<FrameListResult>("frame/list", {
      pageId: pageId ?? this.activePage,
    });
  }

  /**
   * Switch to a specific frame
   *
   * @example
   * ```typescript
   * // Switch by frame ID
   * await client.switchFrame({ frameId: "frame-abc123" });
   *
   * // Switch by iframe selector
   * await client.switchFrame({ selector: css("iframe.payment") });
   *
   * // Switch by URL pattern
   * await client.switchFrame({ url: "checkout.stripe.com" });
   * ```
   */
  async switchFrame(params: Omit<FrameSwitchParams, "pageId"> & { pageId?: string }): Promise<FrameSwitchResult> {
    return this.request<FrameSwitchResult>("frame/switch", {
      pageId: params.pageId ?? this.activePage,
      frameId: params.frameId,
      selector: params.selector,
      url: params.url,
    });
  }

  /**
   * Switch back to the main frame
   */
  async mainFrame(pageId?: string): Promise<FrameMainResult> {
    return this.request<FrameMainResult>("frame/main", {
      pageId: pageId ?? this.activePage,
    });
  }

  // ===========================================================================
  // Stream Methods (Streaming Responses)
  // ===========================================================================

  /**
   * Cancel an active stream
   */
  async cancelStream(streamId: string): Promise<StreamCancelResult> {
    return this.request<StreamCancelResult>("stream/cancel", { streamId });
  }

  /**
   * Register a handler for stream chunks
   * Returns an unsubscribe function
   */
  onStreamChunk(handler: (params: StreamChunkParams) => void): () => void {
    const listener = (event: Record<string, unknown>) => {
      handler(event as unknown as StreamChunkParams);
    };
    this.on("stream/chunk", listener);
    return () => this.off("stream/chunk", listener);
  }

  /**
   * Register a handler for stream completion
   * Returns an unsubscribe function
   */
  onStreamEnd(handler: (params: StreamEndParams) => void): () => void {
    const listener = (event: Record<string, unknown>) => {
      handler(event as unknown as StreamEndParams);
    };
    this.on("stream/end", listener);
    return () => this.off("stream/end", listener);
  }

  // ===========================================================================
  // Approval Methods (Human-in-the-Loop)
  // ===========================================================================

  /**
   * Register a handler for approval requests
   * Returns an unsubscribe function
   *
   * @example
   * ```typescript
   * client.onApprovalRequired(async (request) => {
   *   console.log(`Approval needed for: ${request.originalRequest.method}`);
   *   // Show UI to user, then respond
   *   await client.respondToApproval({
   *     requestId: request.requestId,
   *     decision: "approve",
   *   });
   * });
   * ```
   */
  onApprovalRequired(handler: (params: ApprovalRequiredParams) => void): () => void {
    const listener = (event: Record<string, unknown>) => {
      handler(event as unknown as ApprovalRequiredParams);
    };
    this.on("approval/required", listener);
    return () => this.off("approval/required", listener);
  }

  /**
   * Respond to an approval request
   */
  async respondToApproval(params: ApprovalRespondParams): Promise<ApprovalRespondResult> {
    return this.request<ApprovalRespondResult>("approval/respond", params);
  }

  /**
   * Helper to build an execution step
   *
   * @example
   * ```typescript
   * const result = await client.act({
   *   steps: [
   *     BAPClient.step("action/click", { selector: role("button", "Submit") }),
   *     BAPClient.step("action/fill", { selector: label("Email"), value: "test@example.com" }, {
   *       condition: { selector: label("Email"), state: "visible" },
   *       onError: "retry",
   *       maxRetries: 3,
   *     }),
   *   ],
   * });
   * ```
   */
  static step(
    action: string,
    params: Record<string, unknown>,
    options?: {
      label?: string;
      condition?: StepCondition;
      onError?: StepErrorHandling;
      maxRetries?: number;
      retryDelay?: number;
    }
  ): ExecutionStep {
    return {
      action,
      params,
      label: options?.label,
      condition: options?.condition,
      onError: options?.onError,
      maxRetries: options?.maxRetries,
      retryDelay: options?.retryDelay,
    };
  }

  // ===========================================================================
  // Internal Methods
  // ===========================================================================

  /**
   * Send a request and wait for response
   */
  private async request<T>(method: BAPMethod | string, params: object): Promise<T> {
    const id = ++this.requestId;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new BAPError(ErrorCodes.Timeout, "Request timeout", { retryable: true }));
      }, this.options.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      const request = createRequest(id, method as BAPMethod, params as Record<string, unknown>);
      this.transport.send(JSON.stringify(request)).catch((error) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  /**
   * Send a notification (no response expected)
   */
  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const notification: JSONRPCNotification = {
      jsonrpc: "2.0",
      method,
      params,
    };
    await this.transport.send(JSON.stringify(notification));
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if ("id" in parsed && parsed.id !== null) {
        const validationResult = JSONRPCResponseSchema.safeParse(parsed);
        if (!validationResult.success) {
          console.error(
            "[BAP] Invalid JSON-RPC response structure:",
            validationResult.error.message
          );
          return;
        }

        const message = validationResult.data;
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);

          if (isErrorResponse(message)) {
            pending.reject(BAPError.fromRPCError(message.error));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }

      if ("method" in parsed) {
        const notificationResult = JSONRPCNotificationSchema.safeParse(parsed);
        if (!notificationResult.success) {
          console.error(
            "[BAP] Invalid JSON-RPC notification structure:",
            notificationResult.error.message
          );
          return;
        }
        this.handleNotification(notificationResult.data);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Handle server notifications (events)
   */
  private handleNotification(notification: JSONRPCNotification): void {
    const { method, params } = notification;

    switch (method) {
      case "events/page":
        this.emit("page", params as unknown as PageEvent);
        break;
      case "events/console":
        this.emit("console", params as unknown as ConsoleEvent);
        break;
      case "events/network":
        this.emit("network", params as unknown as NetworkEvent);
        break;
      case "events/dialog":
        this.emit("dialog", params as unknown as DialogEvent);
        break;
      case "events/download":
        this.emit("download", params as unknown as DownloadEvent);
        break;
      // Streaming notifications
      case "stream/chunk":
        this.emit("stream/chunk", params as unknown as StreamChunkParams);
        break;
      case "stream/end":
        this.emit("stream/end", params as unknown as StreamEndParams);
        break;
      // Approval notifications
      case "approval/required":
        this.emit("approval/required", params as unknown as ApprovalRequiredParams);
        break;
      default:
        break;
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create and connect a BAP client
 */
export async function createClient(url: string, options?: BAPClientOptions): Promise<BAPClient> {
  const client = new BAPClient(url, options);
  await client.connect();
  return client;
}
