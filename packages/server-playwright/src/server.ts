/**
 * @fileoverview BAP Playwright Server — thin shell
 * @module @browseragentprotocol/server-playwright
 * @version 0.6.0
 *
 * Decomposed from a 5400-line monolith into ~15 modules.
 * This file is the orchestration shell: constructor, start/stop,
 * connection handling, request dispatch, and HandlerContext wiring.
 */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "events";
import * as http from "http";
import { WebSocket, WebSocketServer } from "ws";
import {
  chromium,
  firefox,
  webkit,
  type Page as PlaywrightPage,
  type BrowserContext,
  type BrowserType,
} from "playwright";
import {
  BAP_VERSION,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCErrorResponse,
  type BAPMethod,
  type BAPScope,
  type WaitUntilState,
  type AccessibilityNode,
  type InitializeParams,
  type BrowserLaunchParams,
  type PageCreateOptions,
  type AgentActParams,
  type AgentObserveParams,
  type AgentExtractParams,
  type ContextCreateParams,
  type ContextDestroyParams,
  type FrameListParams,
  type FrameSwitchParams,
  type FrameMainParams,
  type StreamCancelParams,
  type ApprovalRespondParams,
  type DiscoveryDiscoverParams,
  ErrorCodes,
  type ErrorCode,
  MethodScopes,
  hasScope,
  parseScopes,
  createAuthorizationError,
  createSuccessResponse,
  createErrorResponse,
  isRequest,
} from "@browseragentprotocol/protocol";

// Internal modules
import { type BAPServerOptions, type ResolvedOptions, resolveOptions } from "./config.js";
import type {
  ClientState,
  DormantSession,
  HandlerContext,
  PageOwner,
  PlaywrightAccessibilityNode,
} from "./types.js";
import { BAPServerError } from "./errors.js";
import { Logger } from "@browseragentprotocol/logger";

// Security
import { validateUrl as _validateUrl } from "./security/url-validator.js";
import { sanitizeBrowserArgs as _sanitizeBrowserArgs } from "./security/arg-sanitizer.js";
import { redactSensitiveContent } from "./security/credential-redactor.js";

// Selectors & Elements
import {
  resolveSelector as _resolveSelector,
  resolveSelectorWithHealing as _resolveSelectorWithHealing,
  type SelectorResolverDeps,
} from "./selectors/resolver.js";

// Session
import {
  setupSessionTimeouts,
  resetIdleTimeout,
  clearSessionTimeouts,
} from "./session/timeouts.js";
import {
  parkSession as _parkSession,
  restoreSession as _restoreSession,
} from "./session/dormant-store.js";

// Recording
import { TraceRecorder } from "./recording/trace-recorder.js";

// Cache
import { ActionCache } from "./cache/action-cache.js";

// Events
import { sendEvent, setupPageListeners as _setupPageListeners } from "./events/forwarder.js";

// Handlers
import { handleInitialize, handleShutdown } from "./handlers/lifecycle.js";
import { handleBrowserLaunch, handleBrowserClose } from "./handlers/browser.js";
import {
  handlePageCreate,
  handlePageNavigate,
  handlePageReload,
  handlePageGoBack,
  handlePageGoForward,
  handlePageClose,
  handlePageList,
  handlePageActivate,
} from "./handlers/page.js";
import {
  handleActionClick,
  handleActionDblclick,
  handleActionType,
  handleActionFill,
  handleActionClear,
  handleActionPress,
  handleActionHover,
  handleActionScroll,
  handleActionSelect,
  handleActionCheck,
  handleActionUncheck,
  handleActionUpload,
  handleActionDrag,
} from "./handlers/actions.js";
import {
  handleObserveScreenshot,
  handleObserveAccessibility,
  handleObserveDOM,
  handleObserveElement,
  handleObservePDF,
  handleObserveContent,
  handleObserveAriaSnapshot,
} from "./handlers/observe.js";
import {
  handleStorageGetState,
  handleStorageSetState,
  handleStorageGetCookies,
  handleStorageSetCookies,
  handleStorageClearCookies,
} from "./handlers/storage.js";
import {
  handleEmulateSetViewport,
  handleEmulateSetUserAgent,
  handleEmulateSetGeolocation,
  handleEmulateSetOffline,
} from "./handlers/emulation.js";
import {
  handleDialogHandle,
  handleTraceStart,
  handleTraceStop,
  handleEventsSubscribe,
} from "./handlers/misc.js";
import {
  handleContextCreate,
  handleContextList,
  handleContextDestroy,
  handleFrameList,
  handleFrameSwitch,
  handleFrameMain,
  handleStreamCancel,
  handleApprovalRespond,
} from "./handlers/context.js";
import { handleDiscoveryDiscover } from "./handlers/discovery.js";
import { handleAgentAct, handleAgentObserve, handleAgentExtract } from "./handlers/agent.js";

