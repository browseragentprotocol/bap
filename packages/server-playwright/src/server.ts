/**
 * @fileoverview BAP Playwright Server
 * @module @browseragentprotocol/server-playwright
 * @version 0.2.0
 *
 * Reference implementation of a BAP server using Playwright.
 * Translates BAP protocol messages to Playwright API calls.
 *
 * SECURITY: This server implements secure-by-default configuration.
 * All credential protection options are enabled by default.
 *
 * AUTHORIZATION: Supports scope-based authorization for fine-grained access control.
 * See BAPScope type for available scopes.
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import * as http from "http";
import * as path from "path";
import { WebSocket, WebSocketServer } from "ws";
import {
  chromium,
  firefox,
  webkit,
  Browser,
  BrowserContext,
  Page as PlaywrightPage,
  Locator,
  BrowserType,
  ConsoleMessage,
  Dialog,
  Download,
  Request,
  Response,
} from "playwright";
import {
  BAP_VERSION,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCErrorResponse,
  ErrorCodes,
  ErrorCode,
  BAPSelector,
  BAPMethod,
  Page,
  StorageState,
  AccessibilityNode,
  Cookie,
  AriaRole,
  // Parameter types
  InitializeParams,
  InitializeResult,
  BrowserLaunchParams,
  BrowserLaunchResult,
  PageCreateOptions,
  PageNavigateResult,
  WaitUntilState,
  ClickOptions,
  TypeOptions,
  ScrollOptions,
  ActionOptions,
  ScreenshotOptions,
  AccessibilityTreeOptions,
  ObserveScreenshotResult,
  ObserveAccessibilityResult,
  ObserveDOMResult,
  ObserveElementResult,
  ObservePDFResult,
  ObserveContentResult,
  ElementProperty,
  ContentFormat,
  FileUpload,
  ServerCapabilities,
  // Agent types (composite actions, observations, and data extraction)
  AgentActParams,
  AgentActResult,
  AgentObserveParams,
  AgentObserveResult,
  AgentExtractParams,
  AgentExtractResult,
  ExecutionStep,
  StepResult,
  StepCondition,
  InteractiveElement,
  ActionHint,
  ALLOWED_ACT_ACTIONS,
  // Element identity and annotation types
  ElementIdentity,
  RefStability,
  AnnotationOptions,
  AnnotationMapping,
  // Context types (Multi-Context Support)
  ContextCreateParams,
  ContextCreateResult,
  ContextInfo,
  ContextListResult,
  ContextDestroyParams,
  ContextDestroyResult,
  ContextOptions,
  // Frame types (Frame & Shadow DOM Support)
  FrameInfo,
  FrameListParams,
  FrameListResult,
  FrameSwitchParams,
  FrameSwitchResult,
  FrameMainParams,
  FrameMainResult,
  // Streaming types
  StreamCancelParams,
  StreamCancelResult,
  // Approval types (Human-in-the-Loop)
  ApprovalRespondParams,
  ApprovalRespondResult,
  // Helpers
  createSuccessResponse,
  createErrorResponse,
  createNotification,
  isRequest,
} from "@browseragentprotocol/protocol";
import {
  generateStableRef,
  compareIdentities,
  createElementRegistry,
  cleanupStaleEntries,
  type PageElementRegistry,
} from "@browseragentprotocol/protocol";

// =============================================================================
// Authorization Types (v0.2.0) - Inlined for build compatibility
// =============================================================================

/**
 * BAP authorization scopes for fine-grained access control
 */
type BAPScope =
  | '*'
  | 'browser:*' | 'browser:launch' | 'browser:close'
  | 'context:*' | 'context:create' | 'context:read' | 'context:destroy'
  | 'page:*' | 'page:read' | 'page:create' | 'page:navigate' | 'page:close'
  | 'action:*' | 'action:click' | 'action:type' | 'action:fill' | 'action:scroll'
  | 'action:select' | 'action:upload' | 'action:drag'
  | 'observe:*' | 'observe:screenshot' | 'observe:accessibility' | 'observe:dom'
  | 'observe:element' | 'observe:content' | 'observe:pdf'
  | 'storage:*' | 'storage:read' | 'storage:write'
  | 'network:*' | 'network:intercept'
  | 'emulate:*' | 'emulate:viewport' | 'emulate:geolocation' | 'emulate:offline'
  | 'trace:*' | 'trace:start' | 'trace:stop';

/** Predefined scope profiles for common use cases */
const ScopeProfiles = {
  readonly: ['page:read', 'observe:*'] as BAPScope[],
  standard: [
    'browser:launch', 'browser:close', 'page:*',
    'action:click', 'action:type', 'action:fill', 'action:scroll', 'action:select',
    'observe:*', 'emulate:viewport',
  ] as BAPScope[],
  full: ['browser:*', 'page:*', 'action:*', 'observe:*', 'emulate:*', 'trace:*'] as BAPScope[],
  privileged: ['*'] as BAPScope[],
} as const;

/** Method to required scopes mapping */
const MethodScopes: Record<string, BAPScope[]> = {
  'initialize': [], 'shutdown': [], 'notifications/initialized': [],
  'browser/launch': ['browser:launch', 'browser:*', '*'],
  'browser/close': ['browser:close', 'browser:*', '*'],
  // Context methods (Multi-Context Support)
  'context/create': ['context:create', 'context:*', '*'],
  'context/list': ['context:read', 'context:*', '*'],
  'context/destroy': ['context:destroy', 'context:*', '*'],
  // Page methods
  'page/create': ['page:create', 'page:*', '*'],
  'page/navigate': ['page:navigate', 'page:*', '*'],
  'page/reload': ['page:navigate', 'page:*', '*'],
  'page/goBack': ['page:navigate', 'page:*', '*'],
  'page/goForward': ['page:navigate', 'page:*', '*'],
  'page/close': ['page:close', 'page:*', '*'],
  'page/list': ['page:read', 'page:*', '*'],
  'page/activate': ['page:read', 'page:*', '*'],
  // Frame methods (Frame & Shadow DOM Support)
  'frame/list': ['page:read', 'page:*', '*'],
  'frame/switch': ['page:navigate', 'page:*', '*'],
  'frame/main': ['page:navigate', 'page:*', '*'],
  'action/click': ['action:click', 'action:*', '*'],
  'action/dblclick': ['action:click', 'action:*', '*'],
  'action/type': ['action:type', 'action:*', '*'],
  'action/fill': ['action:fill', 'action:*', '*'],
  'action/clear': ['action:fill', 'action:*', '*'],
  'action/press': ['action:type', 'action:*', '*'],
  'action/hover': ['action:click', 'action:*', '*'],
  'action/scroll': ['action:scroll', 'action:*', '*'],
  'action/select': ['action:select', 'action:*', '*'],
  'action/check': ['action:click', 'action:*', '*'],
  'action/uncheck': ['action:click', 'action:*', '*'],
  'action/upload': ['action:upload', 'action:*', '*'],
  'action/drag': ['action:drag', 'action:*', '*'],
  'observe/screenshot': ['observe:screenshot', 'observe:*', '*'],
  'observe/accessibility': ['observe:accessibility', 'observe:*', '*'],
  'observe/dom': ['observe:dom', 'observe:*', '*'],
  'observe/element': ['observe:element', 'observe:*', '*'],
  'observe/pdf': ['observe:pdf', 'observe:*', '*'],
  'observe/content': ['observe:content', 'observe:*', '*'],
  'observe/ariaSnapshot': ['observe:accessibility', 'observe:*', '*'],
  'storage/getState': ['storage:read', 'storage:*', '*'],
  'storage/setState': ['storage:write', 'storage:*', '*'],
  'storage/getCookies': ['storage:read', 'storage:*', '*'],
  'storage/setCookies': ['storage:write', 'storage:*', '*'],
  'storage/clearCookies': ['storage:write', 'storage:*', '*'],
  'network/intercept': ['network:intercept', 'network:*', '*'],
  'network/fulfill': ['network:intercept', 'network:*', '*'],
  'network/abort': ['network:intercept', 'network:*', '*'],
  'network/continue': ['network:intercept', 'network:*', '*'],
  'emulate/setViewport': ['emulate:viewport', 'emulate:*', '*'],
  'emulate/setUserAgent': ['emulate:viewport', 'emulate:*', '*'],
  'emulate/setGeolocation': ['emulate:geolocation', 'emulate:*', '*'],
  'emulate/setOffline': ['emulate:offline', 'emulate:*', '*'],
  'dialog/handle': ['action:click', 'action:*', '*'],
  'trace/start': ['trace:start', 'trace:*', '*'],
  'trace/stop': ['trace:stop', 'trace:*', '*'],
  'events/subscribe': ['observe:*', '*'],
  // Stream methods (Streaming Responses)
  'stream/cancel': ['observe:*', '*'],
  // Approval methods (Human-in-the-Loop)
  'approval/respond': ['action:*', '*'],
  // Agent methods (composite actions, observations, and data extraction)
  'agent/act': ['action:*', '*'],
  'agent/observe': ['observe:*', '*'],
  'agent/extract': ['observe:*', '*'],
};

/** Check if client has permission for a method */
function hasScope(grantedScopes: BAPScope[], method: string): boolean {
  if (grantedScopes.includes('*')) return true;
  const requiredScopes = MethodScopes[method];
  if (!requiredScopes) return grantedScopes.includes('*');
  if (requiredScopes.length === 0) return true;
  return requiredScopes.some(required => {
    if (grantedScopes.includes(required)) return true;
    const [category] = required.split(':');
    return grantedScopes.includes(`${category}:*` as BAPScope);
  });
}

/** Parse scopes from string or array */
function parseScopes(input: string | string[] | undefined): BAPScope[] {
  if (!input) return [];
  if (Array.isArray(input)) return input as BAPScope[];
  return input.split(',').map(s => s.trim()) as BAPScope[];
}

/** Authorization error code */
const AuthorizationErrorCode = -32023;

/** Create an authorization error */
function createAuthorizationError(method: string, requiredScopes: BAPScope[]) {
  return {
    code: AuthorizationErrorCode,
    message: `Insufficient permissions for '${method}'. Required scopes: ${requiredScopes.join(' or ')}`,
    data: {
      retryable: false,
      details: { method, requiredScopes },
    },
  };
}

/** Action confirmation event for agent feedback */
interface ActionConfirmationEvent {
  pageId: string;
  action: string;
  selector?: { type: string; value?: string; role?: string; name?: string };
  status: 'success' | 'failed' | 'partial';
  changes?: {
    urlChanged?: boolean;
    newUrl?: string;
    elementState?: { visible?: boolean; checked?: boolean; value?: string };
  };
  error?: string;
  timestamp: number;
}

// =============================================================================
// Server Configuration
// =============================================================================

/**
 * Security configuration for the BAP server
 */
export interface BAPSecurityOptions {
  /**
   * Protocols to block (default: ['file', 'javascript', 'data', 'vbscript'])
   * Set to empty array to allow all protocols (not recommended)
   */
  blockedProtocols?: string[];
  /**
   * Hostnames to block (default includes cloud metadata endpoints)
   * Set to empty array to allow all hosts
   */
  blockedHosts?: string[];
  /**
   * If set, only these protocols are allowed (overrides blockedProtocols)
   */
  allowedProtocols?: string[];
  /**
   * If set, only navigation to these hosts is allowed
   */
  allowedHosts?: string[];
  /**
   * CREDENTIAL PROTECTION OPTIONS
   */
  /**
   * Redact sensitive content from DOM/HTML responses (default: true)
   * Removes password field values, JWT tokens, etc.
   */
  redactSensitiveContent?: boolean;
  /**
   * Block direct value extraction from password fields (default: true)
   */
  blockPasswordValueExtraction?: boolean;
  /**
   * Hide password fields in screenshots by overlaying them (default: false)
   * Note: This adds latency to screenshot operations
   */
  redactPasswordsInScreenshots?: boolean;
  /**
   * Block storage state extraction entirely (default: false)
   * Use for high-security environments
   */
  blockStorageStateExtraction?: boolean;
}

/**
 * Rate limiting configuration
 */
export interface BAPLimitsOptions {
  /** Maximum pages per client (default: 10) */
  maxPagesPerClient?: number;
  /** Maximum requests per second per client (default: 50) */
  maxRequestsPerSecond?: number;
  /** Maximum screenshots per minute per client (default: 30) */
  maxScreenshotsPerMinute?: number;
}

/**
 * Authorization configuration
 */
export interface BAPAuthorizationOptions {
  /**
   * Default scopes for authenticated clients (default: ScopeProfiles.standard)
   * Can be overridden per-token using JWT claims or BAP_SCOPES env var
   */
  defaultScopes?: BAPScope[];
  /**
   * Environment variable name for scopes (default: BAP_SCOPES)
   * Value should be comma-separated list of scopes
   */
  scopesEnvVar?: string;
}

/**
 * Session management configuration
 */
export interface BAPSessionOptions {
  /**
   * Maximum session duration in seconds (default: 3600 = 1 hour)
   * Sessions are terminated after this duration regardless of activity
   */
  maxDuration?: number;
  /**
   * Idle timeout in seconds (default: 600 = 10 minutes)
   * Sessions are terminated after this period of inactivity
   */
  idleTimeout?: number;
}

/**
 * TLS/Security enforcement options
 */
export interface BAPTLSOptions {
  /**
   * Require TLS (WSS) for connections (default: false in dev, true in production)
   * Production mode is detected via NODE_ENV=production
   */
  requireTLS?: boolean;
  /**
   * Warn about non-TLS connections in logs (default: true)
   */
  warnInsecure?: boolean;
}

/**
 * BAP Server configuration options
 */
export interface BAPServerOptions {
  /** Port to listen on */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Default browser type */
  defaultBrowser?: "chromium" | "firefox" | "webkit";
  /** Default headless mode */
  headless?: boolean;
  /** Enable debug logging */
  debug?: boolean;
  /** Default timeout for operations */
  timeout?: number;
  /**
   * Authentication token for WebSocket connections.
   * If set, clients must provide this token via query param (?token=xxx)
   * or header (X-BAP-Token: xxx) to connect.
   */
  authToken?: string;
  /**
   * Environment variable name to read auth token from (default: BAP_AUTH_TOKEN)
   * Only used if authToken is not directly provided.
   */
  authTokenEnvVar?: string;
  /** Security configuration */
  security?: BAPSecurityOptions;
  /** Rate limiting configuration */
  limits?: BAPLimitsOptions;
  /** Authorization configuration (v0.2.0) */
  authorization?: BAPAuthorizationOptions;
  /** Session management configuration (v0.2.0) */
  session?: BAPSessionOptions;
  /** TLS enforcement configuration (v0.2.0) */
  tls?: BAPTLSOptions;
}

/**
 * Default blocked protocols for URL validation
 */
const DEFAULT_BLOCKED_PROTOCOLS = ['file', 'javascript', 'data', 'vbscript'];

/**
 * Default blocked hosts (cloud metadata endpoints)
 */
