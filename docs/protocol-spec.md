# BAP Protocol Specification v0.8.0

**Status:** Stable — all 48 methods pinned. Additive changes only (new optional fields, new methods). No breaking changes without major version bump.

## Transport

- **Protocol:** JSON-RPC 2.0 over WebSocket
- **Default endpoint:** `ws://localhost:9222`
- **Health check:** `GET /health` returns `{"status":"ok","version":"0.8.0"}`
- **Auth:** Optional token via `?token=<tok>` query param or `X-BAP-Token` header
- **Max message size:** 10MB (configurable via `BAP_MAX_MESSAGE_SIZE`)

## Connection Lifecycle

1. Client opens WebSocket connection
2. Client sends `initialize` request
3. Server responds with capabilities
4. Client sends `notifications/initialized` notification
5. Client sends method requests, server responds
6. Client sends `shutdown` or disconnects

### Session Persistence

Clients may include `sessionId` in `initialize`. When a client with a `sessionId` disconnects, the server parks browser state in a dormant store. Reconnecting with the same `sessionId` restores the session. Dormant sessions expire after `dormantSessionTtl` (default: 300s).

## Error Responses

All errors follow JSON-RPC 2.0 error format with extended `data`:

```json
{
  "code": -32012,
  "message": "Element not found",
  "data": {
    "retryable": true,
    "retryAfterMs": 500,
    "details": { "selector": { "type": "text", "value": "Submit" } },
    "recoveryHint": "Run observe() to refresh interactive elements, then retry with an updated selector"
  }
}
```

### Error Codes

| Code   | Name                  | Retryable | Description                        |
| ------ | --------------------- | --------- | ---------------------------------- |
| -32700 | ParseError            | No        | Invalid JSON                       |
| -32600 | InvalidRequest        | No        | Invalid JSON-RPC structure         |
| -32601 | MethodNotFound        | No        | Unknown method                     |
| -32602 | InvalidParams         | No        | Invalid parameters                 |
| -32603 | InternalError         | No        | Server internal error              |
| -32000 | ServerError           | Yes       | Generic server error               |
| -32001 | NotInitialized        | No        | Call initialize() first            |
| -32002 | AlreadyInitialized    | No        | Already initialized                |
| -32010 | BrowserNotLaunched    | No        | Call browser/launch first          |
| -32011 | PageNotFound          | No        | Page ID not found                  |
| -32012 | ElementNotFound       | Yes       | Selector matched nothing           |
| -32013 | ElementNotVisible     | Yes       | Element exists but not visible     |
| -32014 | ElementNotEnabled     | Yes       | Element visible but disabled       |
| -32015 | NavigationFailed      | Yes       | Navigation error                   |
| -32016 | Timeout               | Yes       | Operation timed out                |
| -32017 | TargetClosed          | No        | Page/context closed                |
| -32020 | SelectorAmbiguous     | No        | Selector matched multiple elements |
| -32021 | ActionFailed          | Varies    | Action execution failed            |
| -32023 | ContextNotFound       | No        | Browser context not found          |
| -32024 | ResourceLimitExceeded | No        | Max pages/contexts reached         |
| -32030 | ApprovalDenied        | No        | Human denied the action            |
| -32040 | FrameNotFound         | No        | Frame not found                    |
| -32041 | DomainNotAllowed      | No        | Domain not in allowlist            |

## Methods (55)

### Lifecycle (3)

| Method                      | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `initialize`                | Handshake — returns server capabilities           |
| `notifications/initialized` | Client confirms ready (notification, no response) |
| `shutdown`                  | Clean shutdown                                    |

### Browser (2)

| Method           | Description                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `browser/launch` | Launch browser. Params: `browser`, `channel`, `headless`, `args`, `proxy`, `downloadsPath`, `userDataDir`, `cdpUrl` |
| `browser/close`  | Close browser                                                                                                       |

### Page (8)

| Method           | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `page/create`    | Create new page. Params: `url`, `viewport`, `userAgent`, `contextId` |
| `page/navigate`  | Navigate to URL. Params: `url`, `waitUntil`, `observe` (fusion)      |
| `page/reload`    | Reload page                                                          |
| `page/goBack`    | Navigate back                                                        |
| `page/goForward` | Navigate forward                                                     |
| `page/close`     | Close page                                                           |
| `page/list`      | List all pages                                                       |
| `page/activate`  | Activate page (bring to front)                                       |

### Actions (13)

| Method            | Description                      |
| ----------------- | -------------------------------- |
| `action/click`    | Click element                    |
| `action/dblclick` | Double-click element             |
| `action/type`     | Type text character by character |
| `action/fill`     | Fill input (clears first)        |
| `action/clear`    | Clear input                      |
| `action/press`    | Press keyboard key               |
| `action/hover`    | Hover over element               |
| `action/scroll`   | Scroll page or element           |
| `action/select`   | Select dropdown option           |
| `action/check`    | Check checkbox                   |
| `action/uncheck`  | Uncheck checkbox                 |
| `action/upload`   | Upload file                      |
| `action/drag`     | Drag element                     |