// =============================================================================
// Re-exports for public API
// =============================================================================

export type {
  BAPServerOptions,
  BAPSecurityOptions,
  BAPLimitsOptions,
  BAPAuthorizationOptions,
  BAPSessionOptions,
  BAPTLSOptions,
} from "./config.js";
export type { ClientState, DormantSession, HandlerContext } from "./types.js";
/**
 * @internal Exported for handler testability only — not part of the public semver contract.
 * External consumers should use protocol-level BAPError instead.
 */
export { BAPServerError } from "./errors.js";

// =============================================================================
// BAPPlaywrightServer
// =============================================================================

export class BAPPlaywrightServer extends EventEmitter {
  private readonly options: ResolvedOptions;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, ClientState>();
  private dormantSessions = new Map<string, DormantSession>();

  // Cached dependency objects — created once, reused across all requests
  private _handlerContext: HandlerContext | null = null;
  private _selectorDeps: SelectorResolverDeps | null = null;
  private _eventDeps: ReturnType<BAPPlaywrightServer["createEventForwarderDeps"]> | null = null;
  private _dormantDeps: ReturnType<BAPPlaywrightServer["createDormantStoreDeps"]> | null = null;

  private readonly logger: Logger;
  private readonly traceRecorder: TraceRecorder;
  readonly actionCache: ActionCache;

  constructor(options: BAPServerOptions = {}) {
    super();
    this.options = resolveOptions(options);
    this.logger = new Logger({
      prefix: "BAP Server",
      level: this.options.debug ? "debug" : "info",
      enabled: this.options.debug,
      format: "json",
      stderr: true,
    });
    this.traceRecorder = new TraceRecorder();
    this.actionCache = new ActionCache();
  }

  // ===========================================================================
  // HandlerContext — the shared interface passed to all handler modules
  // Cached after first creation; .bind() calls happen once, not per request.
  // ===========================================================================

  private getHandlerContext(): HandlerContext {
    if (!this._handlerContext) {
      this._handlerContext = {
        options: this.options,
        clients: this.clients,
        dormantSessions: this.dormantSessions,
        log: this.log.bind(this),
        logSecurity: this.logSecurity.bind(this),
        getPage: this.getPage.bind(this),
        resolveSelector: (page, selector) =>
          _resolveSelector(page, selector, this.getSelectorResolverDeps()),
        resolveSelectorWithHealing: (page, selector) =>
          _resolveSelectorWithHealing(page, selector, this.getSelectorResolverDeps()),
        checkAuthorization: this.checkAuthorization.bind(this),
        checkRateLimit: this.checkRateLimit.bind(this),
        checkPageLimit: this.checkPageLimit.bind(this),
        ensureBrowser: this.ensureBrowser.bind(this),
        validateUrl: (url) => _validateUrl(url, this.options, this.log.bind(this)),
        sanitizeBrowserArgs: (args) => _sanitizeBrowserArgs(args, this.log.bind(this)),
        getBrowserType: this.getBrowserType.bind(this),
        mapWaitUntil: this.mapWaitUntil.bind(this),
        sendEvent,
        setupPageListeners: (page, pageId) =>
          _setupPageListeners(page, pageId, this.getEventForwarderDeps()),
        getPageId: this.getPageId.bind(this),
        findPageOwner: this.findPageOwner.bind(this),
        removePageFromOwner: this.removePageFromOwner.bind(this),
        isContextAlive: this.isContextAlive.bind(this),
        getClientScopes: this.getClientScopes.bind(this),
        redactSensitiveContent,
        convertAccessibilityNode: this.convertAccessibilityNode.bind(this),
        htmlToMarkdown: this.htmlToMarkdown.bind(this),
        actionCache: this.actionCache,
        parkSession: (state) => _parkSession(state, this.getDormantStoreDeps()),
        restoreSession: (dormant, state) =>
          _restoreSession(dormant, state, this.getDormantStoreDeps()),
        clearConnectionScopedState: this.clearConnectionScopedState.bind(this),
        clearSessionTimeouts: (state) => clearSessionTimeouts(state),
        cleanupClient: this.cleanupClient.bind(this),
        dispatch: this.dispatch.bind(this),
      };
    }
    return this._handlerContext;
  }

  private getSelectorResolverDeps(): SelectorResolverDeps {
    if (!this._selectorDeps) {
      this._selectorDeps = {
        logSecurity: this.logSecurity.bind(this),
        getPageId: this.getPageId.bind(this),
        findPageOwner: this.findPageOwner.bind(this),
      };
    }
    return this._selectorDeps;
  }

