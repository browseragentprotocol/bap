# BAP Roadmap

This document outlines the planned features for Browser Agent Protocol (BAP) to achieve its goal of becoming the de-facto standard for AI agents interacting with web browsers.

## Current State (v0.1.0-alpha)

BAP currently provides:
- 48+ JSON-RPC 2.0 methods for browser automation
- Semantic selectors (role, text, label, placeholder, testId, css, xpath, coordinates)
- Accessibility tree observation
- Screenshots and DOM snapshots
- Comprehensive security model (domain filtering, credential redaction, scope-based auth)
- MCP integration for AI assistants
- Multi-page support within a single context

---

## Roadmap Features

### 1. Composite Actions (AI-First Operations) ✅ IMPLEMENTED

**Priority**: Critical
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented as `agent/act`, `agent/observe`, `agent/extract`

#### Why This Matters

Current browser automation protocols (including BAP) only support atomic actions—individual clicks, types, and scrolls. AI agents must compose these into higher-level operations, reimplementing the same patterns repeatedly. Composite actions enable AI-driven exploration with natural language instructions.

Research shows that frameworks like Stagehand achieve 89.1% on WebVoyager using this pattern, while atomic-only approaches require significantly more round-trips and token consumption.

#### Optimal Implementation Strategy

**Key Insight**: Don't require an LLM on the server. Instead, make the server a **deterministic executor** while the client (or MCP host) handles AI reasoning. This keeps the server stateless and avoids LLM API key management on infrastructure.

**Architecture**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│  BAP Client │────▶│ BAP Server  │
│  (has LLM)  │     │  (composes) │     │(executes)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Protocol Design**:
```typescript
// Option A: Server executes a pre-planned action sequence (RECOMMENDED)
agent/execute: {
  steps: Array<{
    action: string,           // "action/click", "action/fill", etc.
    params: object,           // Action parameters
    condition?: {             // Optional pre-condition
      selector: BAPSelector,
      state: "visible" | "enabled" | "exists"
    },
    onError?: "stop" | "skip" | "retry"
  }>,
  stopOnFirstError?: boolean  // Default: true
} → {
  completed: number,
  failed?: { step: number, error: BAPError },
  results: Array<{ step: number, result: any }>
}

// Option B: Server provides enhanced observation for AI planning
agent/snapshot: {
  includeAccessibility: boolean,
  includeScreenshot?: boolean,
  includeInteractiveElements?: boolean,  // Filter to actionable elements only
  maxElements?: number                    // Limit for token efficiency
} → {
  accessibility?: AccessibilityTree,
  screenshot?: string,
  interactiveElements?: Array<{
    ref: string,
    selector: BAPSelector,    // Pre-computed selector for this element
    role: string,
    name: string,
    actionHints: string[]     // ["clickable", "editable", "expandable"]
  }>
}
```

**Why This Design**:
1. **No LLM dependency on server** — Server remains a pure automation engine
2. **Batch execution** — Single round-trip for multi-step flows (login = 1 call, not 5)
3. **Client controls AI** — Use any LLM (GPT-4, Claude, local) on client side
4. **Deterministic replay** — Action sequences can be logged and replayed exactly
5. **Security** — No prompt injection risk from page content affecting LLM

**Security Considerations**:
- All steps validated against scope permissions before execution
- Credential redaction applied to all step parameters
- Domain filtering checked for each navigation step
- Rate limiting applies to total actions, not just the batch call
- Audit log records each step individually

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | `AgentExecuteParams`, `AgentSnapshotParams`, step types |
| `@browseragentprotocol/client` | `execute()` for batched actions, `snapshot()` for AI-optimized observations |
| `@browseragentprotocol/server-playwright` | Sequential step executor with rollback support |
| `@browseragentprotocol/mcp` | `browser_execute` tool, enhanced `browser_snapshot` |

#### Breaking Changes

None—additive only.

---

### 2. Element Reference System ✅ IMPLEMENTED

**Priority**: High
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented with stable refs (`@submitBtn`, `@e7f3a2`), `RefSelector` type, and `PageElementRegistry`

#### Why This Matters

Semantic selectors can match multiple elements or break when text changes. Element references provide stable, short identifiers that:
- Reduce token usage (5 chars vs 50+ char selectors)
- Enable precise targeting after observation
- Survive minor DOM mutations within a session

#### Optimal Implementation Strategy

**Key Insight**: Use Playwright's `ElementHandle` internally but expose stable string refs. Store refs in a server-side `Map` with automatic cleanup on navigation.

