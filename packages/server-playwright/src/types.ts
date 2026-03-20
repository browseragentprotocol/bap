/**
 * @fileoverview BAP Server internal types (ClientState, DormantSession, etc.)
 * @module @browseragentprotocol/server-playwright/types
 */

import type { Browser, BrowserContext, Page as PlaywrightPage } from "playwright";
import type {
  BAPScope,
  AgentObserveResult,
  JSONRPCRequest,
  ContextOptions,
  AccessibilityNode,
} from "@browseragentprotocol/protocol";
import type { PageElementRegistry } from "@browseragentprotocol/protocol";

// =============================================================================
// Rate Limiting
// =============================================================================

/** PERF: Sliding window counter for O(1) rate limiting */
export interface SlidingWindow {
  count: number;
  windowStart: number;
}

// =============================================================================
// Context & Stream Management
// =============================================================================

export interface ContextState {
  context: BrowserContext;
  created: number;
  options?: ContextOptions;
}

export interface ActiveStream {
  streamId: string;
  buffer: Buffer;
  sent: number;
  cancelled: boolean;
  contentType: string;
  chunkSize: number;
}

export interface PendingApproval {
  requestId: string;
  originalRequest: JSONRPCRequest;
  rule: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
}

export interface FrameContext {
  pageId: string;
  frameId: string | null; // null means main frame
}

// =============================================================================
// Client State
// =============================================================================

/** How the browser was obtained — controls cleanup behavior */
export type BrowserOwnership = "owned" | "borrowed" | "persistent";

export interface ClientState {
  clientId: string;
  initialized: boolean;
  browser: Browser | null;
  isPersistent: boolean;
  /** Browser lifecycle: owned (we launched it), borrowed (CDP attach, never close), persistent (userDataDir) */
  browserOwnership: BrowserOwnership;
  context: BrowserContext | null;
  contexts: Map<string, ContextState>;
  defaultContextId: string | null;
  pages: Map<string, PlaywrightPage>;
  pageToContext: Map<string, string>;
  activePage: string | null;
  eventSubscriptions: Set<string>;
  tracing: boolean;
  requestWindow?: SlidingWindow;
  screenshotWindow?: SlidingWindow;
  scopes: BAPScope[];
  sessionStartTime: number;
  lastActivityTime: number;
  sessionTimeoutHandle?: NodeJS.Timeout;
  idleTimeoutHandle?: NodeJS.Timeout;
  elementRegistries: Map<string, PageElementRegistry>;
  frameContexts: Map<string, FrameContext>;
  activeStreams: Map<string, ActiveStream>;
  pendingApprovals: Map<string, PendingApproval>;
  sessionApprovals: Set<string>;
  speculativeObservation?: {
    pageUrl: string;
    result: AgentObserveResult;
    timestamp: number;
  };
  speculativePrefetchTimer?: NodeJS.Timeout;
  sessionId?: string;
}

// =============================================================================
// Dormant Session
// =============================================================================

export interface DormantSession {
  sessionId: string;
  browser: Browser | null;
  isPersistent: boolean;
  browserOwnership: BrowserOwnership;
  context: BrowserContext | null;
  contexts: Map<string, ContextState>;
  defaultContextId: string | null;
  pages: Map<string, PlaywrightPage>;
  pageToContext: Map<string, string>;
  activePage: string | null;
  elementRegistries: Map<string, PageElementRegistry>;
  frameContexts: Map<string, FrameContext>;
  sessionApprovals: Set<string>;
  ttlHandle: NodeJS.Timeout;
  parkedAt: number;
  /** Snapshot of cookies + localStorage for crash recovery */
  storageStateSnapshot?: string;
}

export type PageOwner = {
  ws: import("ws").WebSocket | null;
  state: ClientState | DormantSession;
};

// =============================================================================
// Misc Types
// =============================================================================

export interface PlaywrightAccessibilityNode {
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  checked?: AccessibilityNode["checked"];
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  selected?: boolean;
  required?: boolean;
  level?: number;
  children?: PlaywrightAccessibilityNode[];
}

export interface ActionConfirmationEvent {
  pageId: string;
  action: string;
  selector?: { type: string; value?: string; role?: string; name?: string };
  status: "success" | "failed" | "partial";
  changes?: {
    urlChanged?: boolean;
    newUrl?: string;
    elementState?: { visible?: boolean; checked?: boolean; value?: string };
  };
  error?: string;
  timestamp: number;
}

// =============================================================================
// Handler Context (shared interface for all extracted handlers)
// =============================================================================

export interface HandlerContext {
  options: import("./config.js").ResolvedOptions;
  clients: Map<import("ws").WebSocket, ClientState>;
  dormantSessions: Map<string, DormantSession>;
  log: (message: string, context?: Record<string, unknown>) => void;
  logSecurity: (event: string, details: Record<string, unknown>) => void;
  getPage: (state: ClientState, pageId?: string) => PlaywrightPage;
  resolveSelector: (
    page: PlaywrightPage,
    selector: import("@browseragentprotocol/protocol").BAPSelector
  ) => import("playwright").Locator;
  /** Async self-healing selector resolution — tries fallback identity signals on failure */
  resolveSelectorWithHealing: (
    page: PlaywrightPage,
    selector: import("@browseragentprotocol/protocol").BAPSelector
  ) => Promise<import("playwright").Locator>;
  checkAuthorization: (state: ClientState, method: string) => void;
  checkRateLimit: (state: ClientState, type: "request" | "screenshot") => void;
  checkPageLimit: (state: ClientState) => void;
  ensureBrowser: (state: ClientState) => void;
  validateUrl: (url: string) => void;
  sanitizeBrowserArgs: (args?: readonly string[]) => string[];
  getBrowserType: (name: string) => import("playwright").BrowserType;
  mapWaitUntil: (
    waitUntil?: import("@browseragentprotocol/protocol").WaitUntilState
  ) => "load" | "domcontentloaded" | "networkidle" | "commit" | undefined;
  sendEvent: (ws: import("ws").WebSocket, method: string, params: Record<string, unknown>) => void;
  setupPageListeners: (page: PlaywrightPage, pageId: string) => void;
  getPageId: (page: PlaywrightPage) => string;
  findPageOwner: (pageId: string) => PageOwner | null;
  removePageFromOwner: (state: ClientState | DormantSession, pageId: string) => void;
  isContextAlive: (context: BrowserContext | null) => boolean;
  getClientScopes: () => BAPScope[];
  redactSensitiveContent: (html: string) => string;
  convertAccessibilityNode: (
    node: PlaywrightAccessibilityNode | null | undefined
  ) => AccessibilityNode;
  htmlToMarkdown: (html: string) => string;
  // Session management
  parkSession: (state: ClientState) => Promise<void>;
  restoreSession: (dormant: DormantSession, state: ClientState) => boolean;
  clearConnectionScopedState: (state: ClientState, errorMessage: string) => void;
  clearSessionTimeouts: (state: ClientState) => void;
  cleanupClient: (state: ClientState) => Promise<void>;
  // Handler dispatch (needed by agent/act for step retry, page/navigate fusion)
  dispatch: (
    ws: import("ws").WebSocket | null,
    state: ClientState,
    method: string,
    params: Record<string, unknown>
  ) => Promise<unknown>;
}
