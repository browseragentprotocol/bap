# @browseragentprotocol/server-playwright

BAP (Browser Agent Protocol) server implementation using [Playwright](https://playwright.dev).

|          | Linux | macOS | Windows |
|   :---   | :---: | :---: | :---:   |
| Chromium | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| WebKit   | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Firefox  | :white_check_mark: | :white_check_mark: | :white_check_mark: |

## Installation

```bash
npm install @browseragentprotocol/server-playwright
```

Playwright browsers are installed automatically on first run.

## Quick Start

```bash
# Start the server with defaults (headless Chromium on port 9222)
npx @browseragentprotocol/server-playwright

# Visible browser for debugging
npx @browseragentprotocol/server-playwright --no-headless

# Use Firefox on a custom port
npx @browseragentprotocol/server-playwright --browser firefox --port 9333
```

## CLI Options

```
Options:
  -p, --port <number>       WebSocket port (default: 9222)
  -h, --host <host>         Host to bind to (default: localhost)
  -b, --browser <browser>   Browser: chromium, firefox, webkit (default: chromium)
  --headless                Run in headless mode (default: true)
  --no-headless             Run with visible browser window
  -t, --timeout <ms>        Default timeout in milliseconds (default: 30000)
  -d, --debug               Enable debug logging
  --token <token>           Authentication token for client connections
  --help                    Show help
  -v, --version             Show version
```

## Examples

```bash
# Visible Chrome on custom port
npx @browseragentprotocol/server-playwright --port 9333 --no-headless

# Firefox with debug logging
npx @browseragentprotocol/server-playwright --browser firefox --debug

# With authentication required
npx @browseragentprotocol/server-playwright --token my-secret-token

# WebKit (Safari engine)
npx @browseragentprotocol/server-playwright --browser webkit
```

## Connecting Clients

### TypeScript

```typescript
import { BAPClient, role } from "@browseragentprotocol/client";

const client = new BAPClient("ws://localhost:9222");
await client.connect();

await client.launch({ browser: "chromium" });
await client.createPage({ url: "https://example.com" });
await client.click(role("button", "Submit"));

await client.close();
```

### With MCP (for AI agents)

```bash
# Add to any MCP-compatible client via CLI
npx @browseragentprotocol/mcp
```

## Programmatic Usage

```typescript
import { BAPPlaywrightServer } from "@browseragentprotocol/server-playwright";

const server = new BAPPlaywrightServer({
  port: 9222,
  host: "localhost",
  defaultBrowser: "chromium",
  headless: true,
  debug: false,
  timeout: 30000,
  authToken: "optional-token",
});

await server.start();

// Server is now accepting connections at ws://localhost:9222

// Graceful shutdown
await server.stop();
```

## Capabilities

### Semantic Selectors

BAP uses semantic selectors that are more stable than CSS selectors:

```typescript
// By ARIA role and accessible name
await client.click(role("button", "Submit"));
await client.fill(role("textbox", "Email"), "user@example.com");

// By visible text
await client.click(text("Sign in"));

// By label
await client.fill(label("Password"), "secret");
```

### Accessibility Tree

Get the full accessibility tree for AI reasoning:

```typescript
const { tree } = await client.accessibility();
// Returns structured accessibility nodes with roles, names, and properties
```

### Screenshots & PDFs

```typescript
// Screenshot
const { data } = await client.screenshot({ fullPage: true });

// PDF (Chromium only)
const { data } = await client.pdf({ format: "A4" });
```

### Network Interception

```typescript
// Mock API responses
await client.intercept([{ url: "**/api/**" }], async (request) => {
  return { status: 200, body: JSON.stringify({ mocked: true }) };
});
```

### Storage Management

```typescript
// Save authentication state
const state = await client.getStorageState();

// Restore in a new session
await client.setStorageState(state);
```

### Fused Operations

The server supports fused operations that combine multiple steps into single in-process calls, eliminating redundant DOM walks and WebSocket roundtrips:

- **navigate + observe**: Pass `observe` params alongside navigate to get page observation without a second call
- **act + observe**: Pass `preObserve`/`postObserve` to get observations before/after action execution
- **Incremental observe**: Set `incremental: true` to get only changes (added/updated/removed elements) since last observation
- **Response tiers**: Set `responseTier` to `"interactive"` or `"minimal"` to reduce observation payload size
- **Selector caching**: Element CSS paths are cached in the registry for faster resolution
- **Speculative prefetch**: After click/navigate actions, the server pre-builds observations for likely next requests

## Features

- **Cross-browser**: Chromium, Firefox, and WebKit via Playwright
- **Headless/Headed**: Run invisibly or with visible browser window
- **Authentication**: Optional token-based auth for client connections
- **Auto-wait**: Actions automatically wait for elements to be ready
- **Network control**: Intercept, mock, and monitor network requests
- **Mobile emulation**: Viewport, device scale, touch events, geolocation
- **Tracing**: Capture execution traces for debugging

## Requirements

- Node.js >= 20.0.0
- Playwright browsers (installed automatically)

## License

Apache-2.0