  private getEventForwarderDeps() {
    if (!this._eventDeps) {
      this._eventDeps = this.createEventForwarderDeps();
    }
    return this._eventDeps;
  }

  private createEventForwarderDeps() {
    return {
      findConnectedClientForPage: this.findConnectedClientForPage.bind(this),
      findPageOwner: this.findPageOwner.bind(this),
      removePageFromOwner: this.removePageFromOwner.bind(this),
      log: this.log.bind(this),
    };
  }

  private getDormantStoreDeps() {
    if (!this._dormantDeps) {
      this._dormantDeps = this.createDormantStoreDeps();
    }
    return this._dormantDeps;
  }

  private createDormantStoreDeps() {
    return {
      dormantSessions: this.dormantSessions,
      options: this.options,
      log: this.log.bind(this),
      isContextAlive: this.isContextAlive.bind(this),
      clearConnectionScopedState: this.clearConnectionScopedState.bind(this),
    };
  }

  // ===========================================================================
  // Auth & Scopes
  // ===========================================================================

  private getClientScopes(): BAPScope[] {
    const envScopes = process.env[this.options.authorization.scopesEnvVar];
    if (envScopes) {
      return parseScopes(envScopes);
    }
    return this.options.authorization.defaultScopes;
  }

  private getAuthToken(): string | undefined {
    return this.options.authToken || process.env[this.options.authTokenEnvVar];
  }

  private secureTokenCompare(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) {
      timingSafeEqual(Buffer.from(provided), Buffer.from(provided));
      return false;
    }
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  private checkAuthorization(state: ClientState, method: string): void {
    if (!hasScope(state.scopes, method)) {
      const requiredScopes = MethodScopes[method] || ["*"];
      this.logSecurity("AUTHORIZATION_DENIED", {
        method,
        clientScopes: state.scopes,
        requiredScopes,
      });
      const error = createAuthorizationError(method, requiredScopes as BAPScope[]);
      throw new BAPServerError(error.code, error.message, false, undefined, error.data?.details);
    }
  }

  // ===========================================================================
  // In-Process Client (for --in-process MCP mode)
  // ===========================================================================

  /**
   * Create an in-process client that bypasses WebSocket.
   * Returns a handle with `request()` for sending JSON-RPC requests
   * and `close()` for cleanup.
   *
   * Note: Server-push notifications (events) are not supported in
   * in-process mode. Event streaming requires WebSocket transport.
   */
  createInProcessClient(options?: {
    sessionId?: string;
    onNotification?: (message: string) => void;
  }): {
    request: (message: string) => Promise<string>;
    close: () => Promise<void>;
    state: ClientState;
  } {
    const now = Date.now();
    const state: ClientState = {
      clientId: randomUUID().slice(0, 8),
      initialized: false,
      browser: null,
      isPersistent: false,
      browserOwnership: "owned",
      context: null,
      contexts: new Map(),
      defaultContextId: null,
      pages: new Map(),
      pageToContext: new Map(),
      activePage: null,
      eventSubscriptions: new Set(),
      tracing: false,
      scopes: this.getClientScopes(),
      sessionStartTime: now,
      lastActivityTime: now,
      elementRegistries: new Map(),
      frameContexts: new Map(),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
      sessionId: options?.sessionId,
    };

    // Use a sentinel key for in-process clients (no real WebSocket)
    const sentinelWs = null;

    this.log("In-process client created", { clientId: state.clientId });

    const request = async (message: string): Promise<string> => {
      let parsed: JSONRPCRequest;
      try {
        parsed = JSON.parse(message) as JSONRPCRequest;
      } catch {
        return JSON.stringify(createErrorResponse(0, ErrorCodes.ParseError, "Invalid JSON"));
      }
      if (!isRequest(parsed)) {
        return JSON.stringify(
          createErrorResponse(0, ErrorCodes.ParseError, "Invalid JSON-RPC request")
        );
      }
      const response = await this.handleRequest(sentinelWs as unknown as WebSocket, state, parsed);
      return JSON.stringify(response);
    };

    const close = async (): Promise<void> => {
      this.log("In-process client disconnecting", { clientId: state.clientId });
      const isAlive = state.isPersistent
        ? this.isContextAlive(state.context)
        : Boolean(state.browser?.isConnected());
      if (state.sessionId && isAlive) {
        await _parkSession(state, this.getDormantStoreDeps());
      } else {
        await this.cleanupClient(state);
      }
    };

    return { request, close, state };
  }

  // ===========================================================================
  // Server Start / Stop
  // ===========================================================================