const DEFAULT_BLOCKED_HOSTS = [
  '169.254.169.254',           // AWS EC2 metadata
  'metadata.google.internal',   // GCP metadata
  'metadata.goog',              // GCP metadata alternative
  '100.100.100.200',           // Alibaba Cloud metadata
  'fd00:ec2::254',             // AWS EC2 IPv6 metadata
];

/**
 * Allowed browser launch arguments (allowlist)
 */
const ALLOWED_BROWSER_ARGS: (string | RegExp)[] = [
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-software-rasterizer',
  /^--window-size=\d+,\d+$/,
  /^--window-position=\d+,\d+$/,
  '--start-maximized',
  '--start-fullscreen',
  '--kiosk',
  '--incognito',
  /^--proxy-server=.+$/,
  /^--lang=[a-z]{2}(-[A-Z]{2})?$/,
];

/**
 * Blocked browser launch arguments (blocklist)
 */
const BLOCKED_BROWSER_ARGS = [
  '--disable-web-security',
  '--disable-site-isolation-trials',
  '--remote-debugging-port',
  '--remote-debugging-address',
  '--user-data-dir',
  '--load-extension',
  '--disable-extensions-except',
  '--allow-running-insecure-content',
  '--reduce-security-for-testing',
];

/**
 * SECURE-BY-DEFAULT: All security options enabled by default
 */
const DEFAULT_OPTIONS: Required<Omit<BAPServerOptions, 'authToken' | 'authTokenEnvVar' | 'security' | 'limits' | 'authorization' | 'session' | 'tls'>> & {
  authToken: string | undefined;
  authTokenEnvVar: string;
  security: Required<BAPSecurityOptions>;
  limits: Required<BAPLimitsOptions>;
  authorization: Required<BAPAuthorizationOptions>;
  session: Required<BAPSessionOptions>;
  tls: Required<BAPTLSOptions>;
} = {
  port: 9222,
  host: "localhost",
  defaultBrowser: "chromium",
  headless: true,
  debug: false,
  timeout: 30000,
  authToken: undefined,
  authTokenEnvVar: 'BAP_AUTH_TOKEN',
  // SECURE-BY-DEFAULT: All credential protection enabled
  security: {
    blockedProtocols: DEFAULT_BLOCKED_PROTOCOLS,
    blockedHosts: DEFAULT_BLOCKED_HOSTS,
    allowedProtocols: undefined as unknown as string[],
    allowedHosts: undefined as unknown as string[],
    // SECURE-BY-DEFAULT: All credential protection options enabled
    redactSensitiveContent: true,
    blockPasswordValueExtraction: true,
    redactPasswordsInScreenshots: false, // Disabled due to latency impact
    blockStorageStateExtraction: false,  // Enable for high-security environments
  },
  limits: {
    maxPagesPerClient: 10,
    maxRequestsPerSecond: 50,
    maxScreenshotsPerMinute: 30,
  },
  // Authorization defaults (v0.2.0)
  authorization: {
    defaultScopes: ScopeProfiles.standard,
    scopesEnvVar: 'BAP_SCOPES',
  },
  // Session management defaults (v0.2.0)
  session: {
    maxDuration: 3600,    // 1 hour max session
    idleTimeout: 600,     // 10 minutes idle timeout
  },
  // TLS enforcement (v0.2.0)
  tls: {
    requireTLS: process.env.NODE_ENV === 'production',
    warnInsecure: true,
  },
};

// =============================================================================
// Client State Types
// =============================================================================

/** PERF: Sliding window counter for O(1) rate limiting */
interface SlidingWindow {
  count: number;
  windowStart: number;
}

/** Context info stored in client state */
interface ContextState {
  context: BrowserContext;
  created: number;
  options?: ContextOptions;
}

/** Active stream info */
interface ActiveStream {
  streamId: string;
  buffer: Buffer;
  sent: number;
  cancelled: boolean;
  contentType: string;
  chunkSize: number;
}

/** Pending approval request */
interface PendingApproval {
  requestId: string;
  originalRequest: JSONRPCRequest;
  rule: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
}

/** Frame context for frame switching */
interface FrameContext {
  pageId: string;
  frameId: string | null; // null means main frame
}

/** Client state for a connected WebSocket client */
interface ClientState {
  initialized: boolean;
  browser: Browser | null;
  /** Default context (backwards compatible) */
  context: BrowserContext | null;
  /** Multi-context support: named contexts */
  contexts: Map<string, ContextState>;
  /** Default context ID */
  defaultContextId: string | null;
  pages: Map<string, PlaywrightPage>;
  /** Map from pageId to contextId */
  pageToContext: Map<string, string>;
  activePage: string | null;
  eventSubscriptions: Set<string>;
  tracing: boolean;
  /** PERF: Sliding window for request rate limiting - O(1) instead of O(n) */
  requestWindow?: SlidingWindow;
  /** PERF: Sliding window for screenshot rate limiting - O(1) instead of O(n) */
  screenshotWindow?: SlidingWindow;

  // Authorization (v0.2.0)
  /** Granted scopes for this client */
  scopes: BAPScope[];

  // Session management (v0.2.0)
  /** Session start time (Unix timestamp ms) */
  sessionStartTime: number;
  /** Last activity time (Unix timestamp ms) */
  lastActivityTime: number;
  /** Session timeout handle */
  sessionTimeoutHandle?: NodeJS.Timeout;
  /** Idle timeout handle */
  idleTimeoutHandle?: NodeJS.Timeout;

  // Element Reference System (stable refs)
  /** Element registries per page for stable ref tracking */
  elementRegistries: Map<string, PageElementRegistry>;

  // Frame context (Frame & Shadow DOM Support)
  /** Current frame context per page */
  frameContexts: Map<string, FrameContext>;

  // Streaming (Streaming Responses)
  /** Active streams */
  activeStreams: Map<string, ActiveStream>;

  // Approval (Human-in-the-Loop)
  /** Pending approval requests */
  pendingApprovals: Map<string, PendingApproval>;
  /** Session-level approvals (for approve-session) */
  sessionApprovals: Set<string>;
}

// =============================================================================
// BAP Server
// =============================================================================

/**
 * BAP Server - Playwright implementation
 *
 * @example
 * ```typescript
 * const server = new BAPPlaywrightServer({ port: 9222 });
 * await server.start();
 * console.log("BAP server running on ws://localhost:9222");
 * ```
 */
export class BAPPlaywrightServer extends EventEmitter {
  private readonly options: typeof DEFAULT_OPTIONS;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, ClientState>();

