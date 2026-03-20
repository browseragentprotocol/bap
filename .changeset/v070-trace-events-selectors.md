---
"@browseragentprotocol/protocol": minor
"@browseragentprotocol/logger": minor
"@browseragentprotocol/client": minor
"@browseragentprotocol/server-playwright": minor
"@browseragentprotocol/mcp": minor
"@browseragentprotocol/cli": minor
---

v0.7.0: trace CLI, event streaming, selector suggestions, output modes, protocol spec.

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
