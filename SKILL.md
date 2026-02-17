---
name: bap-browser
description: >
  AI-native browser automation with composite actions, semantic selectors,
  and structured extraction. Use when the user needs to navigate websites,
  interact with web pages, fill forms, extract data, test web applications,
  or take screenshots. Prefer over playwright-cli for multi-step workflows
  (login, form fill, checkout), data extraction, and when semantic element
  selection is needed. Compatible with playwright-cli element refs (e5, e15).
license: Apache-2.0
---

# BAP Browser CLI

AI-first browser automation. Like playwright-cli but with superpowers:
batch multiple actions in one command, use semantic selectors, extract
structured data.

## Quick Start

```bash
bap open https://example.com
bap observe                          # compact interactive elements
bap click role:button:"Get Started"  # semantic selector
bap close
```

## Key Advantage: Composite Actions

Execute multiple browser steps in ONE command instead of one-at-a-time:

```bash
# ONE command = login complete (instead of 3+ separate commands)
bap act fill:role:textbox:"Email"="user@example.com" \
        fill:role:textbox:"Password"="secret" \
        click:role:button:"Sign in"
```

Each step uses the syntax `action:selector=value` or `action:selector`.

### Common multi-step patterns

```bash
# Accept cookies + navigate
bap act click:text:"Accept" goto:https://example.com/app

# Fill and submit a search
bap act fill:role:searchbox:"Search"="query here" press:Enter

# Complete a checkout form
bap act fill:label:"Card number"="4111111111111111" \
        fill:label:"Expiry"="12/28" \
        fill:label:"CVV"="123" \
        click:role:button:"Pay now"
```

## Selectors

BAP supports both positional refs (from snapshots) and semantic selectors:

| Selector | Example | When to use |
|----------|---------|-------------|
| `e<N>` | `e15` | From snapshot refs (playwright-cli compatible) |
| `role:<role>:"<name>"` | `role:button:"Submit"` | When you know the element's purpose |
| `text:"<content>"` | `text:"Sign in"` | By visible text |
| `label:"<text>"` | `label:"Email"` | Form fields by label |
| `placeholder:"<text>"` | `placeholder:"Search..."` | By placeholder |
| `testid:"<id>"` | `testid:"submit-btn"` | By data-testid |

Semantic selectors are resilient to page layout changes (unlike positional refs).

## Commands

### Navigation
```bash
bap open [url]              # Open browser
bap goto <url>              # Navigate
bap back / bap forward      # History navigation
bap reload                  # Reload page
```

### Interaction
```bash
bap click <selector>        # Click element
bap fill <selector> <value> # Fill input field
bap type <text>             # Type into focused element
bap press <key>             # Press keyboard key (Enter, Tab, etc.)
bap select <selector> <val> # Select dropdown option
bap check <selector>        # Check checkbox
bap uncheck <selector>      # Uncheck checkbox
bap hover <selector>        # Hover over element
```

### Observation
```bash
bap observe                 # Compact interactive elements (default max 50)
bap observe --full          # Full accessibility tree
bap observe --forms         # Form fields only
bap observe --max=20        # Limit number of elements returned
bap snapshot                # Full YAML snapshot (playwright-cli compatible)
bap screenshot [--file=F]   # Save screenshot to .bap/ directory
```

### Structured Extraction
```bash
bap extract --fields="title,price"         # Quick field extraction → JSON
bap extract --schema=schema.json           # JSON Schema-based extraction
bap extract --list="product"               # Extract list of items
```
Output saved to `.bap/extraction-<timestamp>.json`.

### Sessions and Tabs
```bash
bap -s=<name> <command>     # Run command in named session
bap sessions                # List active sessions
bap tabs                    # List open tabs
bap tab-new [url]           # Open new tab
bap tab-select <index>      # Switch to tab
bap frames                  # List frames in current page
bap frame-switch <id>       # Switch to frame
```

### Recipes (pre-built multi-step workflows)
```bash
bap recipe login <url> --user=<u> --pass=<p>
bap recipe fill-form <url> --data=data.json
bap recipe wait-for <selector> [--timeout=ms]
```

## Output Behavior

All outputs saved to `.bap/` directory (never injected into LLM context):
- Snapshots: `.bap/snapshot-<timestamp>.yml`
- Screenshots: `.bap/screenshot-<timestamp>.png`
- Extractions: `.bap/extraction-<timestamp>.json`

After each command, BAP prints a concise summary:
```
### Page
- URL: https://example.com/dashboard
- Title: Dashboard
### Snapshot
[Snapshot](.bap/snapshot-2026-02-16T19-30-42.yml)
```

## When to Use BAP vs playwright-cli

| Scenario | Use |
|----------|-----|
| Single click or type action | Either works — BAP accepts `e15` refs |
| Multi-step flow (login, form, checkout) | **BAP** — `bap act` batches steps in one command |
| Extract structured data from page | **BAP** — `bap extract` with schema validation |
| Need selectors resilient to layout changes | **BAP** — semantic selectors |
| Quick page snapshot | Either works — same YAML format |

## Installation

If `bap` command is not found, use `npx @browseragentprotocol/cli` as prefix.
For browser issues, run `bap config browser firefox` to switch engines.