  constructor(options: BAPServerOptions = {}) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      security: { ...DEFAULT_OPTIONS.security, ...options.security },
      limits: { ...DEFAULT_OPTIONS.limits, ...options.limits },
      authorization: { ...DEFAULT_OPTIONS.authorization, ...options.authorization },
      session: { ...DEFAULT_OPTIONS.session, ...options.session },
      tls: { ...DEFAULT_OPTIONS.tls, ...options.tls },
    };
  }

  /**
   * Get client scopes from environment or defaults
   */
  private getClientScopes(): BAPScope[] {
    const envScopes = process.env[this.options.authorization.scopesEnvVar];
    if (envScopes) {
      return parseScopes(envScopes);
    }
    return this.options.authorization.defaultScopes;
  }

  /**
   * Get the effective auth token (from options or environment)
   */
  private getAuthToken(): string | undefined {
    return this.options.authToken || process.env[this.options.authTokenEnvVar];
  }

  /**
   * SECURITY: Timing-safe token comparison to prevent timing attacks
   */
  private secureTokenCompare(provided: string, expected: string): boolean {
    const { timingSafeEqual } = require('crypto');
    if (provided.length !== expected.length) {
      // Still do a comparison to maintain constant time
      timingSafeEqual(Buffer.from(provided), Buffer.from(provided));
      return false;
    }
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  /**
   * SECURITY: Audit logging for security events
   */
  private logSecurity(event: string, details: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, event, ...details };
    // Always log security events to stderr for audit trail
    console.error(`[BAP-SECURITY] ${JSON.stringify(logEntry)}`);
  }

  // ===========================================================================
  // Session Management (v0.2.0)
  // ===========================================================================

  /**
   * Set up session timeouts for a client connection
   */
  private setupSessionTimeouts(ws: WebSocket, state: ClientState): void {
    const { maxDuration, idleTimeout } = this.options.session;

    // Maximum session duration timeout
    state.sessionTimeoutHandle = setTimeout(() => {
      this.logSecurity('SESSION_EXPIRED', {
        reason: 'max_duration',
        duration: maxDuration,
      });
      ws.close(1008, 'Session expired: maximum duration exceeded');
    }, maxDuration * 1000);

    // Idle timeout (reset on each request)
    state.idleTimeoutHandle = setTimeout(() => {
      this.logSecurity('SESSION_EXPIRED', {
        reason: 'idle_timeout',
        timeout: idleTimeout,
      });
      ws.close(1008, 'Session expired: idle timeout');
    }, idleTimeout * 1000);
  }

  /**
   * Reset idle timeout on activity
   */
  private resetIdleTimeout(ws: WebSocket, state: ClientState): void {
    state.lastActivityTime = Date.now();

    // Clear existing idle timeout
    if (state.idleTimeoutHandle) {
      clearTimeout(state.idleTimeoutHandle);
    }

    // Set new idle timeout
    state.idleTimeoutHandle = setTimeout(() => {
      this.logSecurity('SESSION_EXPIRED', {
        reason: 'idle_timeout',
        timeout: this.options.session.idleTimeout,
      });
      ws.close(1008, 'Session expired: idle timeout');
    }, this.options.session.idleTimeout * 1000);
  }

  /**
   * Clear all session timeouts
   */
  private clearSessionTimeouts(state: ClientState): void {
    if (state.sessionTimeoutHandle) {
      clearTimeout(state.sessionTimeoutHandle);
      state.sessionTimeoutHandle = undefined;
    }
    if (state.idleTimeoutHandle) {
      clearTimeout(state.idleTimeoutHandle);
      state.idleTimeoutHandle = undefined;
    }
  }

  // ===========================================================================
  // Authorization (v0.2.0)
  // ===========================================================================

  /**
   * Check if client has permission to call a method
   * @throws BAPServerError if unauthorized
   */
  private checkAuthorization(state: ClientState, method: string): void {
    if (!hasScope(state.scopes, method)) {
      const requiredScopes = MethodScopes[method] || ['*'];
      this.logSecurity('AUTHORIZATION_DENIED', {
        method,
        clientScopes: state.scopes,
        requiredScopes,
      });
      const error = createAuthorizationError(method, requiredScopes as BAPScope[]);
      throw new BAPServerError(error.code, error.message, false, undefined, error.data?.details);
    }
  }

  // ===========================================================================
  // Action Confirmation Events (v0.2.0)
  // ===========================================================================

  /**
   * Send action confirmation event to client
   * @internal Reserved for future use in action handlers
   */
  // @ts-expect-error Reserved for v0.2.0+ action handlers
  private sendActionConfirmation(
    ws: WebSocket,
    state: ClientState,
    event: ActionConfirmationEvent
  ): void {
    if (state.eventSubscriptions.has('action')) {
      this.sendEvent(ws, 'events/action', event as unknown as Record<string, unknown>);
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      // Track connections per IP for rate limiting
      const connectionsPerIP = new Map<string, number>();
      const MAX_CONNECTIONS_PER_IP = parseInt(process.env.BAP_MAX_CONNECTIONS_PER_IP || '10', 10);
      const MAX_MESSAGE_SIZE = parseInt(process.env.BAP_MAX_MESSAGE_SIZE || '10485760', 10); // 10MB default

      this.httpServer = http.createServer((req, res) => {
        // SECURITY: Add security headers to all HTTP responses
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Cache-Control', 'no-store');

        // Health check endpoint
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', version: BAP_VERSION }));
          return;
        }

        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('WebSocket connection required');
      });

      // SECURITY FIX (CRIT-1): Add WebSocket origin validation to prevent CSWSH attacks
      const allowedOrigins = process.env.BAP_ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];
      this.wss = new WebSocketServer({
        server: this.httpServer,
        maxPayload: MAX_MESSAGE_SIZE, // SECURITY: Limit message size to prevent DoS
        verifyClient: (info, callback) => {
          const origin = info.req.headers.origin;
          const clientIP = info.req.socket.remoteAddress || 'unknown';

          // SECURITY: Connection limit per IP
          const currentConnections = connectionsPerIP.get(clientIP) || 0;
          if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
            this.logSecurity('CONNECTION_LIMIT', { ip: clientIP, current: currentConnections, max: MAX_CONNECTIONS_PER_IP });
            callback(false, 429, 'Too many connections from this IP');
            return;
          }

          // SECURITY: Origin validation
          // Allow connections without origin (non-browser clients like CLI tools)
          // Or if no allowed origins configured (development mode)
          // Or if origin is in the allowlist
          if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
            connectionsPerIP.set(clientIP, currentConnections + 1);
            callback(true);
          } else {
            this.logSecurity('ORIGIN_REJECTED', { origin, ip: clientIP });
            callback(false, 403, 'Origin not allowed');
          }
        }
      });

      this.wss.on("connection", (ws, req) => {
        const clientIP = req.socket.remoteAddress || 'unknown';
        ws.on('close', () => {
          // Decrement connection count on close
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
          this.log('Authentication enabled - clients must provide valid token');
        }
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Close all client connections
    for (const [ws, state] of this.clients) {
      await this.cleanupClient(state);
      ws.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const clientIP = req.socket.remoteAddress || 'unknown';

    // TLS ENFORCEMENT (v0.2.0): Check for secure connection
    const isSecure = (req.socket as any).encrypted || req.headers['x-forwarded-proto'] === 'https';
    if (this.options.tls.requireTLS && !isSecure) {
      this.logSecurity('TLS_REQUIRED', { ip: clientIP });
      ws.close(1008, 'TLS required: use wss:// instead of ws://');
      return;
    }
    if (this.options.tls.warnInsecure && !isSecure) {
      this.log(`WARNING: Insecure connection from ${clientIP}. Use WSS in production.`);
    }

    // Authenticate the connection if auth is configured
    const authToken = this.getAuthToken();
    if (authToken) {
      // Extract token from query string or header
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const queryToken = url.searchParams.get('token');
      const headerToken = req.headers['x-bap-token'] as string | undefined;
      const providedToken = queryToken ?? headerToken;

      // SECURITY: Use timing-safe comparison to prevent timing attacks
      if (!providedToken || !this.secureTokenCompare(providedToken, authToken)) {
        this.logSecurity('AUTH_FAILED', {
          ip: clientIP,
          hasToken: !!providedToken,
          method: queryToken ? 'query' : headerToken ? 'header' : 'none'
        });
        ws.close(1008, 'Unauthorized: invalid or missing token');
        return;
      }
      this.logSecurity('AUTH_SUCCESS', { ip: clientIP });
    }

    // Initialize client state with authorization and session tracking (v0.2.0)
    const now = Date.now();
    const state: ClientState = {
      initialized: false,
      browser: null,
      context: null,
      // Multi-context support
      contexts: new Map(),
      defaultContextId: null,
      pages: new Map(),
      pageToContext: new Map(),
      activePage: null,
      eventSubscriptions: new Set(),
      tracing: false,
      // Authorization (v0.2.0)
      scopes: this.getClientScopes(),
      // Session management (v0.2.0)
      sessionStartTime: now,
      lastActivityTime: now,
      // Element Reference System (stable refs)
      elementRegistries: new Map(),
      // Frame context (Frame & Shadow DOM Support)
      frameContexts: new Map(),
      // Streaming (Streaming Responses)
      activeStreams: new Map(),
      // Approval (Human-in-the-Loop)
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
      // PERF: Sliding windows initialized lazily in checkRateLimit()
    };

    // Set up session timeouts (v0.2.0)
    this.setupSessionTimeouts(ws, state);

    this.clients.set(ws, state);
    this.log(`Client connected (scopes: ${state.scopes.join(', ')})`);

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (isRequest(message)) {
          const response = await this.handleRequest(ws, state, message);
          ws.send(JSON.stringify(response));
        }
      } catch (error) {
        // SECURITY FIX (HIGH-3): Sanitize error messages to prevent information leakage
        // Log full error internally for debugging, return sanitized message to client
        const fullMessage = error instanceof Error ? error.message : "Parse error";
        this.log(`Parse error (internal): ${fullMessage}`);

        // Return generic message to client - don't leak internal details
        const errorResponse = createErrorResponse(
          0,
          ErrorCodes.ParseError,
          "Invalid JSON-RPC message"
        );
        ws.send(JSON.stringify(errorResponse));
      }
    });

    ws.on("close", async () => {
      this.log("Client disconnected");
      await this.cleanupClient(state);
      this.clients.delete(ws);
    });

    ws.on("error", (error) => {
      this.log(`WebSocket error: ${error.message}`);
    });
  }

  /**
   * Handle incoming request
   */
  private async handleRequest(
    ws: WebSocket,
    state: ClientState,
    request: JSONRPCRequest
  ): Promise<JSONRPCResponse> {
    const { id, method, params } = request;

    try {
      // Reset idle timeout on activity (v0.2.0)
      this.resetIdleTimeout(ws, state);

      // Check initialization for non-init methods
      if (method !== "initialize" && !state.initialized) {
        return createErrorResponse(id, ErrorCodes.NotInitialized, "Server not initialized");
      }

      // AUTHORIZATION (v0.2.0): Check if client has permission for this method
      this.checkAuthorization(state, method);

      // Apply rate limiting (skip for notifications/initialized which have no response)
      if (method !== "notifications/initialized") {
        this.checkRateLimit(state, 'request');
      }

      const result = await this.dispatch(ws, state, method as BAPMethod, params ?? {});
      return createSuccessResponse(id, result);
    } catch (error) {
      return this.handleError(id, error);
    }
  }

  /**
   * Dispatch method to handler
   */
  private async dispatch(
    ws: WebSocket,
    state: ClientState,
    method: BAPMethod | string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    switch (method) {
      // Lifecycle
      case "initialize":
        return this.handleInitialize(state, params as unknown as InitializeParams);
      case "notifications/initialized":
        return undefined;
      case "shutdown":
        return this.handleShutdown(state);

      // Browser
      case "browser/launch":
        return this.handleBrowserLaunch(state, params as BrowserLaunchParams);
      case "browser/close":
        return this.handleBrowserClose(state);

      // Page
      case "page/create":
        return this.handlePageCreate(ws, state, params as PageCreateOptions);
      case "page/navigate":
        return this.handlePageNavigate(state, params);
      case "page/reload":
        return this.handlePageReload(state, params);
      case "page/goBack":
        return this.handlePageGoBack(state, params);
      case "page/goForward":
        return this.handlePageGoForward(state, params);
      case "page/close":
        return this.handlePageClose(state, params);
      case "page/list":
        return this.handlePageList(state);
      case "page/activate":
        return this.handlePageActivate(state, params);

      // Actions
      case "action/click":
        return this.handleActionClick(state, params);
      case "action/dblclick":
        return this.handleActionDblclick(state, params);
      case "action/type":
        return this.handleActionType(state, params);
      case "action/fill":
        return this.handleActionFill(state, params);
      case "action/clear":
        return this.handleActionClear(state, params);
      case "action/press":
        return this.handleActionPress(state, params);
      case "action/hover":
        return this.handleActionHover(state, params);
      case "action/scroll":
        return this.handleActionScroll(state, params);
      case "action/select":
        return this.handleActionSelect(state, params);
      case "action/check":
        return this.handleActionCheck(state, params);
      case "action/uncheck":
        return this.handleActionUncheck(state, params);
      case "action/upload":
        return this.handleActionUpload(state, params);
      case "action/drag":
        return this.handleActionDrag(state, params);

      // Observations
      case "observe/screenshot":
        return this.handleObserveScreenshot(state, params);
      case "observe/accessibility":
        return this.handleObserveAccessibility(state, params);
      case "observe/dom":
        return this.handleObserveDOM(state, params);
      case "observe/element":
        return this.handleObserveElement(state, params);
      case "observe/pdf":
        return this.handleObservePDF(state, params);
      case "observe/content":
        return this.handleObserveContent(state, params);
      case "observe/ariaSnapshot":
        return this.handleObserveAriaSnapshot(state, params);

      // Storage
      case "storage/getState":
        return this.handleStorageGetState(state);
      case "storage/setState":
        return this.handleStorageSetState(state, params);
      case "storage/getCookies":
        return this.handleStorageGetCookies(state, params);
      case "storage/setCookies":
        return this.handleStorageSetCookies(state, params);
      case "storage/clearCookies":
        return this.handleStorageClearCookies(state, params);

      // Emulation
      case "emulate/setViewport":
        return this.handleEmulateSetViewport(state, params);
      case "emulate/setUserAgent":
        return this.handleEmulateSetUserAgent(state, params);
      case "emulate/setGeolocation":
        return this.handleEmulateSetGeolocation(state, params);
      case "emulate/setOffline":
        return this.handleEmulateSetOffline(state, params);

      // Dialog
      case "dialog/handle":
        return this.handleDialogHandle(state, params);

      // Tracing
      case "trace/start":
        return this.handleTraceStart(state, params);
      case "trace/stop":
        return this.handleTraceStop(state);

      // Events
      case "events/subscribe":
        return this.handleEventsSubscribe(state, params);

      // Context (Multi-Context Support)
      case "context/create":
        return this.handleContextCreate(state, params as unknown as ContextCreateParams);
      case "context/list":
        return this.handleContextList(state);
      case "context/destroy":
        return this.handleContextDestroy(state, params as unknown as ContextDestroyParams);

      // Frame (Frame & Shadow DOM Support)
      case "frame/list":
        return this.handleFrameList(state, params as unknown as FrameListParams);
      case "frame/switch":
        return this.handleFrameSwitch(state, params as unknown as FrameSwitchParams);
      case "frame/main":
        return this.handleFrameMain(state, params as unknown as FrameMainParams);

      // Stream (Streaming Responses)
      case "stream/cancel":
        return this.handleStreamCancel(state, params as unknown as StreamCancelParams);

      // Approval (Human-in-the-Loop)
      case "approval/respond":
        return this.handleApprovalRespond(state, params as unknown as ApprovalRespondParams);

      // Agent (composite actions, observations, and data extraction)
      case "agent/act":
        return this.handleAgentAct(ws, state, params as unknown as AgentActParams);
      case "agent/observe":
        return this.handleAgentObserve(state, params as unknown as AgentObserveParams);
      case "agent/extract":
        return this.handleAgentExtract(state, params as unknown as AgentExtractParams);

      default:
        throw new BAPServerError(ErrorCodes.MethodNotFound, `Unknown method: ${method}`);
    }
  }

  // ===========================================================================
  // Lifecycle Handlers
  // ===========================================================================

  private async handleInitialize(
    state: ClientState,
    _params: InitializeParams
  ): Promise<InitializeResult> {
    if (state.initialized) {
      throw new BAPServerError(ErrorCodes.AlreadyInitialized, "Already initialized");
    }

    state.initialized = true;

    const capabilities: ServerCapabilities = {
      browsers: ["chromium", "firefox", "webkit"],
      events: ["page", "network", "console", "dialog", "download"],
      observations: ["screenshot", "accessibility", "dom", "element", "pdf", "content"],
      actions: [
        "click", "dblclick", "type", "fill", "clear", "press",
        "hover", "scroll", "select", "check", "uncheck", "upload", "drag"
      ],
      features: {
        autoWait: true,
        tracing: true,
        storageState: true,
        networkInterception: true,
        semanticSelectors: false, // Requires AI integration
        multiPage: true,
      },
      limits: {
        maxPages: 100,
        maxTimeout: 300000,
        maxScreenshotSize: 50 * 1024 * 1024, // 50MB
      },
    };

    return {
      protocolVersion: BAP_VERSION,
      serverInfo: {
        name: "bap-playwright",
        version: "0.1.0",
      },
      capabilities,
    };
  }

  private async handleShutdown(state: ClientState): Promise<void> {
    await this.cleanupClient(state);
  }

  // ===========================================================================
  // Browser Handlers
  // ===========================================================================

  // NOTE: Scope-based authorization is implemented via checkAuthorization() and hasScope().
  // Clients receive scopes on connection (via BAP_SCOPES env var or defaultScopes config).
  // Each method call is validated against granted scopes before execution.
  // Scope format: "category:action" (e.g., "browser:launch", "action:click", "observe:screenshot")
  // Wildcards supported: "*" (all), "browser:*" (all browser operations)

  private async handleBrowserLaunch(
    state: ClientState,
    params: BrowserLaunchParams
  ): Promise<BrowserLaunchResult> {
    const browserType = params.browser ?? this.options.defaultBrowser;
    const launcher = this.getBrowserType(browserType);

    // Sanitize browser args to prevent security issues
    const sanitizedArgs = this.sanitizeBrowserArgs(params.args);

    // SECURITY FIX (CRIT-4): Validate downloads path to prevent path traversal attacks
    let validatedDownloadsPath: string | undefined = undefined;
    if (params.downloadsPath) {
      const fs = require('fs');
      const allowedDownloadDirs = process.env.BAP_ALLOWED_DOWNLOAD_DIRS?.split(',').filter(Boolean) || [];

      // Resolve the path first
      let normalizedPath = path.resolve(params.downloadsPath);

      // SECURITY: Check for symlink attacks by resolving the real path
      try {
        if (fs.existsSync(normalizedPath)) {
          normalizedPath = fs.realpathSync(normalizedPath);
        }
      } catch {
        // If we can't resolve, that's suspicious - reject it
        this.logSecurity('PATH_RESOLUTION_FAILED', { path: params.downloadsPath });
        throw new BAPServerError(ErrorCodes.InvalidParams, `Invalid downloads path: ${params.downloadsPath}`);
      }

      // SECURITY: Check for path traversal patterns in the original input
      if (params.downloadsPath.includes('..') || params.downloadsPath.includes('//')) {
        this.logSecurity('PATH_TRAVERSAL_ATTEMPT', { path: params.downloadsPath });
        throw new BAPServerError(ErrorCodes.InvalidParams, `Invalid downloads path: path traversal detected`);
      }

      // If allowlist is configured, validate the path
      if (allowedDownloadDirs.length > 0) {
        const isAllowed = allowedDownloadDirs.some(dir => {
          const normalizedDir = path.resolve(dir);
          return normalizedPath === normalizedDir || normalizedPath.startsWith(normalizedDir + path.sep);
        });
        if (!isAllowed) {
          this.logSecurity('PATH_NOT_ALLOWED', { path: normalizedPath, allowed: allowedDownloadDirs });
          throw new BAPServerError(
            ErrorCodes.InvalidParams,
            `Downloads path not allowed: ${params.downloadsPath}. Allowed directories: ${allowedDownloadDirs.join(', ')}`
          );
        }
      }

      // Block obvious sensitive paths regardless
      const blockedPaths = ['/etc', '/usr', '/bin', '/sbin', '/var', '/root', '/home', '/tmp', '/sys', '/proc', '/dev',
        'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\Users'];
      const isBlocked = blockedPaths.some(blocked =>
        normalizedPath.toLowerCase().startsWith(blocked.toLowerCase())
      );
      if (isBlocked) {
        this.logSecurity('PATH_BLOCKED', { path: normalizedPath });
        throw new BAPServerError(ErrorCodes.InvalidParams, `Downloads path not allowed: ${params.downloadsPath}`);
      }

      validatedDownloadsPath = normalizedPath;
    }

    state.browser = await launcher.launch({
      headless: params.headless ?? this.options.headless,
      args: sanitizedArgs.length > 0 ? sanitizedArgs : undefined,
      proxy: params.proxy,
      downloadsPath: validatedDownloadsPath,
    });

    // Create the default context
    const defaultContext = await state.browser.newContext();
    const version = state.browser.version();
    // Use crypto.randomUUID for unique IDs
    const contextId = `ctx-${randomUUID().slice(0, 8)}`;

    // Set up default context (backwards compatible)
    state.context = defaultContext;
    state.defaultContextId = contextId;

    // Add to contexts map (Multi-Context Support)
    state.contexts.set(contextId, {
      context: defaultContext,
      created: Date.now(),
    });

    // Auto-cleanup on context close
    defaultContext.on("close", () => {
      state.contexts.delete(contextId);
      if (state.defaultContextId === contextId) {
        state.defaultContextId = null;
        state.context = null;
      }
    });

    return {
      browserId: `browser-${randomUUID()}`,
      version,
      defaultContext: contextId,
    };
  }

  private async handleBrowserClose(state: ClientState): Promise<void> {
    if (state.browser) {
      await state.browser.close();
      state.browser = null;
      state.context = null;
      // Clean up multi-context state
      state.contexts.clear();
      state.defaultContextId = null;
      state.pages.clear();
      state.pageToContext.clear();
      state.activePage = null;
      state.elementRegistries.clear();
      state.frameContexts.clear();
      // Clean up streams
      for (const stream of state.activeStreams.values()) {
        stream.cancelled = true;
      }
      state.activeStreams.clear();
      // Clean up pending approvals
      for (const pending of state.pendingApprovals.values()) {
        clearTimeout(pending.timeoutHandle);
        pending.reject(new BAPServerError(ErrorCodes.TargetClosed, "Browser closed"));
      }
      state.pendingApprovals.clear();
      state.sessionApprovals.clear();
    }
  }

  // ===========================================================================
  // Page Handlers
  // ===========================================================================

  private async handlePageCreate(
    ws: WebSocket,
    state: ClientState,
    params: PageCreateOptions & { contextId?: string }
  ): Promise<Page> {
    this.ensureBrowser(state);

    // Check page limit before creating a new page
    this.checkPageLimit(state);

    // Get the target context (Multi-Context Support)
    let context: BrowserContext;
    let contextId: string;

    if (params.contextId) {
      const ctxState = state.contexts.get(params.contextId);
      if (!ctxState) {
        throw new BAPServerError(
          ErrorCodes.ContextNotFound,
          `Context not found: ${params.contextId}`
        );
      }
      context = ctxState.context;
      contextId = params.contextId;
    } else if (state.defaultContextId && state.contexts.has(state.defaultContextId)) {
      context = state.contexts.get(state.defaultContextId)!.context;
      contextId = state.defaultContextId;
    } else if (state.context) {
      context = state.context;
      contextId = state.defaultContextId ?? "default";
    } else {
      throw new BAPServerError(
        ErrorCodes.BrowserNotLaunched,
        "No context available. Create a context first."
      );
    }

    const page = await context.newPage();
    // Use crypto.randomUUID for guaranteed unique IDs
    const pageId = `page-${randomUUID()}`;

    // Track which context owns this page
    state.pageToContext.set(pageId, contextId);

    // Set up event listeners
    this.setupPageListeners(ws, state, page, pageId);

    // Apply options
    if (params.viewport) {
      await page.setViewportSize(params.viewport);
    }

    if (params.userAgent) {
      // Use JSON.stringify for safe escaping to prevent code injection
      const safeUserAgent = JSON.stringify(params.userAgent);
      await page.context().addInitScript(`
        Object.defineProperty(navigator, 'userAgent', { get: () => ${safeUserAgent} });
      `);
    }

    if (params.geolocation) {
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation(params.geolocation);
    }

    // Note: Timezone is set at context creation, not via emulateMedia
    // The timezone should be passed when creating the browser context

    // Navigate if URL provided
    if (params.url) {
      // Validate URL for security
      this.validateUrl(params.url);
      await page.goto(params.url);
    }

    state.pages.set(pageId, page);
    state.activePage = pageId;

    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

    return {
      id: pageId,
      url: page.url(),
      title: await page.title(),
      viewport,
      status: "ready",
    };
  }

  private async handlePageNavigate(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<PageNavigateResult> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const url = params.url as string;

    // Validate URL for security
    this.validateUrl(url);

    const waitUntil = this.mapWaitUntil(params.waitUntil as WaitUntilState | undefined);
    const timeout = (params.timeout as number) ?? this.options.timeout;

    const response = await page.goto(url, {
      waitUntil,
      timeout,
      referer: params.referer as string | undefined,
    });

    return {
      url: page.url(),
      status: response?.status() ?? 0,
      headers: response?.headers() ?? {},
    };
  }

  private async handlePageReload(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    await page.reload({
      waitUntil: this.mapWaitUntil(params.waitUntil as WaitUntilState | undefined),
      timeout: (params.timeout as number) ?? this.options.timeout,
    });
  }

  private async handlePageGoBack(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    await page.goBack({
      waitUntil: this.mapWaitUntil(params.waitUntil as WaitUntilState | undefined),
      timeout: (params.timeout as number) ?? this.options.timeout,
    });
  }

  private async handlePageGoForward(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    await page.goForward({
      waitUntil: this.mapWaitUntil(params.waitUntil as WaitUntilState | undefined),
      timeout: (params.timeout as number) ?? this.options.timeout,
    });
  }

  private async handlePageClose(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const pageId = params.pageId as string;
    const page = state.pages.get(pageId);

    if (!page) {
      throw new BAPServerError(ErrorCodes.PageNotFound, `Page not found: ${pageId}`);
    }

    await page.close({ runBeforeUnload: params.runBeforeUnload as boolean | undefined });
    state.pages.delete(pageId);

    if (state.activePage === pageId) {
      state.activePage = state.pages.keys().next().value ?? null;
    }
  }

  private async handlePageList(state: ClientState): Promise<{ pages: Page[]; activePage: string }> {
    const pages: Page[] = [];

    for (const [id, page] of state.pages) {
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      pages.push({
        id,
        url: page.url(),
        title: await page.title(),
        viewport,
        status: "ready",
      });
    }

    return {
      pages,
      activePage: state.activePage ?? "",
    };
  }

  private async handlePageActivate(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const pageId = params.pageId as string;
    if (!state.pages.has(pageId)) {
      throw new BAPServerError(ErrorCodes.PageNotFound, `Page not found: ${pageId}`);
    }
    state.activePage = pageId;
    await state.pages.get(pageId)!.bringToFront();
  }

  // ===========================================================================
  // Action Handlers
  // ===========================================================================

  private async handleActionClick(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const selector = params.selector as BAPSelector;
    const options = params.options as ClickOptions | undefined;

    // Handle coordinates selector specially - click directly at the coordinates
    if (selector.type === 'coordinates') {
      await page.mouse.click(selector.x, selector.y, {
        button: options?.button as 'left' | 'right' | 'middle' | undefined,
        clickCount: options?.clickCount,
      });
      return;
    }

    const locator = this.resolveSelector(page, selector);
    await locator.click({
      button: options?.button,
      clickCount: options?.clickCount,
      modifiers: options?.modifiers as ("Alt" | "Control" | "Meta" | "Shift")[] | undefined,
      position: options?.position,
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
      trial: options?.trial,
    });
  }

  private async handleActionDblclick(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const selector = params.selector as BAPSelector;
    const options = params.options as ClickOptions | undefined;

    // Handle coordinates selector specially - double-click at coordinates
    if (selector.type === 'coordinates') {
      await page.mouse.dblclick(selector.x, selector.y, {
        button: options?.button as 'left' | 'right' | 'middle' | undefined,
      });
      return;
    }

    const locator = this.resolveSelector(page, selector);
    await locator.dblclick({
      button: options?.button,
      modifiers: options?.modifiers as ("Alt" | "Control" | "Meta" | "Shift")[] | undefined,
      position: options?.position,
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
      trial: options?.trial,
    });
  }

  private async handleActionType(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const text = params.text as string;
    const options = params.options as TypeOptions | undefined;

    if (options?.clear) {
      await locator.clear({ timeout: options?.timeout ?? this.options.timeout });
    }

    await locator.pressSequentially(text, {
      delay: options?.delay,
      timeout: options?.timeout ?? this.options.timeout,
    });
  }

  private async handleActionFill(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const value = params.value as string;
    const options = params.options as ActionOptions | undefined;

    await locator.fill(value, {
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
    });
  }

  private async handleActionClear(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const options = params.options as ActionOptions | undefined;

    await locator.clear({
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
    });
  }

  private async handleActionPress(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const key = params.key as string;
    const selector = params.selector as BAPSelector | undefined;
    const options = params.options as ActionOptions | undefined;

    if (selector) {
      const locator = this.resolveSelector(page, selector);
      await locator.press(key, {
        timeout: options?.timeout ?? this.options.timeout,
        noWaitAfter: options?.noWaitAfter,
      });
    } else {
      await page.keyboard.press(key);
    }
  }

  private async handleActionHover(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const selector = params.selector as BAPSelector;
    const options = params.options as (ActionOptions & { position?: { x: number; y: number } }) | undefined;

    // Handle coordinates selector specially - hover at coordinates
    if (selector.type === 'coordinates') {
      await page.mouse.move(selector.x, selector.y);
      return;
    }

    const locator = this.resolveSelector(page, selector);
    await locator.hover({
      position: options?.position,
      force: options?.force,
      timeout: options?.timeout ?? this.options.timeout,
      trial: options?.trial,
    });
  }

  private async handleActionScroll(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const selector = params.selector as BAPSelector | undefined;
    const options = params.options as ScrollOptions | undefined;

    if (selector) {
      const locator = this.resolveSelector(page, selector);
      await locator.scrollIntoViewIfNeeded({
        timeout: options?.timeout ?? this.options.timeout,
      });
    } else {
      const direction = options?.direction ?? "down";
      const amount = options?.amount ?? 300;

      let deltaX = 0;
      let deltaY = 0;

      if (typeof amount === "number") {
        switch (direction) {
          case "up": deltaY = -amount; break;
          case "down": deltaY = amount; break;
          case "left": deltaX = -amount; break;
          case "right": deltaX = amount; break;
        }
      } else if (amount === "page") {
        const viewport = page.viewportSize();
        switch (direction) {
          case "up": deltaY = -(viewport?.height ?? 600); break;
          case "down": deltaY = viewport?.height ?? 600; break;
          case "left": deltaX = -(viewport?.width ?? 800); break;
          case "right": deltaX = viewport?.width ?? 800; break;
        }
      }

      await page.mouse.wheel(deltaX, deltaY);
    }
  }

  private async handleActionSelect(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const values = params.values as string | string[];
    const options = params.options as ActionOptions | undefined;

    const valuesArray = Array.isArray(values) ? values : [values];
    await locator.selectOption(valuesArray, {
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
    });
  }

  private async handleActionCheck(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const options = params.options as ActionOptions | undefined;

    await locator.check({
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
      trial: options?.trial,
    });
  }

  private async handleActionUncheck(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const options = params.options as ActionOptions | undefined;

    await locator.uncheck({
      force: options?.force,
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
      trial: options?.trial,
    });
  }

  private async handleActionUpload(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const locator = this.resolveSelector(page, params.selector as BAPSelector);
    const files = params.files as FileUpload[];
    const options = params.options as ActionOptions | undefined;

    const buffers = files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      buffer: Buffer.from(f.buffer, "base64"),
    }));

    await locator.setInputFiles(buffers, {
      noWaitAfter: options?.noWaitAfter,
      timeout: options?.timeout ?? this.options.timeout,
    });
  }

  private async handleActionDrag(state: ClientState, params: Record<string, unknown>): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const source = this.resolveSelector(page, params.source as BAPSelector);
    const target = params.target as BAPSelector | { x: number; y: number };
    const options = params.options as ActionOptions | undefined;

    if ("type" in target) {
      const targetLocator = this.resolveSelector(page, target);
      await source.dragTo(targetLocator, {
        force: options?.force,
        noWaitAfter: options?.noWaitAfter,
        timeout: options?.timeout ?? this.options.timeout,
        trial: options?.trial,
      });
    } else {
      // Drag to coordinates
      const sourceBox = await source.boundingBox();
      if (!sourceBox) {
        throw new BAPServerError(ErrorCodes.ElementNotFound, "Source element not found");
      }

      await page.mouse.move(
        sourceBox.x + sourceBox.width / 2,
        sourceBox.y + sourceBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(target.x, target.y);
      await page.mouse.up();
    }
  }

  // ===========================================================================
  // Observation Handlers
  // ===========================================================================

  private async handleObserveScreenshot(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<ObserveScreenshotResult> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const options = params.options as ScreenshotOptions | undefined;

    // Apply screenshot-specific rate limiting
    this.checkRateLimit(state, 'screenshot');

    // Playwright only supports "png" and "jpeg" for screenshots
    const screenshotType = (options?.format === "jpeg" || options?.format === "png")
      ? options.format
      : "png";

    const buffer = await page.screenshot({
      fullPage: options?.fullPage,
      clip: options?.clip,
      type: screenshotType,
      quality: options?.quality,
      scale: options?.scale,
    });

    // Parse image dimensions from the buffer
    // PNG format: signature (8) + IHDR chunk length (4) + IHDR type (4) + width (4) + height (4)
    // JPEG format: Read dimensions from JPEG header markers
    let width: number;
    let height: number;

    const format = options?.format ?? "png";

    if (format === "png" && buffer[0] === 0x89 && buffer[1] === 0x50) {
      // PNG: Read dimensions from IHDR chunk (offset 16 for width, 20 for height)
      width = buffer.readUInt32BE(16);
      height = buffer.readUInt32BE(20);
    } else if ((format === "jpeg" || format === "webp") && buffer.length > 0) {
      // For JPEG/WebP, fall back to viewport dimensions or clip
      // (Parsing JPEG headers is complex, use viewport as approximation)
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      if (options?.clip) {
        width = options.clip.width;
        height = options.clip.height;
      } else if (options?.fullPage) {
        // For full page, we'd need to measure scrollable area
        // This is approximate - consider using page.evaluate for accuracy
        width = viewport.width;
        const scrollHeight = await page.evaluate("document.documentElement.scrollHeight");
        height = (scrollHeight as number) || viewport.height;
      } else {
        width = viewport.width;
        height = viewport.height;
      }
    } else {
      // Fallback
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      width = options?.clip?.width ?? viewport.width;
      height = options?.clip?.height ?? viewport.height;
    }

    return {
      data: buffer.toString("base64"),
      format,
      width,
      height,
    };
  }

  private async handleObserveAccessibility(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<ObserveAccessibilityResult> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const options = params.options as AccessibilityTreeOptions | undefined;

    let root: Locator | undefined;
    if (options?.root) {
      root = this.resolveSelector(page, options.root);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await (page as any).accessibility.snapshot({
      root: root ? await root.elementHandle() : undefined,
      interestingOnly: options?.interestingOnly ?? true,
    });

    const tree = this.convertAccessibilityNode(snapshot);
    return { tree };
  }

  // SECURITY FIX (HIGH-6): Content filtering to prevent extraction of sensitive data
  private async handleObserveDOM(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<ObserveDOMResult> {
    const page = this.getPage(state, params.pageId as string | undefined);

    let html = await page.content();
    const text = await page.innerText("body").catch(() => "");
    const title = await page.title();
    const url = page.url();

    // SECURITY: Redact sensitive input values from HTML
    html = this.redactSensitiveContent(html);

    return { html, text, title, url };
  }

  // PERF: Pre-compiled regex patterns for credential redaction (avoids recompilation on each call)
  private static readonly REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Password input values (type before value)
    { pattern: /(<input[^>]*type\s*=\s*["']password["'][^>]*value\s*=\s*["'])([^"']*)(['"])/gi, replacement: '$1[REDACTED]$3' },
    // Password input values (value before type)
    { pattern: /(<input[^>]*value\s*=\s*["'])([^"']*)(['"][^>]*type\s*=\s*["']password["'])/gi, replacement: '$1[REDACTED]$3' },
    // Inputs with data-sensitive attribute
    { pattern: /(<input[^>]*data-sensitive[^>]*value\s*=\s*["'])([^"']*)(['"])/gi, replacement: '$1[REDACTED]$3' },
    // Sensitive data attributes
    { pattern: /(data-(?:password|secret|token|api-key|credential|auth)\s*=\s*["'])([^"']*)(['"])/gi, replacement: '$1[REDACTED]$3' },
    // JWT Bearer tokens
    { pattern: /(["'])Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+(['"])/gi, replacement: '$1[REDACTED_JWT]$2' },
  ];

  /**
   * SECURITY: Redact sensitive content from HTML to prevent credential theft
   * PERF: Uses pre-compiled regex patterns
   */
  private redactSensitiveContent(html: string): string {
    // Early return for small strings (unlikely to contain sensitive data worth scanning)
    if (html.length < 100) return html;

    // Apply all patterns - regex patterns are pre-compiled as static constants
    for (const { pattern, replacement } of BAPPlaywrightServer.REDACT_PATTERNS) {
      // Reset lastIndex for global regexes (they're stateful)
      pattern.lastIndex = 0;
      html = html.replace(pattern, replacement);
    }
    return html;
  }

  private async handleObserveElement(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<ObserveElementResult> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const selector = params.selector as BAPSelector;
    const properties = params.properties as ElementProperty[];

    const locator = this.resolveSelector(page, selector);
    const count = await locator.count();

    if (count === 0) {
      return { found: false };
    }

    // Build result object with mutable properties first, then cast to readonly
    const result: {
      found: boolean;
      visible?: boolean;
      enabled?: boolean;
      checked?: boolean;
      text?: string;
      value?: string;
      boundingBox?: { x: number; y: number; width: number; height: number };
      attributes?: Record<string, string>;
      computedStyle?: Record<string, string>;
    } = { found: true };

    for (const prop of properties) {
      switch (prop) {
        case "visible":
          result.visible = await locator.isVisible();
          break;
        case "enabled":
          result.enabled = await locator.isEnabled();
          break;
        case "checked":
          result.checked = await locator.isChecked().catch(() => undefined);
          break;
        case "text":
          result.text = await locator.innerText().catch(() => "");
          break;
        case "value": {
          // SECURITY: Check if this is a password field and redact
          const inputType = await locator.getAttribute('type').catch(() => '');
          const isSensitive = await locator.getAttribute('data-sensitive').catch(() => null);
          if (inputType?.toLowerCase() === 'password' || isSensitive !== null) {
            result.value = '[REDACTED]';
            this.logSecurity('VALUE_REDACTED', { selector: JSON.stringify(selector), reason: 'password_field' });
          } else {
            result.value = await locator.inputValue().catch(() => undefined);
          }
          break;
        }
        case "boundingBox":
          result.boundingBox = await locator.boundingBox() ?? undefined;
          break;
        case "attributes":
          result.attributes = await locator.evaluate((el) => {
            const attrs: Record<string, string> = {};
            for (const attr of el.attributes) {
              attrs[attr.name] = attr.value;
            }
            return attrs;
          });
          break;
        case "computedStyle":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result.computedStyle = await locator.evaluate((el: any) => {
            const style = el.ownerDocument.defaultView.getComputedStyle(el);
            const obj: Record<string, string> = {};
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              obj[prop] = style.getPropertyValue(prop);
            }
            return obj;
          });
          break;
      }
    }

    return result;
  }

  private async handleObservePDF(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<ObservePDFResult> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const options = params.options as Record<string, unknown> | undefined;

    const buffer = await page.pdf({
      format: (options?.format as "Letter" | "A4" | undefined) ?? "A4",
      landscape: options?.landscape as boolean | undefined,
      scale: options?.scale as number | undefined,
      margin: options?.margin as Record<string, string> | undefined,
      printBackground: options?.printBackground as boolean | undefined,
    });

    return { data: buffer.toString("base64") };
  }

  private async handleObserveContent(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<ObserveContentResult> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const format = params.format as ContentFormat;

    let content: string;

    switch (format) {
      case "html":
        content = await page.content();
        break;
      case "text":
        content = await page.innerText("body");
        break;
      case "markdown": {
        // Simple HTML to markdown conversion
        const html = await page.content();
        content = this.htmlToMarkdown(html);
        break;
      }
      default:
        content = await page.innerText("body");
    }

    return {
      content,
      url: page.url(),
      title: await page.title(),
    };
  }

  /**
   * Get ARIA snapshot of the page in YAML format
   * This is a token-efficient representation ideal for LLMs (Playwright 1.49+)
   */
  private async handleObserveAriaSnapshot(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<{ snapshot: string; url: string; title: string }> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const selector = params.selector as BAPSelector | undefined;
    const options = params.options as { timeout?: number } | undefined;

    let snapshot: string;

    if (selector) {
      // Get ARIA snapshot for a specific element
      const locator = this.resolveSelector(page, selector);
      snapshot = await locator.ariaSnapshot({
        timeout: options?.timeout ?? this.options.timeout,
      });
    } else {
      // Get ARIA snapshot for the whole page body
      snapshot = await page.locator('body').ariaSnapshot({
        timeout: options?.timeout ?? this.options.timeout,
      });
    }

    return {
      snapshot,
      url: page.url(),
      title: await page.title(),
    };
  }

  // ===========================================================================
  // Storage Handlers
  // ===========================================================================

  private async handleStorageGetState(state: ClientState): Promise<StorageState> {
    // SECURITY: Check if storage state extraction is blocked
    if (this.options.security?.blockStorageStateExtraction) {
      this.logSecurity('STORAGE_STATE_BLOCKED', { reason: 'security_policy' });
      throw new BAPServerError(
        ErrorCodes.InvalidRequest,
        'Storage state extraction is disabled by security policy'
      );
    }

    this.ensureBrowser(state);
    this.logSecurity('STORAGE_STATE_EXTRACTED', {
      warning: 'Contains session tokens - handle securely'
    });
    return await state.context!.storageState() as StorageState;
  }

  private async handleStorageSetState(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    this.ensureBrowser(state);
    const storageState = params.state as StorageState;

    // Set cookies
    if (storageState.cookies?.length) {
      await state.context!.addCookies(storageState.cookies as Cookie[]);
    }

    // Set storage for each origin
    for (const origin of storageState.origins ?? []) {
      // Create a page for this origin to set storage
      const page = await state.context!.newPage();
      await page.goto(origin.origin);

      // Set localStorage
      for (const item of origin.localStorage) {
        await page.evaluate(
          ([key, value]) => localStorage.setItem(key, value),
          [item.name, item.value]
        );
      }

      // Set sessionStorage
      for (const item of origin.sessionStorage ?? []) {
        await page.evaluate(
          ([key, value]) => sessionStorage.setItem(key, value),
          [item.name, item.value]
        );
      }

      await page.close();
    }
  }

  private async handleStorageGetCookies(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<{ cookies: Cookie[] }> {
    this.ensureBrowser(state);
    const urls = params.urls as string[] | undefined;
    const cookies = await state.context!.cookies(urls);
    return { cookies: cookies as Cookie[] };
  }

  private async handleStorageSetCookies(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    this.ensureBrowser(state);
    const cookies = params.cookies as Cookie[];
    await state.context!.addCookies(cookies);
  }

  private async handleStorageClearCookies(
    state: ClientState,
    _params: Record<string, unknown>
  ): Promise<void> {
    this.ensureBrowser(state);
    await state.context!.clearCookies();
  }

  // ===========================================================================
  // Emulation Handlers
  // ===========================================================================

  private async handleEmulateSetViewport(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    await page.setViewportSize({
      width: params.width as number,
      height: params.height as number,
    });
  }

  private async handleEmulateSetUserAgent(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const userAgent = params.userAgent as string;

    // Use JSON.stringify for safe escaping to prevent code injection
    const safeUserAgent = JSON.stringify(userAgent);
    await page.context().addInitScript(`
      Object.defineProperty(navigator, 'userAgent', { get: () => ${safeUserAgent} });
    `);
  }

  private async handleEmulateSetGeolocation(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    this.ensureBrowser(state);
    await state.context!.setGeolocation({
      latitude: params.latitude as number,
      longitude: params.longitude as number,
      accuracy: params.accuracy as number | undefined,
    });
  }

  private async handleEmulateSetOffline(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    this.ensureBrowser(state);
    await state.context!.setOffline(params.offline as boolean);
  }

  // ===========================================================================
  // Dialog Handler
  // ===========================================================================

  private async handleDialogHandle(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    const page = this.getPage(state, params.pageId as string | undefined);
    const action = params.action as "accept" | "dismiss";
    const promptText = params.promptText as string | undefined;

    // Set up dialog handler for next dialog
    page.once("dialog", async (dialog) => {
      if (action === "accept") {
        await dialog.accept(promptText);
      } else {
        await dialog.dismiss();
      }
    });
  }

  // ===========================================================================
  // Tracing Handlers
  // ===========================================================================

  private async handleTraceStart(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    this.ensureBrowser(state);

    await state.context!.tracing.start({
      name: params.name as string | undefined,
      screenshots: params.screenshots as boolean | undefined,
      snapshots: params.snapshots as boolean | undefined,
      sources: params.sources as boolean | undefined,
    });

    state.tracing = true;
  }

  private async handleTraceStop(state: ClientState): Promise<{ data?: string }> {
    this.ensureBrowser(state);

    if (!state.tracing) {
      return {};
    }

    // tracing.stop() may return void or a buffer depending on options
    const result = await state.context!.tracing.stop();
    state.tracing = false;

    // Handle both cases: result may be Buffer or void
    const buffer = result as Buffer | undefined;
    return {
      data: buffer?.toString("base64"),
    };
  }

  // ===========================================================================
  // Event Subscription
  // ===========================================================================

  private async handleEventsSubscribe(
    state: ClientState,
    params: Record<string, unknown>
  ): Promise<void> {
    const events = params.events as string[];
    for (const event of events) {
      state.eventSubscriptions.add(event);
    }
  }

  // ===========================================================================
  // Agent Handlers (Composite Actions, Observations, and Data Extraction)
  // ===========================================================================

  /**
   * Execute a sequence of actions atomically
   */
  private async handleAgentAct(
    ws: WebSocket,
    state: ClientState,
    params: AgentActParams
  ): Promise<AgentActResult> {
    const startTime = Date.now();
    const page = this.getPage(state, params.pageId);

    const results: StepResult[] = [];
    let completed = 0;
    let failedAt: number | undefined;

    const stopOnFirstError = params.stopOnFirstError ?? true;
    const globalTimeout = params.timeout ?? this.options.timeout ?? 30000;

    // Validate all steps before execution
    for (const step of params.steps) {
      // Check that the action is in the allowed list
      if (!ALLOWED_ACT_ACTIONS.includes(step.action as typeof ALLOWED_ACT_ACTIONS[number])) {
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Action not allowed in agent/act: ${step.action}. Allowed actions: ${ALLOWED_ACT_ACTIONS.join(", ")}`
        );
      }

      // Check authorization for each action
      this.checkAuthorization(state, step.action);
    }

    try {
      for (let i = 0; i < params.steps.length; i++) {
        const step = params.steps[i];
        const stepStart = Date.now();

        // Check if we've exceeded global timeout
        if (Date.now() - startTime >= globalTimeout) {
          throw new BAPServerError(ErrorCodes.Timeout, "Sequence timeout exceeded");
        }

        let stepResult: StepResult;

        try {
          // Check pre-condition if specified
          if (step.condition) {
            const conditionMet = await this.checkStepCondition(page, step.condition);
            if (!conditionMet) {
              if (params.continueOnConditionFail) {
                stepResult = {
                  step: i,
                  label: step.label,
                  success: false,
                  error: {
                    code: ErrorCodes.InvalidParams,
                    message: `Condition not met: ${step.condition.state} for selector`,
                  },
                  duration: Date.now() - stepStart,
                };
                results.push(stepResult);
                continue;
              }
              throw new BAPServerError(ErrorCodes.InvalidParams, "Step condition not met");
            }
          }

          // Execute the action with retry support
          const actionResult = await this.executeStepWithRetry(ws, state, step, page);

          stepResult = {
            step: i,
            label: step.label,
            success: true,
            result: actionResult.result,
            duration: Date.now() - stepStart,
            retries: actionResult.retries,
          };

          completed++;
        } catch (error) {
          const errorInfo = this.extractErrorInfo(error);

          stepResult = {
            step: i,
            label: step.label,
            success: false,
            error: errorInfo,
            duration: Date.now() - stepStart,
          };

          if (step.onError === "skip") {
            // Continue to next step
          } else if (stopOnFirstError) {
            failedAt = i;
            results.push(stepResult);
            break;
          }
        }

        results.push(stepResult);
      }
    } catch {
      // Global timeout or other fatal error
      if (results.length < params.steps.length && failedAt === undefined) {
        failedAt = results.length;
      }
    }

    return {
      completed,
      total: params.steps.length,
      success: completed === params.steps.length,
      results,
      duration: Date.now() - startTime,
      failedAt,
    };
  }

  /**
   * Execute a single step with retry support
   */
  private async executeStepWithRetry(
    ws: WebSocket,
    state: ClientState,
    step: ExecutionStep,
    _page: PlaywrightPage
  ): Promise<{ result: unknown; retries: number }> {
    const maxRetries = step.onError === "retry" ? (step.maxRetries ?? 3) : 1;
    const retryDelay = step.retryDelay ?? 500;

    let lastError: Error | null = null;
    let retries = 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Dispatch to the actual handler
        const result = await this.dispatch(ws, state, step.action, step.params);
        return { result, retries };
      } catch (error) {
        lastError = error as Error;
        retries = attempt + 1;

        if (attempt < maxRetries - 1 && step.onError === "retry") {
          await this.sleep(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Check a step pre-condition
   */
  private async checkStepCondition(
    page: PlaywrightPage,
    condition: StepCondition
  ): Promise<boolean> {
    const timeout = condition.timeout ?? 5000;
    const locator = this.resolveSelector(page, condition.selector);

    try {
      switch (condition.state) {
        case "visible":
          await locator.waitFor({ state: "visible", timeout });
          return true;
        case "hidden":
          await locator.waitFor({ state: "hidden", timeout });
          return true;
        case "enabled":
          await locator.waitFor({ state: "visible", timeout });
          return await locator.isEnabled();
        case "disabled":
          await locator.waitFor({ state: "visible", timeout });
          return await locator.isDisabled();
        case "exists":
          await locator.waitFor({ state: "attached", timeout });
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Extract error info for step result
   */
  private extractErrorInfo(error: unknown): { code: number; message: string; data?: { retryable: boolean; retryAfterMs?: number; details?: Record<string, unknown> } } {
    if (error instanceof BAPServerError) {
      return {
        code: error.code,
        message: error.message,
        data: {
          retryable: error.retryable,
          retryAfterMs: error.retryAfterMs,
          details: error.details,
        },
      };
    }

    if (error instanceof Error) {
      // Map common error patterns
      const message = error.message;
      if (message.includes("Timeout")) {
        return { code: ErrorCodes.Timeout, message, data: { retryable: true } };
      }
      if (message.includes("not visible") || message.includes("not enabled")) {
        return { code: ErrorCodes.ElementNotFound, message, data: { retryable: true } };
      }
      return { code: ErrorCodes.InternalError, message, data: { retryable: false } };
    }

    return { code: ErrorCodes.InternalError, message: "Unknown error", data: { retryable: false } };
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get an AI-optimized observation of the page
   * Supports stable element refs and screenshot annotation (Set-of-Marks)
   */
  private async handleAgentObserve(
    state: ClientState,
    params: AgentObserveParams
  ): Promise<AgentObserveResult> {
    const page = this.getPage(state, params.pageId);
    const pageId = params.pageId ?? state.activePage ?? "";
    const result: AgentObserveResult = {};

    // Get or create element registry for this page
    let registry = state.elementRegistries.get(pageId);
    const pageUrl = page.url();

    // Create new registry if needed or if URL changed (navigation)
    if (!registry || registry.pageUrl !== pageUrl || params.refreshRefs) {
      registry = createElementRegistry(pageUrl);
      state.elementRegistries.set(pageId, registry);
    }

    // Clean up stale entries periodically
    cleanupStaleEntries(registry);

    // Metadata (default: included)
    if (params.includeMetadata !== false) {
      const viewport = page.viewportSize();
      result.metadata = {
        url: page.url(),
        title: await page.title(),
        viewport: viewport ?? { width: 0, height: 0 },
      };
    }

    // Accessibility tree
    if (params.includeAccessibility) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snapshot = await (page as any).accessibility.snapshot();
      result.accessibility = {
        tree: snapshot ? [this.convertAccessibilityNode(snapshot)] : [],
      };
    }

    // Interactive elements (needed for annotation too)
    let interactiveElements: InteractiveElement[] | undefined;
    const needElements = params.includeInteractiveElements || params.annotateScreenshot;

    if (needElements) {
      // Always include bounds if annotation is requested
      const includeBounds = params.includeBounds ?? !!params.annotateScreenshot;

      const elements = await this.getInteractiveElements(page, {
        maxElements: params.maxElements ?? 100,
        filterRoles: params.filterRoles,
        includeBounds,
        // Stable ref options
        registry,
        stableRefs: params.stableRefs !== false,
        refreshRefs: params.refreshRefs,
        includeRefHistory: params.includeRefHistory,
      });
      interactiveElements = elements.elements;

      if (params.includeInteractiveElements) {
        result.interactiveElements = elements.elements;
        result.totalInteractiveElements = elements.total;
      }
    }

    // Screenshot (with optional annotation)
    if (params.includeScreenshot || params.annotateScreenshot) {
      const viewport = page.viewportSize();
      let buffer = await page.screenshot({ type: "png" });
      let annotated = false;
      let annotationMap: AnnotationMapping[] | undefined;

      // Apply annotation if requested
      if (params.annotateScreenshot && interactiveElements && interactiveElements.length > 0) {
        const annotationOpts: AnnotationOptions = typeof params.annotateScreenshot === 'object'
          ? params.annotateScreenshot
          : { enabled: true };

        if (annotationOpts.enabled) {
          const annotationResult = await this.annotateScreenshot(
            page,
            buffer,
            interactiveElements,
            annotationOpts
          );
          buffer = annotationResult.buffer;
          annotated = true;
          annotationMap = annotationResult.map;
        }
      }

      result.screenshot = {
        data: buffer.toString("base64"),
        format: "png",
        width: viewport?.width ?? 0,
        height: viewport?.height ?? 0,
        annotated,
      };

      if (annotationMap) {
        result.annotationMap = annotationMap;
      }
    }

    return result;
  }

  /**
   * Annotate a screenshot with element markers (Set-of-Marks style)
   */
  private async annotateScreenshot(
    page: PlaywrightPage,
    screenshotBuffer: Buffer,
    elements: InteractiveElement[],
    options: AnnotationOptions
  ): Promise<{ buffer: Buffer; map: AnnotationMapping[] }> {
    const maxLabels = options.maxLabels ?? 50;
    const labelFormat = options.labelFormat ?? 'number';
    const style = options.style ?? {};

    // Default colors
    const badgeColor = style.badge?.color ?? '#FF0000';
    const badgeTextColor = style.badge?.textColor ?? '#FFFFFF';
    const badgeSize = style.badge?.size ?? 20;
    const badgeFont = style.badge?.font ?? 'bold 12px sans-serif';
    const showBox = style.showBoundingBox !== false;
    const boxColor = style.box?.color ?? '#FF0000';
    const boxWidth = style.box?.width ?? 2;
    const boxStyle = style.box?.style ?? 'solid';
    const opacity = style.opacity ?? 0.8;

    // Filter elements with bounds and limit to maxLabels
    const elementsWithBounds = elements
      .filter(el => el.bounds)
      .slice(0, maxLabels);

    // Build annotation mapping
    const annotationMap: AnnotationMapping[] = elementsWithBounds.map((el, i) => {
      let label: string;
      if (labelFormat === 'ref') {
        label = el.ref;
      } else if (labelFormat === 'both') {
        label = `${i + 1}:${el.ref}`;
      } else {
        label = String(i + 1);
      }

      return {
        label,
        ref: el.ref,
        position: {
          x: el.bounds!.x,
          y: el.bounds!.y - badgeSize - 2,
        },
      };
    });

    // Render annotations using browser canvas
    const annotatedBase64 = await page.evaluate(
      (args: {
        imageData: string;
        elements: { label: string; bounds: { x: number; y: number; width: number; height: number } }[];
        badgeColor: string;
        badgeTextColor: string;
        badgeSize: number;
        badgeFont: string;
        showBox: boolean;
        boxColor: string;
        boxWidth: number;
        boxStyle: string;
        opacity: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }): any => {
        // This function runs in browser context - use any to bypass DOM type checking
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Promise<string>((resolve: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          const canvas = doc.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const img = new (globalThis as any).Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original screenshot
            ctx.drawImage(img, 0, 0);

            // Set opacity for annotations
            ctx.globalAlpha = args.opacity;

            // Draw annotations for each element
            for (const el of args.elements) {
              const { label, bounds } = el;

              // Draw bounding box
              if (args.showBox) {
                ctx.strokeStyle = args.boxColor;
                ctx.lineWidth = args.boxWidth;
                if (args.boxStyle === 'dashed') {
                  ctx.setLineDash([5, 5]);
                } else {
                  ctx.setLineDash([]);
                }
                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
              }

              // Draw badge background
              const textMetrics = ctx.measureText(label);
              const badgeWidth = Math.max(args.badgeSize, textMetrics.width + 8);
              const badgeX = bounds.x - 2;
              const badgeY = Math.max(0, bounds.y - args.badgeSize - 2);

              ctx.fillStyle = args.badgeColor;
              ctx.fillRect(badgeX, badgeY, badgeWidth, args.badgeSize);

              // Draw badge text
              ctx.fillStyle = args.badgeTextColor;
              ctx.font = args.badgeFont;
              ctx.textBaseline = 'middle';
              ctx.fillText(label, badgeX + 4, badgeY + args.badgeSize / 2);
            }

            // Reset alpha
            ctx.globalAlpha = 1.0;

            resolve(canvas.toDataURL('image/png').split(',')[1]);
          };
          img.src = `data:image/png;base64,${args.imageData}`;
        });
      },
      {
        imageData: screenshotBuffer.toString('base64'),
        elements: elementsWithBounds.map((el, i) => ({
          label: annotationMap[i].label,
          bounds: el.bounds!,
        })),
        badgeColor,
        badgeTextColor,
        badgeSize,
        badgeFont,
        showBox,
        boxColor,
        boxWidth,
        boxStyle,
        opacity,
      }
    );

    return {
      buffer: Buffer.from(annotatedBase64, 'base64'),
      map: annotationMap,
    };
  }

  /**
   * Extract structured data from the page
   */
  private async handleAgentExtract(
    state: ClientState,
    params: AgentExtractParams
  ): Promise<AgentExtractResult> {
    const page = this.getPage(state, params.pageId);
    const timeout = params.timeout ?? this.options.timeout ?? 30000;

    try {
      // Get the content to extract from
      let content: string;
      if (params.selector) {
        const locator = this.resolveSelector(page, params.selector);
        await locator.waitFor({ state: "visible", timeout });
        content = await locator.textContent() ?? "";
      } else {
        content = await page.textContent("body") ?? "";
      }

      // For now, we use a simple extraction based on the instruction and content
      // In a full implementation, this would use an LLM for intelligent extraction
      // This is a basic implementation that extracts based on patterns

      const extractedData = await this.extractDataFromContent(
        page,
        content,
        params.instruction,
        params.schema,
        params.mode ?? "single",
        params.includeSourceRefs ?? false
      );

      return {
        success: true,
        data: extractedData.data,
        sources: extractedData.sources,
        confidence: extractedData.confidence,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      return {
        success: false,
        data: null,
        error: message,
      };
    }
  }

  /**
   * Extract data from content based on instruction and schema
   * This is a basic implementation - a full implementation would use LLM
   */
  private async extractDataFromContent(
    page: PlaywrightPage,
    content: string,
    _instruction: string, // Used for future LLM-based extraction
    schema: { type: string; properties?: Record<string, unknown>; items?: unknown },
    mode: string,
    includeSourceRefs: boolean
  ): Promise<{ data: unknown; sources?: { ref: string; selector: BAPSelector; text?: string }[]; confidence: number }> {
    // Basic extraction logic based on common patterns
    // This extracts data by finding elements that match the schema structure

    const sources: { ref: string; selector: BAPSelector; text?: string }[] = [];

    if (schema.type === "array" || mode === "list") {
      // Extract list of items
      const items: unknown[] = [];

      // Try to find list-like elements based on the instruction
      const listSelectors = [
        'ul li', 'ol li', '[role="listitem"]', 'tr', '.item', '.card', '[class*="item"]', '[class*="card"]'
      ];

      for (const selector of listSelectors) {
        try {
          const elements = await page.locator(selector).all();
          if (elements.length > 0) {
            for (let i = 0; i < Math.min(elements.length, 50); i++) {
              const el = elements[i];
              const text = await el.textContent();
              if (text && text.trim()) {
                if (schema.items && typeof schema.items === 'object' && 'type' in schema.items) {
                  if ((schema.items as { type: string }).type === 'string') {
                    items.push(text.trim());
                  } else if ((schema.items as { type: string }).type === 'object') {
                    // Try to extract object structure
                    items.push({ text: text.trim() });
                  }
                } else {
                  items.push(text.trim());
                }

                if (includeSourceRefs) {
                  sources.push({
                    ref: `@s${i + 1}`,
                    selector: { type: 'css', value: `${selector}:nth-child(${i + 1})` },
                    text: text.trim().slice(0, 100),
                  });
                }
              }
            }
            if (items.length > 0) break;
          }
        } catch {
          // Continue to next selector
        }
      }

      return { data: items, sources: includeSourceRefs ? sources : undefined, confidence: items.length > 0 ? 0.7 : 0.3 };
    }

    if (schema.type === "object" && schema.properties) {
      // Extract object with properties
      const result: Record<string, unknown> = {};
      const properties = schema.properties as Record<string, { type?: string; description?: string }>;

      for (const [key, propSchema] of Object.entries(properties)) {
        // Try to find content matching this property
        const searchTerms = [key, propSchema.description].filter(Boolean);

        for (const term of searchTerms) {
          if (!term) continue;

          // Look for labels or headings containing the term
          const labelSelectors = [
            `label:has-text("${term}")`,
            `th:has-text("${term}")`,
            `dt:has-text("${term}")`,
            `[class*="${term.toLowerCase()}"]`,
          ];

          for (const selector of labelSelectors) {
            try {
              const label = await page.locator(selector).first();
              if (await label.count() > 0) {
                // Try to find associated value
                const parent = label.locator('..');
                const siblingText = await parent.textContent();
                if (siblingText) {
                  const value = siblingText.replace(new RegExp(term, 'gi'), '').trim();
                  if (value) {
                    result[key] = propSchema.type === 'number' ? parseFloat(value) || value : value;
                    break;
                  }
                }
              }
            } catch {
              // Continue
            }
          }
        }
      }

      return {
        data: Object.keys(result).length > 0 ? result : { raw: content.slice(0, 1000) },
        sources: includeSourceRefs ? sources : undefined,
        confidence: Object.keys(result).length > 0 ? 0.6 : 0.2
      };
    }

    // Default: return text content
    return {
      data: content.trim().slice(0, 5000),
      sources: includeSourceRefs ? sources : undefined,
      confidence: 0.5
    };
  }

  /**
   * Get interactive elements with pre-computed selectors
   * Supports stable refs that persist across observations
   */
  private async getInteractiveElements(
    page: PlaywrightPage,
    options: {
      maxElements: number;
      filterRoles?: string[];
      includeBounds: boolean;
      // Stable ref options
      registry?: PageElementRegistry;
      stableRefs?: boolean;
      refreshRefs?: boolean;
      includeRefHistory?: boolean;
    }
  ): Promise<{ elements: InteractiveElement[]; total: number }> {
    const useStableRefs = options.stableRefs !== false && options.registry;
    const registry = options.registry;

    // Use page.evaluate for performance (single round-trip)
    // The function runs in browser context where DOM types exist
    type RawElement = {
      index: number;
      role: string;
      name: string | undefined;
      value: string | undefined;
      tagName: string;
      focused: boolean;
      disabled: boolean;
      actionHints: string[];
      selectorType: string;
      selectorValue: string;
      bounds: { x: number; y: number; width: number; height: number } | undefined;
      // Identity fields for stable refs
      testId?: string;
      id?: string;
      ariaLabel?: string;
      parentRole?: string;
      siblingIndex?: number;
    };

    // This function runs in browser context - use any to bypass DOM type checking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browserFn = (opts: { includeBounds: boolean }): any[] => {
      const selectors = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="textbox"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="slider"]',
        '[contenteditable="true"]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function getCssPath(element: any): string {
        const pathParts: string[] = [];
        let current = element;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        while (current && (current as any).tagName !== 'BODY') {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            selector = `#${current.id}`;
            pathParts.unshift(selector);
            break;
          }
          const parent = current.parentElement;
          if (parent) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const siblings = Array.from(parent.children).filter((c: any) => c.tagName === current.tagName);
            if (siblings.length > 1) {
              const idx = siblings.indexOf(current) + 1;
              selector += `:nth-of-type(${idx})`;
            }
          }
          pathParts.unshift(selector);
          current = parent;
        }
        return pathParts.join(' > ');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = (globalThis as any).window;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elements: any[] = Array.from(doc.querySelectorAll(selectors));

      return elements
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((el: any) => {
          const style = win.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((el: any, index: number) => {
          const rect = el.getBoundingClientRect();
          const role = el.getAttribute('role') || el.tagName.toLowerCase();

          const hints: string[] = [];
          if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            hints.push('clickable');
          }
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable')) {
            hints.push('editable');
          }
          if (el.tagName === 'SELECT') {
            hints.push('selectable');
          }
          if (el.type === 'checkbox' || el.getAttribute('role') === 'checkbox') {
            hints.push('checkable');
          }

          let selectorValue = '';
          let selectorType = 'css';

          const ariaLabel = el.getAttribute('aria-label');
          const text = el.textContent?.trim().slice(0, 50);
          const testIdAttr = el.getAttribute('data-testid');
          const name = el.getAttribute('name');
          const id = el.getAttribute('id');

          if (testIdAttr) {
            selectorType = 'testId';
            selectorValue = testIdAttr;
          } else if (ariaLabel) {
            selectorType = 'role';
            selectorValue = JSON.stringify({ role, name: ariaLabel });
          } else if (text && text.length > 0 && text.length < 50) {
            selectorType = 'text';
            selectorValue = text;
          } else if (id) {
            selectorType = 'css';
            selectorValue = `#${id}`;
          } else if (name) {
            selectorType = 'css';
            selectorValue = `[name="${name}"]`;
          } else {
            selectorType = 'css';
            selectorValue = getCssPath(el);
          }

          // Get parent role for context (used in stable refs)
          const parent = el.parentElement;
          let parentRole: string | undefined;
          if (parent) {
            parentRole = parent.getAttribute('role') || undefined;
          }

          // Get sibling index among same-role siblings
          let siblingIndex: number | undefined;
          if (parent) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const siblings = Array.from(parent.children).filter((c: any) =>
              (c.getAttribute('role') || c.tagName.toLowerCase()) === role
            );
            if (siblings.length > 1) {
              siblingIndex = siblings.indexOf(el);
            }
          }

          return {
            index,
            role,
            name: ariaLabel || text || undefined,
            value: el.value || undefined,
            tagName: el.tagName.toLowerCase(),
            focused: doc.activeElement === el,
            disabled: el.disabled || false,
            actionHints: hints,
            selectorType,
            selectorValue,
            bounds: opts.includeBounds ? {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            } : undefined,
            // Identity fields for stable refs
            testId: testIdAttr || undefined,
            id: id || undefined,
            ariaLabel: ariaLabel || undefined,
            parentRole,
            siblingIndex,
          };
        });
    };

    const rawElements: RawElement[] = await page.evaluate(browserFn, { includeBounds: options.includeBounds });

    const total = rawElements.length;

    // Apply filters and limit
    let filtered = rawElements;
    if (options.filterRoles) {
      filtered = filtered.filter(el => options.filterRoles!.includes(el.role));
    }
    filtered = filtered.slice(0, options.maxElements);

    // Convert to InteractiveElement format with proper selectors
    const elements: InteractiveElement[] = filtered.map((el, i) => {
      let selector: BAPSelector;

      if (el.selectorType === 'testId') {
        selector = { type: 'testId', value: el.selectorValue };
      } else if (el.selectorType === 'role') {
        const parsed = JSON.parse(el.selectorValue);
        selector = { type: 'role', role: parsed.role as AriaRole, name: parsed.name };
      } else if (el.selectorType === 'text') {
        selector = { type: 'text', value: el.selectorValue };
      } else {
        selector = { type: 'css', value: el.selectorValue };
      }

      // Generate stable ref or use index-based ref
      let ref: string;
      let stability: RefStability | undefined;
      let previousRef: string | undefined;

      if (useStableRefs && registry) {
        // Build element identity
        const identity: ElementIdentity = {
          testId: el.testId,
          id: el.id,
          ariaLabel: el.ariaLabel,
          role: el.role,
          name: el.name,
          tagName: el.tagName,
          parentRole: el.parentRole,
          siblingIndex: el.siblingIndex,
        };

        // Generate stable ref from identity
        ref = generateStableRef(identity);

        // Check if this ref already exists in registry
        const existing = registry.elements.get(ref);
        if (existing) {
          // Check if identity matches
          const matchScore = compareIdentities(identity, existing.identity);
          if (matchScore > 0.8) {
            // Same element, update last seen
            existing.lastSeen = Date.now();
            existing.bounds = el.bounds;
            stability = 'stable';
          } else {
            // Collision - different element with same ref
            // Append index to make it unique
            ref = `${ref}_${i + 1}`;
            stability = 'new';
          }
        } else {
          // New element
          stability = 'new';
        }

        // If refreshRefs was requested, check for previous ref
        if (options.refreshRefs && options.includeRefHistory) {
          // Look for this element with a different ref
          for (const [oldRef, entry] of registry.elements) {
            if (oldRef !== ref) {
              const matchScore = compareIdentities(identity, entry.identity);
              if (matchScore > 0.8) {
                previousRef = oldRef;
                stability = 'moved';
                break;
              }
            }
          }
        }

        // Update registry
        registry.elements.set(ref, {
          ref,
          selector,
          identity,
          lastSeen: Date.now(),
          bounds: el.bounds,
        });
      } else {
        // Use simple index-based ref
        ref = `@e${i + 1}`;
      }

      const element: InteractiveElement = {
        ref,
        selector,
        role: el.role,
        name: el.name,
        value: el.value,
        actionHints: el.actionHints as ActionHint[],
        bounds: el.bounds,
        tagName: el.tagName,
        focused: el.focused,
        disabled: el.disabled,
      };

      // Add stability fields if using stable refs
      if (useStableRefs) {
        element.stability = stability;
        if (previousRef) {
          element.previousRef = previousRef;
        }
      }

      return element;
    });

    // Update registry timestamp
    if (registry) {
      registry.lastObservation = Date.now();
    }

    return { elements, total };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  // PERF: Pre-compiled regex patterns for selector validation (avoids recompilation on each call)
  private static readonly SELECTOR_PATTERNS = {
    cssJavascript: /url\s*\(\s*['"]?\s*javascript:/i,
    cssExpression: /expression\s*\(/i,
    xpathDocument: /\bdocument\s*\(/i,
  };
  private static readonly MAX_SELECTOR_LENGTH = 10000;

  /**
   * SECURITY: Validate selector value for potential injection attacks
   * PERF: Uses pre-compiled regex patterns
   */
  private validateSelectorValue(value: string, type: string): void {
    // Check for empty or whitespace-only values
    if (!value || !value.trim()) {
      throw new BAPServerError(ErrorCodes.InvalidParams, `Empty ${type} selector value`);
    }

    // Check for excessively long selectors (potential DoS)
    if (value.length > BAPPlaywrightServer.MAX_SELECTOR_LENGTH) {
      this.logSecurity('SELECTOR_TOO_LONG', { type, length: value.length });
      throw new BAPServerError(ErrorCodes.InvalidParams, `Selector too long (max ${BAPPlaywrightServer.MAX_SELECTOR_LENGTH} chars)`);
    }

    // For CSS selectors, check for potentially dangerous patterns
    if (type === 'css') {
      // Block javascript: protocol in url() functions
      if (BAPPlaywrightServer.SELECTOR_PATTERNS.cssJavascript.test(value)) {
        this.logSecurity('SELECTOR_INJECTION', { type, pattern: 'javascript:' });
        throw new BAPServerError(ErrorCodes.InvalidParams, 'Invalid CSS selector: javascript: not allowed');
      }
      // Block expression() which is IE-specific and dangerous
      if (BAPPlaywrightServer.SELECTOR_PATTERNS.cssExpression.test(value)) {
        this.logSecurity('SELECTOR_INJECTION', { type, pattern: 'expression()' });
        throw new BAPServerError(ErrorCodes.InvalidParams, 'Invalid CSS selector: expression() not allowed');
      }
    }

    // For XPath, check for potentially dangerous functions
    if (type === 'xpath') {
      // Block document() which can access external documents
      if (BAPPlaywrightServer.SELECTOR_PATTERNS.xpathDocument.test(value)) {
        this.logSecurity('SELECTOR_INJECTION', { type, pattern: 'document()' });
        throw new BAPServerError(ErrorCodes.InvalidParams, 'Invalid XPath: document() not allowed');
      }
    }
  }

  /**
   * Resolve a BAP selector to a Playwright locator
   */
  private resolveSelector(page: PlaywrightPage, selector: BAPSelector): Locator {
    switch (selector.type) {
      case "css":
        this.validateSelectorValue(selector.value, 'css');
        return page.locator(selector.value);

      case "xpath":
        this.validateSelectorValue(selector.value, 'xpath');
        return page.locator(`xpath=${selector.value}`);

      case "role":
        return page.getByRole(selector.role as AriaRole, {
          name: selector.name,
          exact: selector.exact,
        });

      case "text":
        return page.getByText(selector.value, { exact: selector.exact });

      case "label":
        return page.getByLabel(selector.value, { exact: selector.exact });

      case "placeholder":
        return page.getByPlaceholder(selector.value, { exact: selector.exact });

      case "testId":
        return page.getByTestId(selector.value);

      case "semantic":
        // Semantic selectors require AI resolution
        // For now, fall back to text search
        return page.getByText(selector.description);

      case "coordinates":
        // For coordinates, we need to click directly
        // Return a locator for the body and handle coordinates in the action
        return page.locator("body");

      case "ref": {
        // Look up the element by its stable ref in the registry
        const pageId = this.getPageId(page);
        const state = this.clients.values().next().value;
        if (!state) {
          throw new BAPServerError(
            ErrorCodes.ElementNotFound,
            `No client state available for ref lookup: ${selector.ref}`
          );
        }
        const registry = state.elementRegistries.get(pageId);
        if (!registry) {
          throw new BAPServerError(
            ErrorCodes.ElementNotFound,
            `No element registry found for page. Call agent/observe first to populate refs.`
          );
        }
        const entry = registry.elements.get(selector.ref);
        if (!entry) {
          throw new BAPServerError(
            ErrorCodes.ElementNotFound,
            `Element ref not found: ${selector.ref}. The element may have been removed or the ref may be stale.`
          );
        }
        // Use the stored selector to find the element
        return this.resolveSelector(page, entry.selector);
      }

      default:
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Unknown selector type: ${(selector as { type: string }).type}`
        );
    }
  }

  /**
   * Get the browser type for launching
   */
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

  /**
   * Map BAP wait condition to Playwright
   */
  private mapWaitUntil(
    waitUntil?: WaitUntilState
  ): "load" | "domcontentloaded" | "networkidle" | "commit" | undefined {
    if (!waitUntil) return "load";
    return waitUntil;
  }

  /**
   * Ensure browser is launched
   */
  private ensureBrowser(state: ClientState): void {
    if (!state.browser || !state.context) {
      throw new BAPServerError(ErrorCodes.BrowserNotLaunched, "Browser not launched");
    }
  }

  /**
   * Check rate limit for a specific operation type
   * Throws BAPServerError if rate limit is exceeded
   *
   * PERF: Uses sliding window counter algorithm - O(1) time complexity
   * instead of O(n) array filter on every request
   */
  private checkRateLimit(state: ClientState, type: 'request' | 'screenshot'): void {
    const now = Date.now();
    const limits = this.options.limits;

    if (type === 'request') {
      const maxRps = limits.maxRequestsPerSecond ?? 50;
      const windowMs = 1000;

      // Initialize sliding window if needed
      if (!state.requestWindow) {
        state.requestWindow = { count: 0, windowStart: now };
      }

      // Check if we're in a new window
      if (now - state.requestWindow.windowStart >= windowMs) {
        // Start new window
        state.requestWindow = { count: 1, windowStart: now };
      } else {
        // Same window - check limit
        if (state.requestWindow.count >= maxRps) {
          throw new BAPServerError(
            ErrorCodes.ServerError,
            `Rate limit exceeded: ${maxRps} requests per second`,
            true, // retryable
            windowMs - (now - state.requestWindow.windowStart)  // retryAfterMs
          );
        }
        state.requestWindow.count++;
      }
    }

    if (type === 'screenshot') {
      const maxPerMinute = limits.maxScreenshotsPerMinute ?? 30;
      const windowMs = 60000;

      // Initialize sliding window if needed
      if (!state.screenshotWindow) {
        state.screenshotWindow = { count: 0, windowStart: now };
      }

      // Check if we're in a new window
      if (now - state.screenshotWindow.windowStart >= windowMs) {
        // Start new window
        state.screenshotWindow = { count: 1, windowStart: now };
      } else {
        // Same window - check limit
        if (state.screenshotWindow.count >= maxPerMinute) {
          throw new BAPServerError(
            ErrorCodes.ServerError,
            `Screenshot rate limit exceeded: ${maxPerMinute} per minute`,
            true, // retryable
            windowMs - (now - state.screenshotWindow.windowStart)  // retryAfterMs
          );
        }
        state.screenshotWindow.count++;
      }
    }
  }

  /**
   * Check page limit for a client
   */
  private checkPageLimit(state: ClientState): void {
    const maxPages = this.options.limits.maxPagesPerClient ?? 10;
    if (state.pages.size >= maxPages) {
      throw new BAPServerError(
        ErrorCodes.ServerError,
        `Page limit exceeded: maximum ${maxPages} pages per client`
      );
    }
  }

  /**
   * Sanitize browser launch arguments
   * Filters out dangerous args and only allows safe, known args
   */
  private sanitizeBrowserArgs(args?: readonly string[]): string[] {
    if (!args || args.length === 0) {
      return [];
    }

    return args.filter(arg => {
      // Extract arg name (before '=')
      const argName = arg.split('=')[0];

      // Check blocklist first - always reject these
      if (BLOCKED_BROWSER_ARGS.includes(argName)) {
        this.log(`Security: Blocked browser arg filtered: ${argName}`);
        return false;
      }

      // Check allowlist
      const isAllowed = ALLOWED_BROWSER_ARGS.some(pattern => {
        if (typeof pattern === 'string') {
          return arg === pattern || arg.startsWith(pattern + '=');
        }
        return pattern.test(arg);
      });

      if (!isAllowed) {
        this.log(`Security: Unknown browser arg filtered: ${arg}`);
        return false;
      }

      return true;
    });
  }

  /**
   * Validate a URL for security concerns
   * Blocks dangerous protocols and cloud metadata endpoints by default
   */
  private validateUrl(url: string): void {
    const security = this.options.security;
    const blockedProtocols = security.blockedProtocols ?? DEFAULT_BLOCKED_PROTOCOLS;
    const blockedHosts = security.blockedHosts ?? DEFAULT_BLOCKED_HOSTS;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BAPServerError(ErrorCodes.InvalidParams, `Invalid URL: ${url}`);
    }

    const protocol = parsed.protocol.replace(':', '');

    // Check allowed protocols first (if specified, takes precedence)
    if (security.allowedProtocols?.length) {
      if (!security.allowedProtocols.includes(protocol)) {
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Protocol not allowed: ${protocol}. Allowed: ${security.allowedProtocols.join(', ')}`
        );
      }
    } else {
      // Check blocked protocols
      if (blockedProtocols.includes(protocol)) {
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Blocked protocol: ${protocol}`
        );
      }
    }

    // Check allowed hosts first (if specified, takes precedence)
    if (security.allowedHosts?.length) {
      const isAllowed = security.allowedHosts.some(pattern => {
        if (pattern.startsWith('*.')) {
          // Wildcard subdomain match
          const domain = pattern.slice(2);
          return parsed.hostname === domain || parsed.hostname.endsWith('.' + domain);
        }
        return parsed.hostname === pattern;
      });
      if (!isAllowed) {
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Host not allowed: ${parsed.hostname}`
        );
      }
    } else {
      // Check blocked hosts
      if (blockedHosts.includes(parsed.hostname)) {
        throw new BAPServerError(
          ErrorCodes.InvalidParams,
          `Blocked host (cloud metadata endpoint): ${parsed.hostname}`
        );
      }
    }

    // Log warning for internal IPs (but don't block by default)
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      this.log(`Warning: Navigation to internal address: ${hostname}`);
    }
  }

  /**
   * Get page by ID or active page
   */
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

  /**
   * Get page ID from a Playwright page object
   */
  private getPageId(page: PlaywrightPage): string {
    // Find the page ID by searching the pages map
    const state = this.clients.values().next().value;
    if (state) {
      for (const [pageId, p] of state.pages) {
        if (p === page) {
          return pageId;
        }
      }
    }
    throw new BAPServerError(ErrorCodes.PageNotFound, "Page not found in registry");
  }

  /**
   * Set up event listeners for a page
   */
  private setupPageListeners(
    ws: WebSocket,
    state: ClientState,
    page: PlaywrightPage,
    pageId: string
  ): void {
    // Page events
    page.on("load", () => {
      if (state.eventSubscriptions.has("page")) {
        this.sendEvent(ws, "events/page", {
          type: "load",
          pageId,
          url: page.url(),
          timestamp: Date.now(),
        });
      }
    });

    page.on("domcontentloaded", () => {
      if (state.eventSubscriptions.has("page")) {
        this.sendEvent(ws, "events/page", {
          type: "domcontentloaded",
          pageId,
          url: page.url(),
          timestamp: Date.now(),
        });
      }
    });

    // Console events
    page.on("console", (msg: ConsoleMessage) => {
      if (state.eventSubscriptions.has("console")) {
        this.sendEvent(ws, "events/console", {
          pageId,
          level: msg.type() as "log" | "debug" | "info" | "warn" | "error",
          text: msg.text(),
          url: msg.location().url,
          line: msg.location().lineNumber,
          column: msg.location().columnNumber,
          timestamp: Date.now(),
        });
      }
    });

    // Network events
    page.on("request", (request: Request) => {
      if (state.eventSubscriptions.has("network")) {
        this.sendEvent(ws, "events/network", {
          type: "request",
          requestId: request.url() + "-" + Date.now(),
          pageId,
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          headers: request.headers(),
          postData: request.postData(),
          timestamp: Date.now(),
        });
      }
    });

    page.on("response", (response: Response) => {
      if (state.eventSubscriptions.has("network")) {
        this.sendEvent(ws, "events/network", {
          type: "response",
          requestId: response.url() + "-" + Date.now(),
          pageId,
          url: response.url(),
          status: response.status(),
          headers: response.headers(),
          timestamp: Date.now(),
        });
      }
    });

    // Dialog events
    page.on("dialog", (dialog: Dialog) => {
      if (state.eventSubscriptions.has("dialog")) {
        this.sendEvent(ws, "events/dialog", {
          pageId,
          type: dialog.type() as "alert" | "confirm" | "prompt" | "beforeunload",
          message: dialog.message(),
          defaultValue: dialog.defaultValue(),
          timestamp: Date.now(),
        });
      }
    });

    // Download events
    page.on("download", (download: Download) => {
      if (state.eventSubscriptions.has("download")) {
        this.sendEvent(ws, "events/download", {
          pageId,
          url: download.url(),
          suggestedFilename: download.suggestedFilename(),
          state: "started",
          timestamp: Date.now(),
        });
      }
    });

    // Handle external page close (user closes tab, browser crash, etc.)
    page.on("close", () => {
      // Remove page from state
      state.pages.delete(pageId);

      // Update active page if this was the active one
      if (state.activePage === pageId) {
        state.activePage = state.pages.keys().next().value ?? null;
      }

      // Notify client if subscribed to page events
      if (state.eventSubscriptions.has("page")) {
        this.sendEvent(ws, "events/page", {
          type: "close",
          pageId,
          timestamp: Date.now(),
        });
      }

      this.log(`Page ${pageId} closed externally`);
    });
  }

  /**
   * Send an event notification to the client
   */
  private sendEvent(ws: WebSocket, method: string, params: Record<string, unknown>): void {
    const notification = createNotification(method, params);
    ws.send(JSON.stringify(notification));
  }

  /**
   * Convert Playwright accessibility node to BAP format
   */
  private convertAccessibilityNode(node: any): AccessibilityNode {
    if (!node) {
      return { role: "none" };
    }

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
      children: node.children?.map((c: any) => this.convertAccessibilityNode(c)),
    };
  }

  /**
   * Simple HTML to Markdown conversion
   */
  private htmlToMarkdown(html: string): string {
    // Very basic conversion - in production, use a proper library like turndown
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

  /**
   * Clean up client state
   */
  private async cleanupClient(state: ClientState): Promise<void> {
    // Clear session timeouts (v0.2.0)
    this.clearSessionTimeouts(state);

    if (state.tracing && state.context) {
      try {
        await state.context.tracing.stop();
      } catch {
        // Ignore
      }
    }

    if (state.browser) {
      try {
        await state.browser.close();
      } catch {
        // Ignore
      }
    }

    state.browser = null;
    state.context = null;
    state.pages.clear();
    state.activePage = null;
    state.initialized = false;
  }

  /**
   * Handle errors and convert to appropriate response
   */
  private handleError(id: string | number, error: unknown): JSONRPCErrorResponse {
    if (error instanceof BAPServerError) {
      return createErrorResponse(id, error.code as ErrorCode, error.message, {
        retryable: error.retryable,
        retryAfterMs: error.retryAfterMs,
        details: error.details,
      });
    }

    if (error instanceof Error) {
      // Map Playwright errors to BAP error codes
      const message = error.message;

      if (message.includes("Timeout")) {
        return createErrorResponse(id, ErrorCodes.Timeout, message, { retryable: true });
      }

      if (message.includes("Target closed") || message.includes("Target page")) {
        return createErrorResponse(id, ErrorCodes.TargetClosed, message, { retryable: false });
      }

      if (message.includes("Element is not visible")) {
        return createErrorResponse(id, ErrorCodes.ElementNotVisible, message, { retryable: true });
      }

      if (message.includes("Element is not enabled")) {
        return createErrorResponse(id, ErrorCodes.ElementNotEnabled, message, { retryable: true });
      }

      if (message.includes("waiting for") && message.includes("to be visible")) {
        return createErrorResponse(id, ErrorCodes.ElementNotFound, message, {
          retryable: true,
          retryAfterMs: 1000,
        });
      }

      return createErrorResponse(id, ErrorCodes.InternalError, message, { retryable: false });
    }

    return createErrorResponse(id, ErrorCodes.InternalError, "Unknown error", { retryable: false });
  }

  // ===========================================================================
  // Context Handlers (Multi-Context Support)
  // ===========================================================================

  private async handleContextCreate(
    state: ClientState,
    params: ContextCreateParams
  ): Promise<ContextCreateResult> {
    if (!state.browser) {
      throw new BAPServerError(ErrorCodes.BrowserNotLaunched, "Browser not launched");
    }

    // Check context limit
    const maxContexts = 5; // TODO: Make configurable
    if (state.contexts.size >= maxContexts) {
      throw new BAPServerError(
        ErrorCodes.ResourceLimitExceeded,
        `Maximum ${maxContexts} contexts allowed`,
        false,
        undefined,
        { resource: "contexts", limit: maxContexts, current: state.contexts.size }
      );
    }

    // Validate custom ID if provided
    const contextId = params.contextId ?? `ctx-${randomUUID().slice(0, 8)}`;

    if (state.contexts.has(contextId)) {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Context with ID '${contextId}' already exists`
      );
    }

    // Create context with options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contextOptions: any = {};
    if (params.options) {
      if (params.options.viewport) contextOptions.viewport = params.options.viewport;
      if (params.options.userAgent) contextOptions.userAgent = params.options.userAgent;
      if (params.options.locale) contextOptions.locale = params.options.locale;
      if (params.options.timezoneId) contextOptions.timezoneId = params.options.timezoneId;
      if (params.options.geolocation) contextOptions.geolocation = params.options.geolocation;
      if (params.options.permissions) contextOptions.permissions = params.options.permissions;
      if (params.options.colorScheme) contextOptions.colorScheme = params.options.colorScheme;
      if (params.options.offline) contextOptions.offline = params.options.offline;
      if (params.options.storageState) {
        contextOptions.storageState = params.options.storageState;
      }
    }

    const context = await state.browser.newContext(contextOptions);

    // Auto-cleanup on context close
    context.on("close", () => {
      state.contexts.delete(contextId);
      // Clean up pages in this context
      for (const [pageId, ctxId] of state.pageToContext) {
        if (ctxId === contextId) {
          state.pages.delete(pageId);
          state.pageToContext.delete(pageId);
          state.elementRegistries.delete(pageId);
          state.frameContexts.delete(pageId);
        }
      }
    });

    state.contexts.set(contextId, {
      context,
      created: Date.now(),
      options: params.options,
    });

    // Set as default if this is the first context
    if (!state.defaultContextId) {
      state.defaultContextId = contextId;
      state.context = context;
    }

    return { contextId };
  }

  private async handleContextList(state: ClientState): Promise<ContextListResult> {
    const contexts: ContextInfo[] = [];

    for (const [id, ctxState] of state.contexts) {
      const pageCount = Array.from(state.pageToContext.values()).filter(
        (ctxId) => ctxId === id
      ).length;

      contexts.push({
        id,
        pageCount,
        created: ctxState.created,
        options: ctxState.options,
      });
    }

    return {
      contexts,
      limits: {
        maxContexts: 5, // TODO: Make configurable
        currentCount: state.contexts.size,
      },
    };
  }

  private async handleContextDestroy(
    state: ClientState,
    params: ContextDestroyParams
  ): Promise<ContextDestroyResult> {
    const ctxState = state.contexts.get(params.contextId);
    if (!ctxState) {
      throw new BAPServerError(
        ErrorCodes.ContextNotFound,
        `Context not found: ${params.contextId}`
      );
    }

    // Count pages before destroying
    let pagesDestroyed = 0;
    for (const [, ctxId] of state.pageToContext) {
      if (ctxId === params.contextId) {
        pagesDestroyed++;
      }
    }

    // Close the context (triggers cleanup via event handler)
    await ctxState.context.close();

    // If this was the default context, clear it
    if (state.defaultContextId === params.contextId) {
      state.defaultContextId = null;
      state.context = null;

      // Set another context as default if available
      const firstContext = state.contexts.values().next().value;
      if (firstContext) {
        state.defaultContextId = Array.from(state.contexts.keys())[0];
        state.context = firstContext.context;
      }
    }

    return { pagesDestroyed };
  }

  // ===========================================================================
  // Frame Handlers (Frame & Shadow DOM Support)
  // ===========================================================================

  private async handleFrameList(
    state: ClientState,
    params: FrameListParams
  ): Promise<FrameListResult> {
    const page = this.getPage(state, params.pageId);
    const frames: FrameInfo[] = [];

    for (const frame of page.frames()) {
      const parentFrame = frame.parentFrame();
      frames.push({
        frameId: this.getFrameId(frame),
        name: frame.name(),
        url: frame.url(),
        parentFrameId: parentFrame ? this.getFrameId(parentFrame) : undefined,
        isMain: frame === page.mainFrame(),
      });
    }

    return { frames };
  }

  private async handleFrameSwitch(
    state: ClientState,
    params: FrameSwitchParams
  ): Promise<FrameSwitchResult> {
    const page = this.getPage(state, params.pageId);
    const pageId = params.pageId ?? state.activePage!;
    let targetFrame: import("playwright").Frame | null = null;

    if (params.frameId) {
      // Find by frame ID
      targetFrame = page.frames().find((f) => this.getFrameId(f) === params.frameId) ?? null;
    } else if (params.selector) {
      // Find by selector (iframe element)
      const locator = this.resolveSelector(page, params.selector);
      const element = await locator.elementHandle();
      if (element) {
        targetFrame = await element.contentFrame();
      }
    } else if (params.url) {
      // Find by URL pattern
      targetFrame = page.frames().find((f) => f.url().includes(params.url!)) ?? null;
    }

    if (!targetFrame) {
      throw new BAPServerError(ErrorCodes.FrameNotFound, "Frame not found");
    }

    // Validate frame URL against allowed domains
    const frameUrl = targetFrame.url();
    try {
      this.validateUrl(frameUrl);
    } catch {
      throw new BAPServerError(
        ErrorCodes.DomainNotAllowed,
        `Frame URL not allowed: ${frameUrl}`
      );
    }

    // Store frame context
    state.frameContexts.set(pageId, {
      pageId,
      frameId: this.getFrameId(targetFrame),
    });

    return {
      frameId: this.getFrameId(targetFrame),
      url: frameUrl,
    };
  }

  private async handleFrameMain(
    state: ClientState,
    params: FrameMainParams
  ): Promise<FrameMainResult> {
    const page = this.getPage(state, params.pageId);
    const pageId = params.pageId ?? state.activePage!;

    // Clear frame context (switch to main)
    state.frameContexts.delete(pageId);

    return {
      frameId: this.getFrameId(page.mainFrame()),
    };
  }

  /**
   * Get a stable frame ID
   */
  private getFrameId(frame: import("playwright").Frame): string {
    // Create stable ID from frame properties
    const name = frame.name() || "main";
    const url = frame.url();
    // Simple hash
    let hash = 0;
    const str = `${name}:${url}`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return `frame-${Math.abs(hash).toString(36).slice(0, 8)}`;
  }

  // ===========================================================================
  // Stream Handlers (Streaming Responses)
  // ===========================================================================

  private async handleStreamCancel(
    state: ClientState,
    params: StreamCancelParams
  ): Promise<StreamCancelResult> {
    const stream = state.activeStreams.get(params.streamId);
    if (!stream) {
      return { cancelled: false };
    }

    stream.cancelled = true;
    state.activeStreams.delete(params.streamId);

    return { cancelled: true };
  }

  // ===========================================================================
  // Approval Handlers (Human-in-the-Loop)
  // ===========================================================================

  private async handleApprovalRespond(
    state: ClientState,
    params: ApprovalRespondParams
  ): Promise<ApprovalRespondResult> {
    const pending = state.pendingApprovals.get(params.requestId);
    if (!pending) {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `No pending approval with ID: ${params.requestId}`
      );
    }

    // Clear timeout
    clearTimeout(pending.timeoutHandle);
    state.pendingApprovals.delete(params.requestId);

    // Handle decision
    if (params.decision === "deny") {
      pending.reject(
        new BAPServerError(
          ErrorCodes.ApprovalDenied,
          params.reason ?? "Approval denied by user"
        )
      );
    } else {
      // For approve-session, remember this rule for the session
      if (params.decision === "approve-session") {
        state.sessionApprovals.add(pending.rule);
      }

      // Execute the original request
      // The resolve will be called by the interceptor when it continues
      pending.resolve({ approved: true, decision: params.decision });
    }

    return { acknowledged: true };
  }

  /**
   * Log a debug message
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[BAP Server] ${message}`);
    }
  }
}

// =============================================================================
// Server Error (moved here for forward reference)
// =============================================================================

class BAPServerError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "BAPServerError";
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Start the server from command line
 */
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

  // Handle shutdown signals
  const shutdown = async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Note: Use cli.ts as the entry point to start the server