  async start(): Promise<void> {
    return new Promise((resolve) => {
      const connectionsPerIP = new Map<string, number>();
      const MAX_CONNECTIONS_PER_IP = parseInt(process.env.BAP_MAX_CONNECTIONS_PER_IP || "10", 10);
      const MAX_MESSAGE_SIZE = parseInt(process.env.BAP_MAX_MESSAGE_SIZE || "10485760", 10);

      this.httpServer = http.createServer((req, res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-XSS-Protection", "1; mode=block");
        res.setHeader("Cache-Control", "no-store");

        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", version: BAP_VERSION }));
          return;
        }

        res.writeHead(426, { "Content-Type": "text/plain" });
        res.end("WebSocket connection required");
      });

      const allowedOrigins = process.env.BAP_ALLOWED_ORIGINS?.split(",").filter(Boolean) || [];
      this.wss = new WebSocketServer({
        server: this.httpServer,
        maxPayload: MAX_MESSAGE_SIZE,
        verifyClient: (info, callback) => {
          const origin = info.req.headers.origin;
          const clientIP = info.req.socket.remoteAddress || "unknown";

          const currentConnections = connectionsPerIP.get(clientIP) || 0;
          if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
            this.logSecurity("CONNECTION_LIMIT", {
              ip: clientIP,
              current: currentConnections,
              max: MAX_CONNECTIONS_PER_IP,
            });
            callback(false, 429, "Too many connections from this IP");
            return;
          }

          if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            connectionsPerIP.set(clientIP, currentConnections + 1);
            callback(true);
          } else {
            this.logSecurity("ORIGIN_REJECTED", { origin, ip: clientIP });
            callback(false, 403, "Origin not allowed");
          }
        },
      });

      this.wss.on("connection", (ws, req) => {
        const clientIP = req.socket.remoteAddress || "unknown";
        ws.on("close", () => {
          const current = connectionsPerIP.get(clientIP) || 1;
          if (current <= 1) {
            connectionsPerIP.delete(clientIP);
          } else {
            connectionsPerIP.set(clientIP, current - 1);
          }
        });
        this.handleConnection(ws, req);
      });

      this.httpServer.listen(this.options.port, this.options.host, () => {
        this.log(`BAP server listening on ws://${this.options.host}:${this.options.port}`);
        if (this.getAuthToken()) {
          this.log("Authentication enabled - clients must provide valid token");
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.traceRecorder.close();

    for (const [ws, state] of this.clients) {
      await this.cleanupClient(state);
      ws.close();
    }
    this.clients.clear();

    for (const [sessionId, dormant] of this.dormantSessions) {
      clearTimeout(dormant.ttlHandle);
      try {
        if (dormant.browserOwnership === "borrowed") {
          // CDP attach: drop reference only, never close the external browser
        } else if (dormant.isPersistent) {
          await dormant.context?.close();
        } else {
          await dormant.browser?.close();
        }
      } catch {
        // Browser may already be closed
      }
      this.dormantSessions.delete(sessionId);
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }

  // ===========================================================================
  // Connection Handling
  // ===========================================================================

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const clientIP = req.socket.remoteAddress || "unknown";

    const socket = req.socket as typeof req.socket & { encrypted?: boolean };
    const isSecure = socket.encrypted === true || req.headers["x-forwarded-proto"] === "https";
    if (this.options.tls.requireTLS && !isSecure) {
      this.logSecurity("TLS_REQUIRED", { ip: clientIP });
      ws.close(1008, "TLS required: use wss:// instead of ws://");
      return;
    }
    if (this.options.tls.warnInsecure && !isSecure) {
      this.log(`WARNING: Insecure connection from ${clientIP}. Use WSS in production.`);
    }

    const authToken = this.getAuthToken();
    if (authToken) {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const queryToken = url.searchParams.get("token");
      const headerToken = req.headers["x-bap-token"] as string | undefined;
      const providedToken = queryToken ?? headerToken;

      if (!providedToken || !this.secureTokenCompare(providedToken, authToken)) {
        this.logSecurity("AUTH_FAILED", {
          ip: clientIP,
          hasToken: !!providedToken,
          method: queryToken ? "query" : headerToken ? "header" : "none",
        });
        ws.close(1008, "Unauthorized: invalid or missing token");
        return;
      }
      this.logSecurity("AUTH_SUCCESS", { ip: clientIP });
    }

    const now = Date.now();
    const state: ClientState = {
      clientId: randomUUID().slice(0, 8),
      initialized: false,
      browser: null,
      isPersistent: false,
      browserOwnership: "owned",
      context: null,
      contexts: new Map(),
      defaultContextId: null,
      pages: new Map(),
      pageToContext: new Map(),
      activePage: null,
      eventSubscriptions: new Set(),
      tracing: false,
      scopes: this.getClientScopes(),
      sessionStartTime: now,
      lastActivityTime: now,
      elementRegistries: new Map(),
      frameContexts: new Map(),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
    };

    setupSessionTimeouts(ws, state, this.options, { logSecurity: this.logSecurity.bind(this) });

    this.clients.set(ws, state);
    this.log("Client connected", { clientId: state.clientId, scopes: state.scopes });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (isRequest(message)) {
          const response = await this.handleRequest(ws, state, message);
          ws.send(JSON.stringify(response));
        }
      } catch (error) {
        const fullMessage = error instanceof Error ? error.message : "Parse error";
        this.log(`Parse error (internal): ${fullMessage}`);
        const errorResponse = createErrorResponse(
          0,
          ErrorCodes.ParseError,
          "Invalid JSON-RPC message"
        );
        ws.send(JSON.stringify(errorResponse));
      }
    });

