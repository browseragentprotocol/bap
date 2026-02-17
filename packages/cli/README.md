# @browseragentprotocol/cli

[![npm version](https://badge.fury.io/js/@browseragentprotocol%2Fcli.svg)](https://www.npmjs.com/package/@browseragentprotocol/cli)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

AI-native browser automation from the command line. Like playwright-cli but with superpowers: composite actions (`bap act`), semantic selectors, and structured extraction.

## Quick Start

```bash
npx @browseragentprotocol/cli open https://example.com
npx @browseragentprotocol/cli observe --max=20
npx @browseragentprotocol/cli click role:button:"Get Started"
```

Or install globally:

```bash
npm i -g @browseragentprotocol/cli
bap open https://example.com
```

## Why BAP CLI?

### Composite Actions — 40x Token Reduction

Execute multi-step flows in **one command** instead of one-at-a-time:

```bash
# playwright-cli: 3 commands, 3 snapshots, 3 LLM reasoning cycles
playwright-cli fill e5 "user@example.com"
playwright-cli fill e8 "password123"
playwright-cli click e12

# bap: 1 command, 1 snapshot, 1 LLM reasoning cycle
bap act fill:e5="user@example.com" fill:e8="password123" click:e12
```

### Semantic Selectors — Resilient to Layout Changes

Target elements by their purpose, not their position:

```bash
bap click role:button:"Submit"
bap fill label:"Email" "user@example.com"
bap act fill:role:textbox:"Email"="user@example.com" \
        fill:role:textbox:"Password"="secret" \
        click:role:button:"Sign in"
```

### Structured Extraction — Validated JSON Output

```bash
bap extract --fields="title,price,rating"
bap extract --schema=product.json
bap extract --list="product"
```

## Commands

### Navigation

```bash
bap open [url]              # Open browser, optionally navigate
bap goto <url>              # Navigate to URL
bap back                    # Go back
bap forward                 # Go forward
bap reload                  # Reload page
```

### Interaction

```bash
bap click <selector>        # Click element
bap fill <selector> <value> # Fill input field
bap type <text>             # Type into focused element
bap press <key>             # Press keyboard key
bap select <selector> <val> # Select dropdown option
bap check <selector>        # Check checkbox
bap uncheck <selector>      # Uncheck checkbox
bap hover <selector>        # Hover over element
```

### Observation

```bash
bap observe                 # Interactive elements (default max 50)
bap observe --full          # Full accessibility tree
bap observe --forms         # Form fields only
bap observe --navigation    # Navigation elements only
bap observe --max=20        # Limit elements
bap snapshot [--file=F]     # YAML accessibility snapshot
bap screenshot [--file=F]   # PNG screenshot
```

### Composite Actions

```bash
bap act <step1> <step2> ... # Execute multiple steps atomically
```

Step syntax: `action:selector=value` or `action:selector`

```bash
# Login flow in one command
bap act fill:role:textbox:"Email"="user@example.com" \
        fill:role:textbox:"Password"="secret" \
        click:role:button:"Sign in"

# Accept cookies + navigate
bap act click:text:"Accept" goto:https://example.com/app

# Fill and submit a search
bap act fill:role:searchbox:"Search"="query here" press:Enter
```

### Sessions & Tabs

```bash
bap -s=<name> <command>     # Named session
bap sessions                # List active sessions
bap tabs                    # List open tabs
bap tab-new [url]           # Open new tab
bap tab-select <N>          # Switch to tab
bap frames                  # List frames
bap frame-switch <id>       # Switch to frame
```

### Recipes

```bash
bap recipe login <url> --user=<u> --pass=<p>
bap recipe fill-form <url> --data=data.json
bap recipe wait-for <selector> [--timeout=ms]
```

### Configuration

```bash
bap config                  # View all settings
bap config browser firefox  # Set default browser
bap config headless false   # Disable headless mode
bap install-skill           # Install skill to detected AI agents
bap skill init              # Install skill to current project
```

## Selectors

| Selector | Example | When to use |
|----------|---------|-------------|
| `e<N>` | `e15` | From snapshot refs (playwright-cli compatible) |
| `role:<role>:"<name>"` | `role:button:"Submit"` | By ARIA role and name |
| `text:"<content>"` | `text:"Sign in"` | By visible text |
| `label:"<text>"` | `label:"Email"` | Form fields by label |
| `placeholder:"<text>"` | `placeholder:"Search..."` | By placeholder text |
| `testid:"<id>"` | `testid:"submit-btn"` | By data-testid |
| `css:<selector>` | `css:.btn-primary` | CSS selector |
| `xpath:<path>` | `xpath://button` | XPath selector |
| `coords:<x>,<y>` | `coords:100,200` | By coordinates |

## Global Options

```
-s=<name>              Named session
-p, --port <N>         Server port (default: 9222)
-b, --browser <name>   Browser: chrome, firefox, webkit, edge
--headless             Headless mode (default)
--no-headless          Show browser window
-v, --verbose          Verbose output
```

## Architecture

BAP CLI communicates with a BAP Playwright server over WebSocket:

```
bap <command>
    ↕ WebSocket (JSON-RPC 2.0)
BAP Playwright Server (auto-started as background daemon)
    ↕ Playwright
Browser (Chromium / Firefox / WebKit)
```

The server starts automatically on first use and persists across commands. Use `bap close-all` to stop it.

## Output

Commands produce concise, AI-agent-friendly output:

```
### Page
- URL: https://example.com/dashboard
- Title: Dashboard
### Snapshot
[Snapshot](.bap/snapshot-2026-02-16T19-30-42.yml)
```

Files are saved to `.bap/` in the current directory:
- Snapshots: `.bap/snapshot-<timestamp>.yml`
- Screenshots: `.bap/screenshot-<timestamp>.png`
- Extractions: `.bap/extraction-<timestamp>.json`

## AI Agent Integration

BAP CLI includes a SKILL.md file that teaches AI coding agents how to use it effectively. Install it to your agent:

```bash
bap install-skill           # Auto-detect and install to all agents
bap install-skill --dry-run # Preview what would be installed
```

Supports 13 AI coding agent platforms: Claude Code, Codex CLI, Gemini CLI, Cursor, GitHub Copilot, Windsurf, Roo Code, Amp, Deep Agents, OpenCode, and more.

## Migrating from playwright-cli

BAP is a drop-in replacement for playwright-cli. All `e<N>` refs from snapshots work identically:

| playwright-cli | bap |
|----------------|-----|
| `playwright-cli open [url]` | `bap open [url]` |
| `playwright-cli click e15` | `bap click e15` |
| `playwright-cli fill e5 "text"` | `bap fill e5 "text"` |
| `playwright-cli snapshot` | `bap snapshot` |
| `playwright-cli screenshot` | `bap screenshot` |

BAP adds composite actions, semantic selectors, smart observation, and structured extraction on top.

## Requirements

- Node.js >= 20.0.0
- Playwright browsers (`npx playwright install chromium`)

## License

Apache-2.0
