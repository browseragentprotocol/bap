---
"@browseragentprotocol/protocol": minor
"@browseragentprotocol/logger": minor
"@browseragentprotocol/client": minor
"@browseragentprotocol/server-playwright": minor
"@browseragentprotocol/mcp": minor
"@browseragentprotocol/cli": minor
---

Production-ready v0.6.0: server decomposition, CDP attach, structured logging, recovery hints, action caching, self-healing selectors, session traces, MCP --slim mode, rich context persistence.

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
