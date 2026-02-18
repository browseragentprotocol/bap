# Migrating from playwright-cli to BAP

## Command Mapping

| playwright-cli | bap | Notes |
|----------------|-----|-------|
| `playwright-cli open [url]` | `bap open [url]` | Identical |
| `playwright-cli goto <url>` | `bap goto <url>` | Identical |
| `playwright-cli click e15` | `bap click e15` | Identical — BAP accepts `e<N>` refs |
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

# bap: use semantic selectors (resilient to layout changes)
bap click role:button:"Submit"
bap fill label:"Email" "user@example.com"
bap click text:"Sign in"
```

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

## Output Directory

- playwright-cli: `.playwright-cli/`
- bap: `.bap/`

Both use the same snapshot YAML format, so existing snapshot-parsing logic works with both.