**Reference Design**:
```typescript
// Refs are scoped to page + observation
// Format: @{pageId}:{observationId}:{elementIndex}
// Example: @p1:o3:42

// But exposed to client as simple: @e42 (server tracks context)
```

**Protocol**:
```typescript
// Observation returns refs
observe/accessibility: {
  includeRefs?: boolean      // Default: true
} → {
  tree: AccessibilityNode[],
  refs: Map<string, {        // "@e1" → element metadata
    selector: BAPSelector,   // Fallback selector if ref expires
    role: string,
    name: string,
    bounds: BoundingBox
  }>,
  refScope: {
    pageId: string,
    validUntil: "navigation" | "mutation" | number  // TTL in ms
  }
}

// New selector type
{ type: "ref", id: string }  // { type: "ref", id: "@e42" }

// Ref resolution with fallback
action/click: {
  selector: { type: "ref", id: "@e42" },
  fallbackSelector?: BAPSelector  // Use if ref expired
}
```

**Server-Side Storage**:
```typescript
// Efficient ref storage using WeakRef where possible
class RefStore {
  private refs = new Map<string, {
    handle: WeakRef<ElementHandle>,  // Weak reference to avoid memory leaks
    fallback: BAPSelector,           // For re-resolution
    created: number,
    pageId: string
  }>();

  // Auto-cleanup on navigation
  onNavigation(pageId: string) {
    for (const [id, ref] of this.refs) {
      if (ref.pageId === pageId) this.refs.delete(id);
    }
  }

  // Resolve ref to element, re-query if handle was GC'd
  async resolve(id: string, page: Page): Promise<ElementHandle | null> {
    const ref = this.refs.get(id);
    if (!ref) return null;

    const handle = ref.handle.deref();
    if (handle) return handle;

    // Handle was GC'd, try fallback selector
    return this.resolveSelector(page, ref.fallback);
  }
}
```

**Why This Design**:
1. **Memory efficient** — WeakRef allows GC of detached elements
2. **Auto-fallback** — Expired refs silently use fallback selector
3. **Scoped invalidation** — Navigation clears only affected page's refs
4. **Short tokens** — `@e42` instead of `role("button", "Submit Order")`
5. **No client-side state** — Server manages all ref lifecycle

**Security Considerations**:
- Refs are opaque strings—cannot be forged to access other sessions
- Refs scoped to client session (different clients get different ref namespaces)
- No sensitive data encoded in ref strings
- Ref store has max size limit (prevent memory exhaustion attacks)

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | `RefSelector` type, ref metadata in observations |
| `@browseragentprotocol/client` | `ref()` selector factory, optional ref caching |
| `@browseragentprotocol/server-playwright` | `RefStore` class, ref resolution in action handlers |

#### Breaking Changes

**Minor**: Accessibility tree nodes gain optional `ref` field. Fully backward compatible.

---

### 3. Screenshot Annotation (Set-of-Marks) ✅ IMPLEMENTED

**Priority**: High
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented with browser-side canvas rendering, configurable badge/box styles, and `annotationMap` linking labels to element refs

#### Why This Matters

Vision models struggle with precise coordinate targeting. Set-of-Marks overlays numbered labels on interactive elements, enabling vision models to say "click [3]" instead of calculating pixel coordinates.

#### Optimal Implementation Strategy

**Key Insight**: Generate annotations server-side using Playwright's screenshot capabilities + Canvas/Sharp for overlay. Return both the annotated image AND the label-to-ref mapping.

**Protocol**:
```typescript
observe/screenshot: {
  // Existing options...

  annotate?: {
    enabled: boolean,
    style: "marks" | "boxes" | "both",  // [1] labels, bounding boxes, or both
    filter?: {
      interactive: boolean,    // Only buttons, inputs, links (default: true)
      roles?: AriaRole[],      // Specific roles to include
      minSize?: number,        // Min pixel size to annotate (default: 10)
      maxLabels?: number       // Cap total labels (default: 50)
    },
    appearance?: {
      labelFormat: "numeric" | "alpha",  // [1] vs [A]
      fontSize: number,        // Default: 14
      backgroundColor: string, // Default: "#FFD700" (gold)
      textColor: string,       // Default: "#000000"
      opacity: number          // Default: 0.9
    }
  }
} → {
  data: string,              // Base64 annotated image
  format: "png" | "jpeg",
  annotations?: Array<{
    label: string,           // "[1]"
    ref: string,             // "@e1" - links to ref system
    bounds: { x, y, width, height },
    element: {
      role: string,
      name: string,
      tagName: string
    }
  }>
}
```

