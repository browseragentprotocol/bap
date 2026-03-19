# Migrating from playwright-cli to BAP

## Command Resolution

Choose the BAP command form based on where you are running it:

```bash
# Inside the bap repo
pnpm exec bap open https://example.com

# Global install
bap open https://example.com

# Published npm package only
npx @browseragentprotocol/cli open https://example.com
```

For local development inside this repo, prefer `pnpm exec bap`.
Use `npx @browseragentprotocol/cli` only when you intentionally want the
published npm package rather than the local branch.

## Command Mapping

| playwright-cli | bap | Notes |
|----------------|-----|-------|
| `playwright-cli open [url]` | `bap open [url]` | Identical |
| `playwright-cli goto <url>` | `bap goto <url>` | Identical |
| `playwright-cli click e15` | `bap click e15` | Compatibility path — BAP still accepts `e<N>` refs |
| `playwright-cli fill e5 "text"` | `bap fill e5 "text"` | Identical |
| `playwright-cli type "text"` | `bap type "text"` | Identical |
| `playwright-cli press Enter` | `bap press Enter` | Identical |
| `playwright-cli snapshot` | `bap snapshot` | Same YAML format |
| `playwright-cli screenshot` | `bap screenshot` | Same PNG output |
| `playwright-cli close` | `bap close` | Identical |
| `playwright-cli go-back` | `bap back` | Shortened |
| `playwright-cli go-forward` | `bap forward` | Shortened |
| `playwright-cli session-list` | `bap sessions` | Shortened |
| `playwright-cli -s=n cmd` | `bap -s=n cmd` | Identical |
| `playwright-cli tab-list` | `bap tabs` | Shortened |
| `playwright-cli eval "js"` | `bap eval "js"` | Identical |

In the examples below, `bap` is shorthand for whichever invocation form you
picked above.

## What BAP Adds

### Composite Actions
```bash
# playwright-cli: 3 commands, 3 snapshots, 3 LLM reasoning cycles
playwright-cli fill e5 "user@example.com"
playwright-cli fill e8 "password123"
playwright-cli click e12

# bap: 1 command, 1 snapshot, 1 LLM reasoning cycle
bap act fill:e5="user@example.com" fill:e8="password123" click:e12
```

### Semantic Selectors
```bash
# playwright-cli: must use snapshot refs (break if page changes)
playwright-cli click e15

# bap: use semantic selectors when the target is obvious
bap click role:button:"Submit"
bap fill label:"Email" "user@example.com"
bap click text:"Sign in"

# or use the exact stable ref returned by `bap observe`
bap observe --max=10
# ...
# @ep44e3j a "Learn more"
bap click @ep44e3j
```

Prefer the exact `@ref` returned by `bap observe` over manually stripping the
prefix or guessing an `e<N>` ref.

### Structured Extraction
```bash
# playwright-cli: write JavaScript, parse output manually
playwright-cli eval "JSON.stringify({title: document.querySelector('h1').textContent})"

# bap: declare what you want, get validated JSON
bap extract --fields="title,price,rating"
```

### Smart Observation
```bash
# playwright-cli: full accessibility tree (thousands of tokens)
playwright-cli snapshot

# bap: curated interactive elements only (dozens of tokens)
bap observe --max=30
bap observe --forms    # just form fields
```

### Local-First Development
```bash
# Use the local branch build inside this repo
pnpm exec bap goto https://example.com --observe

# Avoid this for local branch testing unless you explicitly want npm latest
npx @browseragentprotocol/cli goto https://example.com --observe
```

## Output Directory

- playwright-cli: `.playwright-cli/`
- bap: `.bap/`

Both use the same snapshot YAML format, so existing snapshot-parsing logic works with both.