    ws.on("close", async () => {
      this.log("Client disconnected", {
        clientId: state.clientId,
        sessionId: state.sessionId ?? "none",
      });

      const isAlive = state.isPersistent
        ? this.isContextAlive(state.context)
        : Boolean(state.browser?.isConnected());
      if (state.sessionId && isAlive) {
        await _parkSession(state, this.getDormantStoreDeps());
      } else {
        await this.cleanupClient(state);
      }

      this.clients.delete(ws);
    });

    ws.on("error", (error) => {
      this.log(`WebSocket error: ${error.message}`, { clientId: state.clientId });
    });
  }

  // ===========================================================================
  // Request Handling & Dispatch
  // ===========================================================================

  private async handleRequest(
    ws: WebSocket,
    state: ClientState,
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse> {
    const { id, method, params } = request;
    const requestId = randomUUID().slice(0, 8);
    const startTime = performance.now();

    this.log(`→ ${method}`, { clientId: state.clientId, reqId: requestId, rpcId: id });

    try {
      resetIdleTimeout(ws, state, this.options, { logSecurity: this.logSecurity.bind(this) });

      if (method !== "initialize" && !state.initialized) {
        return createErrorResponse(id, ErrorCodes.NotInitialized, "Server not initialized");
      }

      this.checkAuthorization(state, method);

      if (method !== "notifications/initialized") {
        this.checkRateLimit(state, "request");
      }

      const result = await this.dispatch(ws, state, method as BAPMethod, params ?? {});
      const duration = Math.round(performance.now() - startTime);
      this.log(`✓ ${method}`, {
        clientId: state.clientId,
        reqId: requestId,
        duration: `${duration}ms`,
      });

      // Trace recording
      this.traceRecorder.record({
        ts: new Date().toISOString(),
        sessionId: state.sessionId,
        clientId: state.clientId,
        method,
        duration,
        status: "ok",
        resultSummary: TraceRecorder.summarizeResult(method, result),
      });

      return createSuccessResponse(id, result);
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      this.log(`✗ ${method}`, {
        clientId: state.clientId,
        reqId: requestId,
        duration: `${duration}ms`,
        error: errMsg,
      });

      // Trace recording
      this.traceRecorder.record({
        ts: new Date().toISOString(),
        sessionId: state.sessionId,
        clientId: state.clientId,
        method,
        duration,
        status: "error",
        error: errMsg,
      });

      return this.handleError(id, error);
    }
  }

  private async dispatch(
    ws: WebSocket | null,
    state: ClientState,
    method: BAPMethod | string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const ctx = this.getHandlerContext();

    switch (method) {
      // Lifecycle
      case "initialize":
        return handleInitialize(state, params as unknown as InitializeParams, ctx);
      case "notifications/initialized":
        return undefined;
      case "shutdown":
        return handleShutdown(state, ctx);

      // Browser
      case "browser/launch":
        return handleBrowserLaunch(state, params as BrowserLaunchParams, ctx);
      case "browser/close":
        return handleBrowserClose(state, ctx);

      // Page
      case "page/create":
        return handlePageCreate(ws, state, params as PageCreateOptions, ctx);
      case "page/navigate":
        return handlePageNavigate(state, params, ctx);
      case "page/reload":
        return handlePageReload(state, params, ctx);
      case "page/goBack":
        return handlePageGoBack(state, params, ctx);
      case "page/goForward":
        return handlePageGoForward(state, params, ctx);
      case "page/close":
        return handlePageClose(state, params);
      case "page/list":
        return handlePageList(state);
      case "page/activate":
        return handlePageActivate(state, params);

      // Actions
      case "action/click":
        return handleActionClick(state, params, ctx);
      case "action/dblclick":
        return handleActionDblclick(state, params, ctx);
      case "action/type":
        return handleActionType(state, params, ctx);
      case "action/fill":
        return handleActionFill(state, params, ctx);
      case "action/clear":
        return handleActionClear(state, params, ctx);
      case "action/press":
        return handleActionPress(state, params, ctx);
      case "action/hover":
        return handleActionHover(state, params, ctx);
      case "action/scroll":
        return handleActionScroll(state, params, ctx);
      case "action/select":
        return handleActionSelect(state, params, ctx);
      case "action/check":
        return handleActionCheck(state, params, ctx);
      case "action/uncheck":
        return handleActionUncheck(state, params, ctx);
      case "action/upload":
        return handleActionUpload(state, params, ctx);
      case "action/drag":
        return handleActionDrag(state, params, ctx);

      // Observations
      case "observe/screenshot":
        return handleObserveScreenshot(state, params, ctx);
      case "observe/accessibility":
        return handleObserveAccessibility(state, params, ctx);
      case "observe/dom":
        return handleObserveDOM(state, params, ctx);
      case "observe/element":
        return handleObserveElement(state, params, ctx);
      case "observe/pdf":
        return handleObservePDF(state, params, ctx);
      case "observe/content":
        return handleObserveContent(state, params, ctx);
      case "observe/ariaSnapshot":
        return handleObserveAriaSnapshot(state, params, ctx);

      // Storage
      case "storage/getState":
        return handleStorageGetState(state, ctx);
      case "storage/setState":
        return handleStorageSetState(state, params, ctx);
      case "storage/getCookies":
        return handleStorageGetCookies(state, params, ctx);
      case "storage/setCookies":
        return handleStorageSetCookies(state, params, ctx);
      case "storage/clearCookies":
        return handleStorageClearCookies(state, params, ctx);

      // Emulation
      case "emulate/setViewport":
        return handleEmulateSetViewport(state, params, ctx);
      case "emulate/setUserAgent":
        return handleEmulateSetUserAgent(state, params, ctx);
      case "emulate/setGeolocation":
        return handleEmulateSetGeolocation(state, params, ctx);
      case "emulate/setOffline":
        return handleEmulateSetOffline(state, params, ctx);

      // Dialog
      case "dialog/handle":
        return handleDialogHandle(state, params, ctx);

      // Tracing
      case "trace/start":
        return handleTraceStart(state, params, ctx);
      case "trace/stop":
        return handleTraceStop(state, ctx);

      // Events
      case "events/subscribe":
        return handleEventsSubscribe(state, params);

      // Context
      case "context/create":
        return handleContextCreate(state, params as unknown as ContextCreateParams, ctx);
      case "context/list":
        return handleContextList(state);
      case "context/destroy":
        return handleContextDestroy(state, params as unknown as ContextDestroyParams);

      // Frame
      case "frame/list":
        return handleFrameList(state, params as unknown as FrameListParams, ctx);
      case "frame/switch":
        return handleFrameSwitch(state, params as unknown as FrameSwitchParams, ctx);
      case "frame/main":
        return handleFrameMain(state, params as unknown as FrameMainParams, ctx);

      // Stream
      case "stream/cancel":
        return handleStreamCancel(state, params as unknown as StreamCancelParams);

      // Approval
      case "approval/respond":
        return handleApprovalRespond(state, params as unknown as ApprovalRespondParams);

      // Discovery
      case "discovery/discover":
        return handleDiscoveryDiscover(state, params as unknown as DiscoveryDiscoverParams, ctx);

      // Agent
      case "agent/act":
        return handleAgentAct(ws, state, params as unknown as AgentActParams, ctx);
      case "agent/observe":
        return handleAgentObserve(state, params as unknown as AgentObserveParams, ctx);
      case "agent/extract":
        return handleAgentExtract(state, params as unknown as AgentExtractParams, ctx);

      default:
        throw new BAPServerError(ErrorCodes.MethodNotFound, `Unknown method: ${method}`);
    }
  }

  // ===========================================================================
  // Utility Methods (kept on class for HandlerContext binding)
  // ===========================================================================

  private getPage(state: ClientState, pageId?: string): PlaywrightPage {
    const id = pageId ?? state.activePage;
    if (!id) {
      throw new BAPServerError(ErrorCodes.PageNotFound, "No active page");
    }
    const page = state.pages.get(id);
    if (!page) {
      throw new BAPServerError(ErrorCodes.PageNotFound, `Page not found: ${id}`);
    }
    return page;
  }

  private ensureBrowser(state: ClientState): void {
    if (!state.context) {
      throw new BAPServerError(ErrorCodes.BrowserNotLaunched, "Browser not launched");
    }
    if (!state.isPersistent && !state.browser) {
      throw new BAPServerError(ErrorCodes.BrowserNotLaunched, "Browser not launched");
    }
  }

  private getBrowserType(name: string): BrowserType {
    switch (name) {
      case "chromium":
        return chromium;
      case "firefox":
        return firefox;
      case "webkit":
        return webkit;
      default:
        throw new BAPServerError(ErrorCodes.InvalidParams, `Unknown browser: ${name}`);
    }
  }

  private mapWaitUntil(
    waitUntil?: WaitUntilState
  ): "load" | "domcontentloaded" | "networkidle" | "commit" | undefined {
    if (!waitUntil) return "load";
    return waitUntil;
  }

  private checkRateLimit(state: ClientState, type: "request" | "screenshot"): void {
    const now = Date.now();
    const limits = this.options.limits;

    if (type === "request") {
      const maxRps = limits.maxRequestsPerSecond ?? 50;
      const windowMs = 1000;
      if (!state.requestWindow) {
        state.requestWindow = { count: 0, windowStart: now };
      }
      if (now - state.requestWindow.windowStart >= windowMs) {
        state.requestWindow = { count: 1, windowStart: now };
      } else {
        if (state.requestWindow.count >= maxRps) {
          throw new BAPServerError(
            ErrorCodes.ServerError,
            `Rate limit exceeded: ${maxRps} requests per second`,
            true,
            windowMs - (now - state.requestWindow.windowStart)
          );
        }
        state.requestWindow.count++;
      }
    }

    if (type === "screenshot") {
      const maxPerMinute = limits.maxScreenshotsPerMinute ?? 30;
      const windowMs = 60000;
      if (!state.screenshotWindow) {
        state.screenshotWindow = { count: 0, windowStart: now };
      }
      if (now - state.screenshotWindow.windowStart >= windowMs) {
        state.screenshotWindow = { count: 1, windowStart: now };
      } else {
        if (state.screenshotWindow.count >= maxPerMinute) {
          throw new BAPServerError(
            ErrorCodes.ServerError,
            `Screenshot rate limit exceeded: ${maxPerMinute} per minute`,
            true,
            windowMs - (now - state.screenshotWindow.windowStart)
          );
        }
        state.screenshotWindow.count++;
      }
    }
  }

  private checkPageLimit(state: ClientState): void {
    const maxPages = this.options.limits.maxPagesPerClient ?? 10;
    if (state.pages.size >= maxPages) {
      throw new BAPServerError(
        ErrorCodes.ServerError,
        `Page limit exceeded: maximum ${maxPages} pages per client`
      );
    }
  }

  private getPageId(page: PlaywrightPage): string {
    for (const state of this.clients.values()) {
      for (const [pageId, p] of state.pages) {
        if (p === page) return pageId;
      }
    }
    for (const dormant of this.dormantSessions.values()) {
      for (const [pageId, p] of dormant.pages) {
        if (p === page) return pageId;
      }
    }
    throw new BAPServerError(ErrorCodes.PageNotFound, "Page not found in registry");
  }

  private findConnectedClientForPage(pageId: string): { ws: WebSocket; state: ClientState } | null {
    for (const [ws, state] of this.clients) {
      if (state.pages.has(pageId)) return { ws, state };
    }
    return null;
  }

  private findPageOwner(pageId: string): PageOwner | null {
    const connected = this.findConnectedClientForPage(pageId);
    if (connected) return connected;

    for (const dormant of this.dormantSessions.values()) {
      if (dormant.pages.has(pageId)) return { ws: null, state: dormant };
    }
    return null;
  }

  private removePageFromOwner(state: ClientState | DormantSession, pageId: string): void {
    state.pages.delete(pageId);
    state.pageToContext.delete(pageId);
    state.elementRegistries.delete(pageId);
    state.frameContexts.delete(pageId);
    if (state.activePage === pageId) {
      state.activePage = state.pages.keys().next().value ?? null;
    }
  }

  private isContextAlive(context: BrowserContext | null): boolean {
    if (!context) return false;
    try {
      const browser = context.browser();
      if (browser) return browser.isConnected();
      void context.pages();
      return true;
    } catch {
      return false;
    }
  }

  private clearConnectionScopedState(state: ClientState, errorMessage: string): void {
    if (state.speculativePrefetchTimer) {
      clearTimeout(state.speculativePrefetchTimer);
      state.speculativePrefetchTimer = undefined;
    }
    state.speculativeObservation = undefined;

    for (const stream of state.activeStreams.values()) {
      stream.cancelled = true;
    }
    state.activeStreams.clear();

    for (const pending of state.pendingApprovals.values()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new BAPServerError(ErrorCodes.TargetClosed, errorMessage));
    }
    state.pendingApprovals.clear();
  }

  private async cleanupClient(state: ClientState): Promise<void> {
    clearSessionTimeouts(state);
    this.clearConnectionScopedState(state, "Client disconnected");

    if (state.tracing && state.context) {
      try {
        await state.context.tracing.stop();
      } catch {
        /* Ignore */
      }
    }

    if (state.browserOwnership === "borrowed") {
      // CDP attach: drop reference only, never close the external browser
    } else if (state.isPersistent && state.context) {
      try {
        await state.context.close();
      } catch {
        /* Ignore */
      }
    } else if (state.browser) {
      try {
        await state.browser.close();
      } catch {
        /* Ignore */
      }
    }

    state.browser = null;
    state.isPersistent = false;
    state.browserOwnership = "owned";
    state.context = null;
    state.pages.clear();
    state.pageToContext.clear();
    state.activePage = null;
    state.elementRegistries.clear();
    state.frameContexts.clear();
    state.sessionApprovals.clear();
    state.contexts.clear();
    state.defaultContextId = null;
    state.initialized = false;
  }

  private convertAccessibilityNode(
    node: PlaywrightAccessibilityNode | null | undefined
  ): AccessibilityNode {
    if (!node) return { role: "none" };
    return {
      role: node.role ?? "none",
      name: node.name,
      value: node.value,
      description: node.description,
      checked: node.checked,
      disabled: node.disabled,
      expanded: node.expanded,
      focused: node.focused,
      selected: node.selected,
      required: node.required,
      level: node.level,
      children: node.children?.map((child) => this.convertAccessibilityNode(child)),
    };
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n\n+/g, "\n\n")
      .trim();
  }

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  private handleError(id: string | number, error: unknown): JSONRPCErrorResponse {
    if (error instanceof BAPServerError) {
      return createErrorResponse(id, error.code as ErrorCode, error.message, {
        retryable: error.retryable,
        retryAfterMs: error.retryAfterMs,
        details: error.details,
        recoveryHint: error.recoveryHint,
      });
    }

    if (error instanceof Error) {
      const message = error.message;
      if (message.includes("Timeout")) {
        return createErrorResponse(id, ErrorCodes.Timeout, message, {
          retryable: true,
          recoveryHint: "Increase timeout or wait for the page to finish loading, then retry",
        });
      }
      if (message.includes("Target closed") || message.includes("Target page")) {
        return createErrorResponse(id, ErrorCodes.TargetClosed, message, {
          retryable: false,
          recoveryHint:
            "The page was closed. Create a new page with page/create or navigate to a URL",
        });
      }
      if (message.includes("Element is not visible")) {
        return createErrorResponse(id, ErrorCodes.ElementNotVisible, message, {
          retryable: true,
          recoveryHint: "Scroll the element into view or wait for it to appear, then retry",
        });
      }
      if (message.includes("Element is not enabled")) {
        return createErrorResponse(id, ErrorCodes.ElementNotEnabled, message, {
          retryable: true,
          recoveryHint: "Wait for the element to become enabled, then retry",
        });
      }
      if (message.includes("waiting for") && message.includes("to be visible")) {
        return createErrorResponse(id, ErrorCodes.ElementNotFound, message, {
          retryable: true,
          retryAfterMs: 1000,
          recoveryHint:
            "Run observe() to get current interactive elements and use a fresh selector",
        });
      }
      return createErrorResponse(id, ErrorCodes.InternalError, message, { retryable: false });
    }

    return createErrorResponse(id, ErrorCodes.InternalError, "Unknown error", { retryable: false });
  }

  // ===========================================================================
  // Logging
  // ===========================================================================

  private logSecurity(event: string, details: Record<string, unknown>): void {
    // Security events always log regardless of debug flag — use a dedicated logger
    const entry = { event, ...details };
    process.stderr.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "security",
        component: "BAP Server",
        ...entry,
      }) + "\n"
    );
  }

  private log(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(message, context);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

export async function main(): Promise<void> {
  const port = parseInt(process.env.BAP_PORT ?? "9222", 10);
  const host = process.env.BAP_HOST ?? "localhost";
  const headless = process.env.BAP_HEADLESS !== "false";
  const debug = process.env.BAP_DEBUG === "true";

  const server = new BAPPlaywrightServer({
    port,
    host,
    headless,
    debug,
  });

  await server.start();
  console.log(`BAP Playwright server running on ws://${host}:${port}`);

  const shutdown = async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