**Implementation Approach**:
```typescript
async function annotateScreenshot(page: Page, options: AnnotateOptions) {
  // 1. Get interactive elements with bounds
  const elements = await page.evaluate(() => {
    const interactive = document.querySelectorAll(
      'a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'
    );
    return Array.from(interactive)
      .filter(el => el.offsetWidth > 10 && el.offsetHeight > 10)
      .map((el, i) => ({
        index: i,
        bounds: el.getBoundingClientRect(),
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        name: el.getAttribute('aria-label') || el.textContent?.slice(0, 50)
      }));
  });

  // 2. Take base screenshot
  const screenshot = await page.screenshot({ type: 'png' });

  // 3. Overlay labels using Sharp (efficient image processing)
  const sharp = require('sharp');
  const { createCanvas } = require('canvas');

  // Create overlay with labels
  const overlay = createLabelOverlay(elements, options);

  // Composite overlay onto screenshot
  const annotated = await sharp(screenshot)
    .composite([{ input: overlay, blend: 'over' }])
    .png()
    .toBuffer();

  return { data: annotated.toString('base64'), annotations: elements };
}
```

**Why This Design**:
1. **Server-side rendering** — No client-side image processing needed
2. **Sharp for performance** — Native image processing, not slow Canvas
3. **Linked to refs** — Labels map to element refs for action execution
4. **Configurable density** — `maxLabels` prevents cluttered screenshots
5. **Interactive-only default** — Skips static text, images (reduces noise)

**Security Considerations**:
- Labels don't expose sensitive content (just indices)
- Password fields excluded from annotation by default
- Screenshot masking still applies (if configured)
- No JavaScript execution for label rendering (pure image processing)

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | Annotation types in screenshot params/result |
| `@browseragentprotocol/server-playwright` | Sharp-based annotation renderer |
| `@browseragentprotocol/mcp` | `browser_screenshot` gains `annotate` option |

#### New Dependencies

`@browseragentprotocol/server-playwright`:
- `sharp` — High-performance image processing

#### Breaking Changes

None—annotation is opt-in.

---

### 4. Multi-Context Support ✅ IMPLEMENTED

**Priority**: High
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented with `context/create`, `context/list`, `context/destroy` methods and per-context page tracking

#### Why This Matters

Single context means all pages share cookies/storage. This prevents:
- Testing multi-user scenarios
- Parallel isolated automation
- Clean separation between tasks

#### Optimal Implementation Strategy

**Key Insight**: Contexts are lightweight in Playwright. The main challenge is resource management—preventing context proliferation and ensuring cleanup.

**Protocol**:
```typescript
// Create isolated context
context/create: {
  contextId?: string,          // Optional custom ID (validated: alphanumeric + hyphen)
  options?: {
    storageState?: StorageState,
    viewport?: Viewport,
    userAgent?: string,
    locale?: string,
    timezoneId?: string,
    geolocation?: Geolocation,
    permissions?: string[],
    colorScheme?: "light" | "dark" | "no-preference",
    offline?: boolean
  }
} → { contextId: string }

// List contexts
context/list: {} → {
  contexts: Array<{
    id: string,
    pageCount: number,
    created: number,           // Timestamp
    options: ContextOptions    // Creation options (for debugging)
  }>,
  limits: {
    maxContexts: number,       // Server limit
    currentCount: number
  }
}

// Destroy context (closes all its pages)
context/destroy: {
  contextId: string
} → { pagesDestroyed: number }

// All page operations gain optional contextId
page/create: {
  url?: string,
  contextId?: string           // Default: last created or "default"
}
```

**Server-Side Management**:
```typescript
class ContextManager {
  private contexts = new Map<string, BrowserContext>();
  private readonly maxContexts: number;
  private readonly maxPagesPerContext: number;

  constructor(private browser: Browser, limits: Limits) {
    this.maxContexts = limits.maxContexts ?? 5;
    this.maxPagesPerContext = limits.maxPagesPerContext ?? 10;
  }

  async create(id: string, options: ContextOptions): Promise<string> {
    // Enforce limits
    if (this.contexts.size >= this.maxContexts) {
      throw new BAPError(ErrorCodes.ResourceLimitExceeded,
        `Max ${this.maxContexts} contexts allowed`);
    }

    // Validate custom ID
    if (id && !/^[a-zA-Z0-9-]{1,64}$/.test(id)) {
      throw new BAPError(ErrorCodes.InvalidParams, 'Invalid context ID format');
    }

    const contextId = id || `ctx-${randomUUID().slice(0, 8)}`;
    const context = await this.browser.newContext(options);

    // Auto-cleanup on disconnect
    context.on('close', () => this.contexts.delete(contextId));

    this.contexts.set(contextId, context);
    return contextId;
  }

  async destroy(id: string): Promise<number> {
    const context = this.contexts.get(id);
    if (!context) throw new BAPError(ErrorCodes.ContextNotFound);

    const pageCount = context.pages().length;
    await context.close();
    this.contexts.delete(id);
    return pageCount;
  }
}
```

