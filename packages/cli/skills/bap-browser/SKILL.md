---
name: bap-browser
description: "Browser automation CLI with composite actions, semantic selectors, and self-healing selectors. Use when the user needs to visit websites, fill forms, extract data, take screenshots, stream browser events, or automate multi-step browser workflows like login, checkout, or search."
license: Apache-2.0
contract:
  kind: browser-agent
  version: 1
  runtime:
    interfaces:
      - cli
    tools:
      - navigate
      - go_back
      - go_forward
      - reload
      - observe
      - screenshot
      - aria_snapshot
      - content
      - act
      - extract
      - pages
      - activate_page
      - close_page
    actionClasses:
      - navigate
      - observe
      - click
      - fill
      - type
      - press
      - hover
      - scroll
      - select
      - extract
    domainPolicy:
      mode: report
    approval:
      policy: manual
      requiredFor:
        - checkout
        - purchase
        - delete
        - upload
        - submit
    artifacts:
      outputs:
        - trace-jsonl
        - trace-replay-html
        - json-extraction
        - screenshot
      sensitivity: moderate
      retention: session
      redaction:
        - cookies
        - auth-tokens
        - passwords
  provenance:
    formats:
      - bap-trace-jsonl
    replay:
      supported: true
      determinism: best-effort
      validator: bap trace --replay
  grounding:
    observation:
      models:
        - interactive-elements
        - incremental-changes
        - screenshot-observation
    identity:
      mechanisms:
        - stable-ref
        - semantic-selector
        - selector-fallback
      stableRefs: true
    abstention:
      supported: false
      reasons:
        - delegated-to-caller
  extensions:
    cliAliases:
      navigate: goto
      go_back: back
      go_forward: forward
      pages: tabs
      activate_page: tab-select
---

# BAP Browser CLI

AI-first browser automation. Like playwright-cli but with composite actions,
semantic selectors, self-healing selectors, and action caching built in.

## Quick Start

```bash
bap demo                                    # Guided walkthrough for first-time users
bap goto https://example.com --observe      # Navigate + observe in 1 fused call
bap click role:button:"Get Started"         # Semantic selector
bap close
```

Inside this repo, use `pnpm exec bap` instead of bare `bap`. Prefer `bap goto` for navigation; use `bap open` only for explicit browser lifecycle control.

## Smart Defaults

**Session persistence** — Browser pages persist across CLI invocations. Disconnect parks context; reconnect restores it. Named sessions: `bap -s=checkout goto /cart`. Auto-expire after 5 minutes.

**Self-healing selectors** — When a selector fails, BAP tries fallback identity signals (testId, ariaLabel+role, id, name) before erroring. No flags needed.

**Action caching** — Selector resolutions cached to `~/.bap/cache/actions/` (24h TTL). Repeat actions skip re-resolution.

## Usage

**Composite actions** — multiple steps in ONE command:

```bash
bap act fill:role:textbox:"Email"="user@example.com" \
        fill:role:textbox:"Password"="secret" \
        click:role:button:"Sign in"
```

Step syntax: `action:selector=value` or `action:selector`.

**Fused operations** — combine server calls into one, cutting roundtrips:

```bash
bap goto https://example.com --observe          # Navigate + observe (1 call, not 2)
bap act click:role:button:"Submit" --observe    # Act + post-observe (1 call)
bap observe --diff                               # Incremental: only changes
bap observe --tier=minimal                       # Minimal response (refs + names only)
```

**Always prefer fused calls.** `--observe` saves a roundtrip. `--diff` avoids re-scanning unchanged elements. `--tier=minimal` reduces response size.

**Common patterns:**

```bash
bap act click:text:"Accept" goto:https://example.com/app          # Dismiss + navigate
bap act fill:role:searchbox:"Search"="query" press:Enter           # Search
bap goto https://app.example.com/login --observe                   # Login flow (2 calls)
bap act fill:label:"Email"="u@e.com" fill:label:"Password"="s" \
        click:role:button:"Sign in" --observe
```

## Selectors

BAP supports stable refs, positional refs, and semantic selectors:

