# @browseragentprotocol/server-playwright

## 0.8.0

### Minor Changes

- Action caching with resolved CSS selectors, network header redaction, event rate limiting, CLI help restructuring

### Patch Changes

- Updated dependencies
  - @browseragentprotocol/protocol@0.8.0
  - @browseragentprotocol/logger@0.8.0

## 0.7.0

### Minor Changes

- 762e88b: v0.7.0: trace CLI, event streaming, selector suggestions, output modes, protocol spec.

  ### `bap trace` CLI
  - View session traces: `bap trace`, `bap trace --all`, `bap trace --session=<id>`
  - List sessions: `bap trace --sessions`
  - HTML replay viewer: `bap trace --replay`
  - JSON export: `bap trace --export=<file>`
  - Path validation prevents file writes outside cwd/~/.bap
  - HTML output fully XSS-escaped (errors, methods, sessionId)

  ### Console/Network Event Streaming
  - Browser console errors forwarded to MCP clients as `notifications/message`
  - 4xx/5xx network responses forwarded with method, URL, and status code
  - Only error-level events streamed to avoid flooding

  ### Observe with Selector Suggestions
  - `alternativeSelectors` field on InteractiveElement (optional, ordered by reliability)
  - Reliability order: testId → role+ariaLabel → css#id → text → cssPath
  - CSS IDs escaped for special characters
  - Deduplication via serialized comparison

  ### Output Modes
  - `--format=pretty` (TTY default): colored, human-readable
  - `--format=json`: structured JSON for piping
  - `--format=agent` (non-TTY default): concise markdown
  - All 7 formatter functions support all 3 modes
  - Invalid format values rejected with error message

  ### Protocol Spec
  - Formal specification at docs/protocol-spec.md
  - 55 methods documented with descriptions
  - 10 selector types, 6 fusion operations
  - Error codes with retryability
  - Semver commitment for protocol stability

### Patch Changes

- Updated dependencies [762e88b]
  - @browseragentprotocol/protocol@0.7.0
  - @browseragentprotocol/logger@0.7.0

## 0.6.0

### Minor Changes

- 48d108a: Production-ready v0.6.0: server decomposition, CDP attach, structured logging, recovery hints, action caching, self-healing selectors, session traces, MCP --slim mode, rich context persistence.

  ### Server Decomposition
  - Split 5400-line server.ts monolith into ~28 focused modules with HandlerContext dependency injection
  - Handlers independently testable via explicit context interface

  ### CDP Attach
  - `cdpUrl` parameter in `browser/launch` connects to running browsers via `chromium.connectOverCDP()`
  - Borrowed browser lifecycle: never closed on disconnect, only reference dropped

  ### Structured Logging
  - Logger `format: "json"` option emits NDJSON to stderr (MCP-safe)
  - Server uses structured JSON logging for all debug output

  ### Error Recovery Hints
  - `recoveryHint` field on all 20+ BAPError subclasses
  - Every error response includes actionable agent guidance
  - `fromResponse()` propagates recovery hints through the wire

  ### Session Traces
  - Auto-records NDJSON traces to `~/.bap/traces/`
  - Every request: method, timing, status, result summary

  ### Action Caching
  - File-system LRU cache at `~/.bap/cache/actions/`
  - SHA256 keys, 24h TTL, configurable max entries

  ### Self-Healing Selectors
  - `resolveSelectorWithHealing()` fallback chain: testId → ariaLabel+role → id → name
  - Wired into agent/act retry loop

  ### MCP --slim Mode
  - `--slim` flag exposes only 5 essential tools: navigate, observe, act, extract, screenshot
  - Reduces tool description token overhead for constrained agents

  ### Rich Context Persistence
  - `context.storageState()` snapshot on session park
  - Cookies + localStorage survive browser crashes during dormancy

  ### Bug Fixes
  - preObserve fusion now runs before steps (was incorrectly running after)
  - storage/setState validates URLs before navigation (security fix)
  - Borrowed browsers never closed in stop(), cleanupClient(), or dormant session expiry

  ### Protocol
  - `cdpUrl` field in BrowserLaunchParams
  - `recoveryHint` field in JSONRPCErrorData
  - `BAP_VERSION` updated to 0.6.0

### Patch Changes

- Updated dependencies [48d108a]
  - @browseragentprotocol/protocol@0.6.0
  - @browseragentprotocol/logger@0.6.0

## 0.5.0

### Minor Changes

- c970d42: Add `bap scroll` CLI command, fix session persistence ghost pages, polished 2K demo videos.

  ### New
  - `bap scroll [up|down|left|right] [--pixels=N]` — scroll the page or an element into view
  - Automated demo video recorder (`scripts/record-demo/`) with bezier cursor, zoom-at-click effects, and GIF export
  - Two 2K demo GIFs embedded in README: blog reader and skill scorer (multi-tab workflow)

  ### Fixed
  - `ensureReady()` no longer treats `about:blank` ghost pages from failed session restores as valid — re-initializes browser instead
  - `--pixels` flag for scroll command parsed correctly in CLI arg parser

  ### Changed
  - README rewritten: vendor-neutral, table layout, polished demo GIFs
  - Removed old `examples/` directory (replaced by demo recordings)
  - Removed 6 orphaned asset PNGs

### Patch Changes

- Updated dependencies [c970d42]
  - @browseragentprotocol/protocol@0.5.0
  - @browseragentprotocol/logger@0.5.0

## 0.4.0

### Minor Changes

- 982ee6b: Harden release readiness for public launch by shipping explicit package licenses
  and changelogs in npm tarballs, tightening package metadata, improving CLI
  browser messaging, and adding stronger CI and release verification.
- 982ee6b: Add server-side session persistence for CLI. Browser pages now survive across CLI invocations via a dormant session store. When a client with a `sessionId` disconnects, the server parks browser state instead of destroying it. On reconnect with the same `sessionId`, state is restored transparently. CLI auto-generates `sessionId` as `cli-<port>` with `-s=<name>` override for multi-session use cases.
- 982ee6b: Add WebMCP tool discovery support via new `discovery/discover` protocol method. Detects tools exposed by websites through the W3C WebMCP standard (declarative HTML attributes and imperative navigator.modelContext API). Also available through `agent/observe` with opt-in `includeWebMCPTools` parameter.

### Patch Changes

- Updated dependencies [982ee6b]
- Updated dependencies [982ee6b]
- Updated dependencies [982ee6b]
  - @browseragentprotocol/logger@0.4.0
  - @browseragentprotocol/protocol@0.4.0

## 0.3.0

### Minor Changes

- 7fbae25: Add `@browseragentprotocol/cli` package with 20+ browser automation commands, composite selectors, session management, and skill installation. Add fused kernel operations to protocol and server-playwright for batch action execution.

### Patch Changes

- Updated dependencies [7fbae25]
  - @browseragentprotocol/protocol@0.3.0

## 0.2.0

### Minor Changes

- 7b5941a: v0.2.0 — browser selection, clean tool names, smarter extract

### Patch Changes

- Updated dependencies [7b5941a]
  - @browseragentprotocol/protocol@0.2.0
  - @browseragentprotocol/logger@0.2.0

## 0.1.0

### Minor Changes

- eb08aae: Initial public release

### Patch Changes

- Updated dependencies [eb08aae]
  - @browseragentprotocol/logger@0.1.0
  - @browseragentprotocol/protocol@0.1.0