**Why This Design**:
1. **Explicit limits** — Prevents resource exhaustion
2. **Auto-cleanup** — Context closure cascades to pages
3. **ID validation** — Prevents injection via context IDs
4. **Optional IDs** — Auto-generate for convenience, custom for testing
5. **Backward compatible** — Default context created implicitly

**Security Considerations**:
- Context IDs validated (alphanumeric + hyphen only)
- Resource limits enforced (max contexts, max pages per context)
- Each context isolated (no cross-context access)
- Scope system extended: `context:create`, `context:destroy` permissions
- Contexts auto-destroyed on client disconnect

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | Context types, methods, limits |
| `@browseragentprotocol/client` | `createContext()`, `destroyContext()`, context param on page methods |
| `@browseragentprotocol/server-playwright` | `ContextManager` class, resource limits |

#### Breaking Changes

None—default context created automatically. Existing code unchanged.

---

### 5. Human-in-the-Loop Approval Workflow ✅ IMPLEMENTED

**Priority**: Medium
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented with `approval/required` notification, `approval/respond` method, and configurable approval rules

#### Why This Matters

Enterprise and high-stakes automation requires human oversight. Without approval workflows, BAP cannot be used for financial transactions, data deletion, or other sensitive operations.

#### Optimal Implementation Strategy

**Key Insight**: Implement as an **interceptor pattern**—approval logic sits between request validation and execution. Use JSON-RPC notifications for the approval request (async) and a separate response method.

**Protocol Flow**:
```
Client                    Server
   │                         │
   ├─── action/click ───────▶│
   │                         │ (checks approval rules)
   │◀── approval/required ───┤ (notification)
   │                         │
   │    (shows to human)     │
   │                         │
   ├─── approval/respond ───▶│
   │                         │ (executes or rejects)
   │◀── action/click result ─┤
   │                         │
```

**Configuration**:
```typescript
// Server options
security: {
  approval: {
    mode: "disabled" | "audit" | "required",  // audit = log but don't block

    // Pattern-based rules (evaluated in order, first match wins)
    rules: Array<{
      name: string,                // For logging: "payment-buttons"
      match: {
        actions?: string[],        // ["action/click", "action/fill"]
        selectors?: Array<{        // Element patterns
          type: "role",
          role: string,
          namePattern?: string     // Regex: "pay|submit|delete"
        }>,
        domains?: string[],        // URL patterns: ["*.bank.com"]
        urlPatterns?: string[]     // Regex patterns
      },
      action: "require" | "allow" | "deny",
      timeout?: number             // Override default (60s)
    }>,

    defaultAction: "allow" | "require",  // If no rule matches
    timeout: number,               // Default: 60000ms
    includeScreenshot: boolean     // Attach screenshot to approval request
  }
}
```

**Approval Request/Response**:
```typescript
// Server → Client notification (no response expected for notification itself)
{
  jsonrpc: "2.0",
  method: "approval/required",
  params: {
    requestId: string,           // UUID for this approval
    originalRequest: {
      method: string,            // "action/click"
      params: object             // Redacted params (passwords masked)
    },
    rule: string,                // Which rule triggered: "payment-buttons"
    context: {
      pageUrl: string,
      pageTitle: string,
      screenshot?: string,       // Base64 if includeScreenshot
      elementInfo?: {            // Target element details
        role: string,
        name: string,
        bounds: BoundingBox
      }
    },
    expiresAt: number            // Unix timestamp
  }
}

// Client → Server
approval/respond: {
  requestId: string,
  decision: "approve" | "deny" | "approve-once" | "approve-session",
  reason?: string                // For audit log
} → { acknowledged: boolean }
```

