# @browseragentprotocol/mcp

MCP (Model Context Protocol) server for Browser Agent Protocol. Enables AI assistants to control web browsers.

## Supported Clients

| Client | Status |
|--------|--------|
| Claude Code | Supported |
| Claude Desktop | Supported |
| OpenAI Codex | Supported |
| Google Antigravity | Supported |
| Any MCP-compatible client | Supported |

## Installation

### With Claude Code

```bash
# Add the BAP browser server
claude mcp add --transport stdio bap-browser -- npx @browseragentprotocol/mcp
```

That's it! Claude Code can now control browsers. Try asking: *"Go to example.com and take a screenshot"*

### With OpenAI Codex

```bash
# Add the BAP browser server
codex mcp add bap-browser -- npx @browseragentprotocol/mcp
```

Or add to your `~/.codex/config.toml`:

```toml
[mcp_servers.bap-browser]
command = "npx"
args = ["@browseragentprotocol/mcp"]
```

### With Claude Desktop

Add to your config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bap-browser": {
      "command": "npx",
      "args": ["@browseragentprotocol/mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.

### With Google Antigravity

1. Open the MCP Store via the **"..."** dropdown at the top of the editor's agent panel
2. Click **Manage MCP Servers**
3. Click **View raw config**
4. Add the BAP browser server to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "bap-browser": {
      "command": "npx",
      "args": ["@browseragentprotocol/mcp"]
    }
  }
}
```

5. Save and refresh to load the new configuration

### Standalone

```bash
# Start the MCP server (connects to BAP server on localhost:9222)
npx @browseragentprotocol/mcp

# With custom BAP server URL
npx @browseragentprotocol/mcp --bap-url ws://localhost:9333
```

## How It Works

```
┌─────────────┐     MCP      ┌─────────────┐    BAP     ┌─────────────┐
│   Claude    │ ──────────── │  BAP MCP    │ ────────── │ BAP Server  │
│  (or other  │   (stdio)    │   Server    │ (WebSocket)│ (Playwright)│
│  MCP host)  │              │             │            │             │
└─────────────┘              └─────────────┘            └─────────────┘
                                                              │
                                                              ▼
                                                        ┌─────────────┐
                                                        │   Browser   │
                                                        └─────────────┘
```

1. Claude sends tool calls via MCP (stdio transport)
2. This package translates them to BAP protocol
3. BAP server controls the browser via Playwright
4. Results flow back to Claude

## Available Tools

When connected, Claude has access to these browser automation tools:

| Tool | Description |
|------|-------------|
| `browser_launch` | Launch a browser instance (Chromium, Firefox, or WebKit) |
| `browser_navigate` | Navigate to a URL |
| `browser_click` | Click an element using semantic selectors |
| `browser_fill` | Fill in a form field |
| `browser_type` | Type text into an element |
| `browser_screenshot` | Take a screenshot of the page |
| `browser_accessibility` | Get the accessibility tree (ideal for understanding page structure) |
| `browser_content` | Get page text content |
| `browser_close` | Close the browser |

## Example Conversations

**You:** Go to Hacker News and tell me the top 3 stories

**Claude:** I'll browse to Hacker News and get the top stories for you.

*[Uses browser_launch, browser_navigate, browser_accessibility]*

Here are the top 3 stories on Hacker News right now:
1. "Show HN: I built a tool for..."
2. "Why we switched from..."
3. "The future of..."

---

**You:** Fill out the contact form on example.com with my details

**Claude:** I'll navigate to the contact form and fill it out.

*[Uses browser_navigate, browser_fill, browser_click]*

Done! I've filled in the form with your details and submitted it.

## CLI Options

```
Options:
  --bap-url <url>     BAP server URL (default: ws://localhost:9222)
  --verbose           Enable verbose logging
  --help              Show help
```

## Managing the Server

```bash
# List configured MCP servers
claude mcp list

# Get details for the BAP browser server
claude mcp get bap-browser

# Remove the server
claude mcp remove bap-browser

# Check server status (within Claude Code)
/mcp
```

## Configuration Scopes

When adding the server with Claude Code, you can specify where to store the configuration:

```bash
# Local scope (default) - only you, only this project
claude mcp add --transport stdio bap-browser -- npx @browseragentprotocol/mcp

# User scope - available to you across all projects
claude mcp add --transport stdio --scope user bap-browser -- npx @browseragentprotocol/mcp

# Project scope - shared with team via .mcp.json
claude mcp add --transport stdio --scope project bap-browser -- npx @browseragentprotocol/mcp
```

## Programmatic Usage

```typescript
import { BAPMCPServer } from "@browseragentprotocol/mcp";

const server = new BAPMCPServer({
  bapServerUrl: "ws://localhost:9222",
  name: "my-browser-server",
  verbose: true,
});

await server.start();
```

## Requirements

- Node.js >= 20.0.0
- A running BAP server (`npx @browseragentprotocol/server-playwright`)
- An MCP-compatible client (Claude Code, Claude Desktop, OpenAI Codex, etc.)

## Troubleshooting

**"Connection closed" on Windows?**

On native Windows (not WSL), use the `cmd /c` wrapper:

```bash
claude mcp add --transport stdio bap-browser -- cmd /c npx @browseragentprotocol/mcp
```

**Server not connecting?**

Make sure the BAP server is running:

```bash
npx @browseragentprotocol/server-playwright
```

Then check the MCP server status:

```bash
/mcp  # Within Claude Code
```

## License

Apache-2.0
