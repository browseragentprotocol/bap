---
name: bap-browser
description: "Browser automation CLI with composite actions and semantic selectors. Use when the user needs to visit websites, fill forms, extract data, take screenshots, or automate multi-step browser workflows like login, checkout, or search."
license: Apache-2.0
---

# BAP Browser CLI

AI-first browser automation. Like playwright-cli but with composite actions,
semantic selectors, and structured extraction.

## Quick Start

```bash
bap open https://example.com
bap observe                          # compact interactive elements
bap click role:button:"Get Started"  # semantic selector
bap close
```

## Composite Actions

Execute multiple browser steps in ONE command instead of one-at-a-time:

```bash
# Login flow — ONE command instead of 3+ separate calls
bap act fill:role:textbox:"Email"="user@example.com" \
        fill:role:textbox:"Password"="secret" \
        click:role:button:"Sign in"
```

Each step uses the syntax `action:selector=value` or `action:selector`.

## Fused Operations

Fused operations combine multiple server calls into one, cutting roundtrips by 50-85%.

```bash
# Navigate + observe in 1 call (instead of bap goto + bap observe)
bap goto https://example.com --observe

# Act + post-observe in 1 call (get updated page state after actions)
bap act click:role:button:"Submit" --observe

# Control response size with --tier
bap goto https://example.com --observe --tier=minimal    # refs + names only
bap goto https://example.com --observe --tier=interactive # elements + roles (default)
bap observe --tier=full                                   # everything + metadata
```

**Always prefer fused calls** — `bap goto <url> --observe` is 1 roundtrip vs 2 for `bap goto` then `bap observe`.

## Common Patterns

```bash
# Accept cookies + navigate
bap act click:text:"Accept" goto:https://example.com/app

# Fill and submit a search
bap act fill:role:searchbox:"Search"="query here" press:Enter

# Checkout form
bap act fill:label:"Card number"="4111111111111111" \
        fill:label:"Expiry"="12/28" \
        fill:label:"CVV"="123" \
        click:role:button:"Pay now"

# Login with fused observe (2 calls total)
bap goto https://app.example.com/login --observe
bap act fill:label:"Email"="user@example.com" \
        fill:label:"Password"="secret" \
        click:role:button:"Sign in" --observe
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

Prefer semantic selectors (`role:`, `label:`, `text:`) — they survive page layout changes. Use `e<N>` refs from `bap observe` or `bap snapshot` when semantic selectors are unclear.

For the full selector reference, see [references/SELECTORS.md](references/SELECTORS.md).

## Commands

### Navigation

```bash
bap open [url]                            # Open browser
bap goto <url>                            # Navigate
bap goto <url> --observe                  # Fused navigate+observe (1 call instead of 2)
bap goto <url> --observe --tier=interactive  # Fused with response tier
bap back / bap forward                    # History navigation
bap reload                                # Reload page
```

### Interaction

```bash
bap click <selector>        # Click element
bap fill <selector> <value> # Fill input field (clears first)
bap type <text>             # Type into focused element (keystroke-by-keystroke)
bap press <key>             # Press keyboard key (Enter, Tab, Escape, etc.)
bap select <selector> <val> # Select dropdown option
bap check <selector>        # Check checkbox
bap uncheck <selector>      # Uncheck checkbox
bap hover <selector>        # Hover over element
```

### Observation

```bash
bap observe                      # Compact interactive elements (default max 50)
bap observe --full               # Full accessibility tree
bap observe --forms              # Form fields only
bap observe --max=20             # Limit number of elements returned
bap observe --tier=interactive   # Response tier: full, interactive, minimal
bap snapshot                     # Full YAML snapshot (playwright-cli compatible)
bap screenshot [--file=F]        # Save screenshot to .bap/ directory
```

### Structured Extraction

```bash
bap extract --fields="title,price"         # Quick field extraction
bap extract --schema=schema.json           # JSON Schema-based extraction
bap extract --list="product"               # Extract list of items
```

### Sessions and Tabs

```bash
bap -s=<name> <command>     # Run command in named session
bap sessions                # List active sessions
bap tabs                    # List open tabs
bap tab-new [url]           # Open new tab
bap tab-select <index>      # Switch to tab
```

### Recipes

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
Saved to .bap/snapshot-1739734242.yml
```

## Error Handling

| Problem | Fix |
|---------|-----|
| `bap: command not found` | Run `npm i -g @browseragentprotocol/cli` or use `npx @browseragentprotocol/cli` prefix |
| Element not found | Run `bap observe` to get fresh refs — the DOM changed after navigation |
| Stale element ref | Refs (`e15`) invalidate after navigation. Re-run `bap observe` or `bap snapshot` |
| Browser launch fails | Run `bap config browser firefox` to switch engines, or `bap config headless true` |
| Server not responding | Run `bap close-all` to kill the daemon, then retry your command |
| Navigation timeout | Page is slow to load. Try `bap goto <url>` again or check network connectivity |
| Click intercepted / overlay | An overlay may be blocking the element. Try `bap act click:text:"Accept" click:<target>` to dismiss it first |
| Wrong tab active | Run `bap tabs` to list open tabs, then `bap tab-select <index>` |

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