**Server Implementation**:
```typescript
class ApprovalInterceptor {
  private pending = new Map<string, {
    request: JSONRPCRequest,
    resolve: (result: any) => void,
    reject: (error: Error) => void,
    timeout: NodeJS.Timeout
  }>();

  async intercept(request: JSONRPCRequest, context: RequestContext): Promise<any> {
    const rule = this.findMatchingRule(request, context);

    if (!rule || rule.action === 'allow') {
      return this.execute(request);  // No approval needed
    }

    if (rule.action === 'deny') {
      throw new BAPError(ErrorCodes.ApprovalDenied, `Action blocked by rule: ${rule.name}`);
    }

    // Approval required
    const requestId = randomUUID();
    const expiresAt = Date.now() + (rule.timeout ?? this.config.timeout);

    // Send notification to client
    this.sendNotification('approval/required', {
      requestId,
      originalRequest: this.redactSensitive(request),
      rule: rule.name,
      context: await this.buildContext(context),
      expiresAt
    });

    // Wait for response or timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new BAPError(ErrorCodes.ApprovalTimeout, 'Approval timed out'));
      }, rule.timeout ?? this.config.timeout);

      this.pending.set(requestId, { request, resolve, reject, timeout });
    });
  }

  handleResponse(response: ApprovalResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;  // Expired or unknown

    clearTimeout(pending.timeout);
    this.pending.delete(response.requestId);

    if (response.decision === 'deny') {
      pending.reject(new BAPError(ErrorCodes.ApprovalDenied, response.reason));
    } else {
      // Execute the original request
      this.execute(pending.request).then(pending.resolve, pending.reject);
    }
  }
}
```

**Why This Design**:
1. **Pattern-based rules** — Flexible matching without hardcoding
2. **Async notification** — Non-blocking for client
3. **Timeout protection** — Prevents hung requests
4. **Audit mode** — Log without blocking for gradual rollout
5. **Session approval** — "Approve all payments this session" option
6. **Screenshot context** — Human sees what they're approving