| Selector               | Example                   | When to use                                    |
| ---------------------- | ------------------------- | ---------------------------------------------- |
| `@<ref>`               | `@ep44e3j`                | Exact stable ref returned by `bap observe`     |
| `e<N>`                 | `e15`                     | From snapshot refs (playwright-cli compatible) |
| `role:<role>:"<name>"` | `role:button:"Submit"`    | When you know the element's purpose            |
| `text:"<content>"`     | `text:"Sign in"`          | By visible text                                |
| `label:"<text>"`       | `label:"Email"`           | Form fields by label                           |
| `placeholder:"<text>"` | `placeholder:"Search..."` | By placeholder                                 |
| `testid:"<id>"`        | `testid:"submit-btn"`     | By data-testid                                 |

Prefer semantic selectors (`role:`, `label:`, `text:`) when they are clear — they survive page layout changes. When using `bap observe`, reuse the exact ref it prints, including the leading `@`.

```bash
pnpm exec bap observe --max=10
# ...
# @ep44e3j a "Learn more"

pnpm exec bap click @ep44e3j
```

Do not strip the `@` prefix from stable refs. `bap click ep44e3j` is not the same as `bap click @ep44e3j`.

For the full selector reference, see [references/SELECTORS.md](references/SELECTORS.md).

## Commands (26)

### Navigation

```bash
bap open [url]                            # Browser lifecycle command
bap goto <url>                            # Recommended for "open this URL"
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
bap scroll [dir] [--pixels=N] # Scroll page (up/down/left/right, default: down 300px)
bap scroll <selector>       # Scroll element into view
```

### Observation

```bash
bap observe                      # Compact interactive elements (default max 50)
bap observe --full               # Full accessibility tree
bap observe --forms              # Form fields only
bap observe --max=20             # Limit number of elements returned
bap observe --diff               # Incremental: only changes since last observe
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

### Live Event Streaming

```bash
bap watch                             # Stream all browser events (console, network, dialog, download)
bap watch --filter=console             # Only console messages
bap watch --filter=network             # Only 4xx/5xx network responses
bap watch --filter=dialog              # Only dialog events (alert, confirm, prompt)
bap watch --filter=download            # Only download events
bap watch --format=json                # Machine-readable NDJSON output
```

### Tracing

```bash
bap trace                              # Show traces for current session
bap trace --sessions                   # List all recorded sessions
bap trace --all                        # Show all traces across sessions
bap trace --session=<id>               # Traces for a specific session
bap trace --replay                     # Generate self-contained HTML timeline viewer
bap trace --export                     # Export traces as JSON
bap trace --export-evidence=evidence.json  # Export normalized contract evidence
bap trace --limit=20                   # Limit number of trace entries shown
```

### Getting Started

```bash
bap demo                               # Guided walkthrough for first-time users
```

### Recipes

```bash
bap recipe login <url> --user=<u> --pass=<p>
bap recipe fill-form <url> --data=data.json
bap recipe wait-for <selector> [--timeout=ms]
```

## Reference

**Output formats:** Use `--format=pretty` (TTY default, colored), `--format=json` (machine-readable), or `--format=agent` (concise markdown). TTY auto-detects. All file outputs (snapshots, screenshots, extractions) saved to `.bap/` directory — never injected into LLM context.

**Error recovery — when things go wrong:**

| Problem                      | What to do                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `bap: command not found`     | Use `pnpm exec bap` inside repo. Outside, `npm i -g @browseragentprotocol/cli` |
| Element not found            | DOM changed. Run `bap observe` to get fresh element refs                       |
| Stale ref after navigation   | Always re-run `bap observe` or use `--observe` flag after page changes         |
| Stable ref click fails       | Use exact ref from `bap observe`, including the leading `@` prefix             |
| Browser launch fails         | Try `--no-profile` for fresh browser without profile conflicts                 |
| Server not responding        | `bap close-all` to kill daemon, then retry                                     |
| Navigation timeout           | `bap --timeout=120000 goto <url>` to increase timeout                          |
| Click intercepted by overlay | Dismiss first: `bap act click:text:"Accept" click:<target>`                    |
| Wrong tab active             | `bap tabs` to list, `bap tab-select <index>` to switch                         |

**Key rules for agents:**

1. Always use `--observe` with `goto` and `act` to avoid extra roundtrips
2. After navigation or DOM changes, re-run `bap observe` before clicking — refs go stale
3. Prefer semantic selectors (`role:`, `label:`, `text:`) over positional refs — they survive redesigns
4. Use `bap act` for multi-step flows instead of individual commands — fewer calls, fewer tokens
5. Use `--diff` for incremental observation after small DOM changes
6. Check `bap trace` when debugging failures — it records every request with timing
7. Use `bap trace --export-evidence=...` when you need normalized contract audit evidence for skill validation
