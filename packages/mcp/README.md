# @browseragentprotocol/mcp

MCP (Model Context Protocol) server for Browser Agent Protocol. Gives any MCP-compatible AI agent full browser control.

## Installation

### One command — standalone mode

```bash
npx @browseragentprotocol/mcp
```

This auto-starts a BAP Playwright server and exposes browser tools over MCP stdio. No separate server process needed.

### Add to an MCP client

**Claude Code:**
```bash
claude mcp add --transport stdio bap-browser -- npx -y @browseragentprotocol/mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bap-browser": {
      "command": "npx",
      "args": ["-y", "@browseragentprotocol/mcp"]
    }
  }
}
```

**Codex CLI:**
```bash
codex mcp add bap-browser -- npx -y @browseragentprotocol/mcp
```

**Codex Desktop** — add to `~/.codex/config.toml`:
```toml
[mcp_servers.bap-browser]
command = "npx"
args = ["-y", "@browseragentprotocol/mcp"]
```

### Connect to an existing BAP server

If you already have a BAP Playwright server running, pass `--url` to skip auto-start:

```bash
npx @browseragentprotocol/mcp --url ws://localhost:9222
```

## How It Works

```
┌─────────────┐     MCP      ┌─────────────┐    BAP     ┌─────────────┐
│  AI Agent   │ ──────────── │  BAP MCP    │ ────────── │ BAP Server  │
│  (any MCP   │   (stdio)    │   Server    │ (WebSocket)│ (Playwright)│
│   client)   │              │             │            │             │
└─────────────┘              └─────────────┘            └─────────────┘
                                                              │
                                                              ▼
                                                        ┌─────────────┐
                                                        │   Browser   │
                                                        └─────────────┘
```

1. AI agent sends tool calls via MCP (stdio transport)
2. This package translates them to BAP protocol
3. BAP server controls the browser via Playwright
4. Results flow back to the agent

## Available Tools

### Navigation

| Tool | Description |
|------|-------------|
| `navigate` | Navigate to a URL |
| `go_back` | Navigate back in browser history |
| `go_forward` | Navigate forward in browser history |
| `reload` | Reload the current page |

### Element Interaction

| Tool | Description |
|------|-------------|
| `click` | Click an element using semantic selectors |
| `type` | Type text character by character (first clicks element) |
| `fill` | Fill a form field (clears existing content first) |
| `press` | Press keyboard keys (Enter, Tab, shortcuts) |
| `select` | Select an option from a dropdown |
| `scroll` | Scroll the page or a specific element |
| `hover` | Hover over an element |

### Observation

| Tool | Description |
|------|-------------|
| `screenshot` | Take a screenshot of the page |
| `accessibility` | Get the full accessibility tree |
| `aria_snapshot` | Token-efficient YAML accessibility snapshot (~80% fewer tokens) |
| `content` | Get page text content as text or markdown |
| `element` | Query element properties (exists, visible, enabled) |

### Page Management

| Tool | Description |
|------|-------------|
| `pages` | List all open pages/tabs |
| `activate_page` | Switch to a different page/tab |
| `close_page` | Close the current page/tab |

### AI Agent Methods

| Tool | Description |
|------|-------------|
| `observe` | AI-optimized page observation with interactive elements and stable refs |
| `act` | Execute a sequence of browser actions in a single call |
| `extract` | Extract structured data from the page using schema and CSS heuristics |

### Selector Formats

Tools that accept a `selector` parameter support these formats:

```
role:button:Submit        # ARIA role + accessible name (recommended)
text:Sign in              # Visible text content
label:Email address       # Associated label
testid:submit-button      # data-testid attribute
ref:@submitBtn            # Stable element reference from observe
css:.btn-primary          # CSS selector (fallback)
xpath://button[@type]     # XPath selector (fallback)
```

## CLI Options

```
Options:
  -b, --browser <name>        Browser: chrome (default), chromium, firefox, webkit, edge
  -u, --url <url>             Connect to existing BAP server (skips auto-start)
  -p, --port <number>         Port for auto-started server (default: 9222)
  --headless                  Run browser headless (default: true)
  --no-headless               Visible browser window
  --allowed-domains <list>    Comma-separated list of allowed domains
  -v, --verbose               Enable verbose logging to stderr
  -h, --help                  Show help
  --version                   Show version
```

## Programmatic Usage

```typescript
import { BAPMCPServer } from "@browseragentprotocol/mcp";

const server = new BAPMCPServer({
  bapServerUrl: "ws://localhost:9222",
  name: "my-browser-server",
  verbose: true,
});

await server.run();
```

## Requirements

- Node.js >= 20.0.0
- An MCP-compatible client

The BAP Playwright server is auto-started by default. To install Playwright browsers manually: `npx playwright install chromium`.

## Troubleshooting

**"Connection closed" on Windows?**

On native Windows (not WSL), use the `cmd /c` wrapper:

```json
{
  "mcpServers": {
    "bap-browser": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@browseragentprotocol/mcp"]
    }
  }
}
```

**Server not starting?**

Ensure Playwright browsers are installed:

```bash
npx playwright install chromium
```

## License

Apache-2.0