**Security Considerations**:
- Approval request params are redacted (no password values sent)
- Request IDs are UUIDs (not guessable)
- Timeout prevents denial-of-service via unanswered approvals
- Rules evaluated server-side (client can't bypass)
- All approvals/denials logged to audit trail

#### New Error Codes

```typescript
-32024: ApprovalDenied    // Human or rule denied the action
-32025: ApprovalTimeout   // No response within timeout
-32026: ApprovalRequired  // Action requires approval (informational)
```

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | Approval types, error codes, config schema |
| `@browseragentprotocol/client` | `onApprovalRequired` callback, `respondToApproval()` |
| `@browseragentprotocol/server-playwright` | `ApprovalInterceptor` class |
| `@browseragentprotocol/mcp` | Surface approval requests as MCP notifications |

#### Breaking Changes

None—approval is opt-in via configuration.

---

### 6. Frame and Shadow DOM Support ✅ IMPLEMENTED

**Priority**: Medium
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented with `frame/list`, `frame/switch`, `frame/main` methods for explicit iframe navigation

#### Why This Matters

Modern web apps use iframes (payment forms, embeds) and Shadow DOM (web components). Without explicit frame support, automating these is impossible or unreliable.

#### Optimal Implementation Strategy

**Key Insight**: Playwright already handles Shadow DOM automatically. The main need is explicit frame navigation and documenting the behavior.

**Protocol**:
```typescript
// List frames in current page
frame/list: {
  pageId?: string              // Default: active page
} → {
  frames: Array<{
    frameId: string,           // Stable ID for this frame
    name: string,              // Frame name attribute
    url: string,
    parentFrameId?: string,    // null for main frame
    isMain: boolean
  }>
}

// Switch frame context for subsequent actions
frame/switch: {
  frameId?: string,            // By ID from frame/list
  selector?: BAPSelector,      // Or find frame by selector (iframe element)
  url?: string                 // Or by URL pattern (for dynamic frames)
} → {
  frameId: string,
  url: string
}

// Return to main frame
frame/main: {} → { frameId: string }

// Enhanced selectors with frame scope
{
  type: "role",
  role: "button",
  name: "Submit",
  options: {
    frame?: string,            // Scope to specific frame
    piereShadow?: boolean      // Default: true (Playwright default)
  }
}
```

**Server Implementation**:
```typescript
class FrameManager {
  private currentFrame: Frame | null = null;

  async switchFrame(page: Page, target: FrameTarget): Promise<Frame> {
    let frame: Frame | null = null;

    if (target.frameId) {
      frame = page.frames().find(f => this.getFrameId(f) === target.frameId) ?? null;
    } else if (target.selector) {
      const handle = await this.resolveSelector(page, target.selector);
      const element = await handle.asElement();
      frame = await element?.contentFrame() ?? null;
    } else if (target.url) {
      frame = page.frames().find(f => f.url().includes(target.url)) ?? null;
    }

    if (!frame) {
      throw new BAPError(ErrorCodes.FrameNotFound, 'Frame not found');
    }

    // Security: validate frame URL against allowed domains
    if (!this.isAllowedDomain(frame.url())) {
      throw new BAPError(ErrorCodes.DomainNotAllowed,
        `Frame URL not in allowed domains: ${frame.url()}`);
    }

    this.currentFrame = frame;
    return frame;
  }

  getExecutionContext(page: Page): Frame {
    return this.currentFrame ?? page.mainFrame();
  }

  private getFrameId(frame: Frame): string {
    // Stable ID based on frame properties
    return `frame-${hashCode(frame.name() + frame.url())}`;
  }
}
```

**Why This Design**:
1. **Multiple resolution methods** — By ID, selector, or URL pattern
2. **Security validation** — Frame URLs checked against allowed domains
3. **Selector scoping** — Actions can target specific frames without switching
4. **Shadow DOM automatic** — Document Playwright's default behavior
5. **Stable frame IDs** — Based on name + URL, not internal handles

**Security Considerations**:
- Frame URLs validated against domain allowlist
- Cross-origin frame access follows browser security model
- Frame switching logged in audit trail
- `frame:*` scope permission for frame operations

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | Frame types, selector options |
| `@browseragentprotocol/client` | `listFrames()`, `switchFrame()`, `mainFrame()` |
| `@browseragentprotocol/server-playwright` | `FrameManager` class |

#### Breaking Changes

None—new methods only. Default behavior (auto Shadow DOM piercing) unchanged.

---

### 7. Streaming Responses ✅ IMPLEMENTED

**Priority**: Medium
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented with `stream/chunk`, `stream/end` notifications and `stream/cancel` method for chunked transfers

#### Why This Matters

Large responses (full-page screenshots, massive DOM trees) block until complete. Streaming enables progressive rendering and better memory efficiency.

#### Optimal Implementation Strategy

**Key Insight**: Use JSON-RPC notifications for chunks. The original request returns immediately with a `streamId`, then chunks arrive as notifications, then a completion notification.

**Protocol**:
```typescript
// Request with streaming
observe/screenshot: {
  stream: true,
  chunkSize?: number           // Default: 64KB
  // ...other options
} → {
  streamId: string,            // ID for this stream
  totalSize?: number,          // If known upfront
  contentType: string          // "image/png"
}

// Server sends chunks as notifications
{
  jsonrpc: "2.0",
  method: "stream/chunk",
  params: {
    streamId: string,
    index: number,             // 0-based chunk index
    data: string,              // Base64 chunk
    offset: number,            // Byte offset in full response
    size: number               // Chunk size in bytes
  }
}

// Stream completion
{
  jsonrpc: "2.0",
  method: "stream/end",
  params: {
    streamId: string,
    totalChunks: number,
    totalSize: number,
    checksum?: string          // SHA-256 for verification
  }
}

// Stream error
{
  jsonrpc: "2.0",
  method: "stream/error",
  params: {
    streamId: string,
    error: BAPError
  }
}

// Client can cancel
stream/cancel: {
  streamId: string
} → { cancelled: boolean }
```

**Server Implementation**:
```typescript
class StreamManager {
  private activeStreams = new Map<string, {
    buffer: Buffer,
    sent: number,
    cancelled: boolean
  }>();

  async streamResponse(
    data: Buffer,
    options: StreamOptions,
    send: (notification: JSONRPCNotification) => void
  ): Promise<StreamStartResult> {
    const streamId = randomUUID();
    const chunkSize = options.chunkSize ?? 64 * 1024;  // 64KB default

    this.activeStreams.set(streamId, { buffer: data, sent: 0, cancelled: false });

    // Start sending chunks asynchronously
    setImmediate(() => this.sendChunks(streamId, chunkSize, send));

    return {
      streamId,
      totalSize: data.length,
      contentType: options.contentType
    };
  }

  private async sendChunks(
    streamId: string,
    chunkSize: number,
    send: (notification: JSONRPCNotification) => void
  ): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    let index = 0;
    while (stream.sent < stream.buffer.length && !stream.cancelled) {
      const chunk = stream.buffer.subarray(stream.sent, stream.sent + chunkSize);

      send({
        jsonrpc: "2.0",
        method: "stream/chunk",
        params: {
          streamId,
          index: index++,
          data: chunk.toString('base64'),
          offset: stream.sent,
          size: chunk.length
        }
      });

      stream.sent += chunk.length;

      // Yield to event loop between chunks
      await new Promise(resolve => setImmediate(resolve));
    }

    if (!stream.cancelled) {
      send({
        jsonrpc: "2.0",
        method: "stream/end",
        params: {
          streamId,
          totalChunks: index,
          totalSize: stream.buffer.length,
          checksum: createHash('sha256').update(stream.buffer).digest('hex')
        }
      });
    }

    this.activeStreams.delete(streamId);
  }

  cancel(streamId: string): boolean {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return false;
    stream.cancelled = true;
    return true;
  }
}
```

**Client Assembly**:
```typescript
class StreamAssembler {
  private streams = new Map<string, {
    chunks: Map<number, Buffer>,
    totalSize?: number,
    resolve: (data: Buffer) => void,
    reject: (error: Error) => void
  }>();

  startStream(streamId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.streams.set(streamId, { chunks: new Map(), resolve, reject });
    });
  }

  handleChunk(params: StreamChunkParams): void {
    const stream = this.streams.get(params.streamId);
    if (!stream) return;
    stream.chunks.set(params.index, Buffer.from(params.data, 'base64'));
  }

  handleEnd(params: StreamEndParams): void {
    const stream = this.streams.get(params.streamId);
    if (!stream) return;

    // Assemble chunks in order
    const sorted = [...stream.chunks.entries()].sort((a, b) => a[0] - b[0]);
    const buffer = Buffer.concat(sorted.map(([_, chunk]) => chunk));

    // Verify checksum
    if (params.checksum) {
      const actual = createHash('sha256').update(buffer).digest('hex');
      if (actual !== params.checksum) {
        stream.reject(new Error('Stream checksum mismatch'));
        return;
      }
    }

    stream.resolve(buffer);
    this.streams.delete(params.streamId);
  }
}
```

**Why This Design**:
1. **Non-blocking** — Original request returns immediately
2. **Cancellable** — Client can stop mid-stream
3. **Ordered reassembly** — Chunks have indices for correct ordering
4. **Checksum verification** — Detect corruption
5. **Backpressure via setImmediate** — Prevents overwhelming client

**Security Considerations**:
- Stream IDs are UUIDs (not guessable)
- Streams auto-timeout if not completed (prevent memory leak)
- Max concurrent streams per client (default: 3)
- Checksum prevents tampering

#### Packages Affected

| Package | Changes |
|---------|---------|
| `@browseragentprotocol/protocol` | Stream types (chunk, end, error, cancel) |
| `@browseragentprotocol/client` | `StreamAssembler`, async iterator API |
| `@browseragentprotocol/server-playwright` | `StreamManager` class |

#### Breaking Changes

None—streaming is opt-in.

---

### 8. Python SDK ✅ IMPLEMENTED

**Priority**: High
**Target**: v0.1.0-alpha
**Status**: ✅ Implemented - Full Pythonic async SDK with Pydantic models, sync wrapper, CLI, and SSE transport

#### Why This Matters

The AI/ML ecosystem is Python-first. Without a Python client, BAP is inaccessible to most agent developers.

#### Implementation

The Python SDK is located at `packages/python-sdk/` and published as `browseragentprotocol` on PyPI.

**Package Structure**:
```
packages/python-sdk/
├── pyproject.toml        # Package config (Apache-2.0 license)
├── README.md             # Usage documentation
└── src/browseragentprotocol/
    ├── __init__.py       # Public API exports
    ├── client.py         # BAPClient async class
    ├── sync_client.py    # BAPClientSync wrapper
    ├── transport.py      # WebSocket transport (aiohttp)
    ├── sse.py            # SSE transport (httpx-sse)
    ├── context.py        # Context managers (bap_client, bap_session)
    ├── cli.py            # CLI entry point
    ├── errors.py         # Exception classes
    ├── py.typed          # PEP 561 marker
    └── types/
        ├── __init__.py
        ├── protocol.py   # JSON-RPC types
        ├── selectors.py  # Selector types + factory functions
        ├── common.py     # Common types (Page, Cookie, etc.)
        ├── agent.py      # Agent method types
        ├── methods.py    # Method params/results
        └── events.py     # Event types
```

**API Design** (implemented):
```python
from browseragentprotocol import BAPClient, role, text, label

async def main():
    # Context manager for auto-cleanup
    async with BAPClient("ws://localhost:9222") as client:
        # Pythonic method names (snake_case)
        await client.launch(browser="chromium", headless=True)
        page = await client.create_page(url="https://example.com")

        # Selectors are functions returning typed Pydantic models
        await client.click(role("button", "Submit"))
        await client.fill(label("Email"), "user@example.com")

        # Type-safe screenshots
        screenshot = await client.screenshot()
        print(f"Screenshot: {len(screenshot.data)} bytes")

        # Accessibility tree as typed model
        tree = await client.accessibility()
        print(f"Found {len(tree.tree)} nodes")

        # AI agent methods
        observation = await client.observe(
            include_accessibility=True,
            include_interactive_elements=True,
            max_elements=50,
        )

# High-level session helper
from browseragentprotocol.context import bap_session

async with bap_session("ws://localhost:9222", start_url="https://example.com") as client:
    await client.click(role("button", "Accept"))

# Sync wrapper for non-async contexts (scripts, notebooks)
from browseragentprotocol import BAPClientSync

with BAPClientSync("ws://localhost:9222") as client:
    client.launch(browser="chromium", headless=True)
    client.create_page(url="https://example.com")
    client.click(role("button", "Submit"))
```

**CLI** (implemented):
```bash
# Test connection
bap connect ws://localhost:9222

# Get server info
bap info ws://localhost:9222 --json
```

**Type Hints (Pydantic v2)** - implemented with full type coverage:
```python
from pydantic import BaseModel, Field
from typing import Literal
from enum import Enum

class AriaRole(str, Enum):
    BUTTON = "button"
    TEXTBOX = "textbox"
    LINK = "link"
    CHECKBOX = "checkbox"
    # ... 70+ ARIA roles

class RoleSelector(BaseModel):
    type: Literal["role"] = "role"
    role: AriaRole
    name: str | None = None
    exact: bool = False

# Union type for all selectors
BAPSelector = RoleSelector | TextSelector | CSSSelector | XPathSelector | LabelSelector | RefSelector | ...

# Selector factory functions
def role(role: str, name: str | None = None, *, exact: bool = False) -> RoleSelector:
    return RoleSelector(role=AriaRole(role), name=name, exact=exact)
```

**Transport Layers** - implemented with WebSocket and SSE:
```python
# WebSocket transport (primary)
from browseragentprotocol import WebSocketTransport

transport = WebSocketTransport(
    "ws://localhost:9222",
    auto_reconnect=True,
    max_reconnect_attempts=5,
)

# SSE transport (alternative for environments without WebSocket)
from browseragentprotocol import SSETransport

transport = SSETransport(
    "http://localhost:9222",
    headers={"Authorization": "Bearer token"},
)
```

**Why This Design**:
1. **Pydantic for validation** — Runtime type checking like Zod
2. **Async-first** — Native asyncio, not threading
3. **Sync wrapper** — For simple scripts and notebooks
4. **Type hints** — Full IDE support, mypy compatible (py.typed marker)
5. **Multiple transports** — WebSocket (aiohttp) and SSE (httpx-sse)
6. **Context managers** — Clean lifecycle management
7. **CLI tooling** — Test connections without writing code

**Security Considerations**:
- Token passed via URL query parameter (standard WebSocket auth)
- SSL/TLS certificate validation enabled by default
- No `eval()` or dynamic code execution
- Pydantic validates all server responses

#### Package Dependencies (implemented)

```toml
[project]
name = "browseragentprotocol"
license = { text = "Apache-2.0" }
requires-python = ">=3.10"
dependencies = [
    "aiohttp>=3.9.0",
    "pydantic>=2.0.0",
    "anyio>=4.0.0",
    "httpx>=0.27.0",
    "httpx-sse>=0.4.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "mypy>=1.8.0",
    "ruff>=0.1.0",
]

[project.scripts]
bap = "browseragentprotocol.cli:main"
```

#### Packages Affected

| Package | Changes |
|---------|---------|
| New: `browseragentprotocol` (PyPI) | Complete Python SDK |
| `packages/python-sdk/` | Monorepo integration with turbo/pnpm |

#### Breaking Changes

None—new package.

---

## Release Timeline

| Version | Features | Target |
|---------|----------|--------|
| v0.1.0-alpha | Core protocol, TypeScript SDK, MCP integration | ✅ Released |
| v0.1.0-alpha | Composite Actions, Element References, Screenshot Annotation, Multi-Context, Human Approval, Frame Support, Streaming | ✅ Released |
| v0.1.0-alpha | Python SDK | ✅ Released |
| v0.2.0 | Stable API, full documentation, compliance test suite | Q2 2026 |

---

## Security Principles

All roadmap features follow these security principles:

1. **Defense in depth** — Multiple layers (scopes + domain filtering + approval)
2. **Secure defaults** — Features that weaken security are opt-in
3. **Least privilege** — New features get their own scopes
4. **Audit trail** — All sensitive operations logged
5. **Input validation** — All client input validated server-side
6. **No secrets in logs** — Credentials/tokens redacted everywhere
7. **Resource limits** — Prevent exhaustion attacks (contexts, streams, refs)

---

## Contributing

We welcome contributions to any roadmap feature. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For feature discussions, open an issue with the `roadmap` label.

---

## Feedback

This roadmap is a living document. If you have feedback on priorities or feature design, please:
1. Open a GitHub Discussion
2. Comment on relevant issues
3. Reach out on Discord (coming soon)