### Observations (7)

| Method                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `observe/screenshot`    | Take screenshot (JPEG default, PNG optional) |
| `observe/accessibility` | Get accessibility tree                       |
| `observe/dom`           | Get page HTML (sensitive content redacted)   |
| `observe/element`       | Get element properties                       |
| `observe/pdf`           | Generate PDF                                 |
| `observe/content`       | Get page text/HTML/markdown                  |
| `observe/ariaSnapshot`  | Get ARIA snapshot (YAML)                     |

### Storage (5)

| Method                 | Description                |
| ---------------------- | -------------------------- |
| `storage/getState`     | Get cookies + localStorage |
| `storage/setState`     | Set cookies + localStorage |
| `storage/getCookies`   | Get cookies                |
| `storage/setCookies`   | Set cookies                |
| `storage/clearCookies` | Clear cookies              |

### Emulation (4)

| Method                   | Description         |
| ------------------------ | ------------------- |
| `emulate/setViewport`    | Set viewport size   |
| `emulate/setUserAgent`   | Set user agent      |
| `emulate/setGeolocation` | Set geolocation     |
| `emulate/setOffline`     | Toggle offline mode |

### Dialog, Tracing, Events (4)

| Method             | Description              |
| ------------------ | ------------------------ |
| `dialog/handle`    | Accept/dismiss dialog    |
| `trace/start`      | Start Playwright trace   |
| `trace/stop`       | Stop trace, return data  |
| `events/subscribe` | Subscribe to event types |

### Context (3)

| Method            | Description            |
| ----------------- | ---------------------- |
| `context/create`  | Create browser context |
| `context/list`    | List contexts          |
| `context/destroy` | Destroy context        |

### Frame (3)

| Method         | Description          |
| -------------- | -------------------- |
| `frame/list`   | List frames          |
| `frame/switch` | Switch to frame      |
| `frame/main`   | Switch to main frame |

### Stream + Approval (2)

| Method             | Description                 |
| ------------------ | --------------------------- |
| `stream/cancel`    | Cancel streaming response   |
| `approval/respond` | Respond to approval request |

### Discovery (1)

| Method               | Description                   |
| -------------------- | ----------------------------- |
| `discovery/discover` | Discover WebMCP tools on page |

### Agent (3)

| Method          | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `agent/act`     | Execute action sequence with retry, conditions, fusion        |
| `agent/observe` | Get interactive elements with stable refs, annotation, fusion |
| `agent/extract` | Extract structured data from page                             |

## Observe Response Fields

### `alternativeSelectors` (v0.7.0)

Each `InteractiveElement` in `agent/observe` results includes an optional `alternativeSelectors` array — multiple selector options ordered by reliability (most reliable first):

1. `testId` — `data-testid` attribute (most stable, survives redesigns)
2. `role` + `name` — ARIA role with accessible name
3. `css` `#id` — Element ID (escaped for CSS special chars)
4. `text` — Visible text content (if < 50 chars)
5. `css` path — Full CSS path (least stable, but always unique)

Agents can choose the most appropriate selector based on their needs. The primary `selector` field contains the best available option.

## Selector Types (10)

| Type          | Example                               | Description                    |
| ------------- | ------------------------------------- | ------------------------------ |
| `css`         | `#login-btn`                          | CSS selector                   |
| `xpath`       | `//button[@type="submit"]`            | XPath expression               |
| `role`        | `{ role: "button", name: "Submit" }`  | ARIA role + name               |
| `text`        | `"Sign in"`                           | Visible text content           |
| `label`       | `"Email"`                             | Associated label text          |
| `placeholder` | `"Search..."`                         | Placeholder text               |
| `testId`      | `"submit-btn"`                        | `data-testid` attribute        |
| `semantic`    | `{ description: "the login button" }` | AI-resolved (fallback to text) |
| `coordinates` | `{ x: 100, y: 200 }`                  | Pixel coordinates              |
| `ref`         | `"@submitBtn"`                        | Stable ref from observe        |

## Fusion Operations (6)

1. **observe-act-observe** — `preObserve`/`postObserve` in `agent/act`
2. **navigate-observe** — `observe` param in `page/navigate`
3. **incremental observe** — `incremental: true` returns only changes
4. **selector caching** — cached CSS paths for ref lookups
5. **response tiers** — `full` | `interactive` | `minimal`
6. **speculative prefetch** — fire-and-forget observe after click/navigate

## Semver Commitment

- **Patch** (0.6.x): Bug fixes, performance improvements
- **Minor** (0.x.0): New optional fields, new methods, new selector types
- **Major** (x.0.0): Breaking changes to existing method signatures or behavior

All protocol fields added in minor versions are optional. Old clients/servers ignore unknown fields.
