---
name: bap-browser
description: "AI-optimized browser automation via Browser Agent Protocol (BAP). Use when the user wants to browse websites, scrape web content, automate browser interactions, fill out web forms, extract structured data from pages, take screenshots, or test web applications. Provides semantic selectors, batched multi-step actions, and structured data extraction. Triggers: navigate, click, fill, type, observe, act, extract, screenshot, aria_snapshot, content, scroll, hover, press, select, element, pages, activate_page, close_page, go_back, go_forward, reload, accessibility."
license: See LICENSE.txt (Apache-2.0)
---

# BAP Browser Automation

You have BAP (Browser Agent Protocol) tools available. BAP wraps a real browser and exposes it through semantic, AI-native APIs. This document defines how to use them well.

## Quick Start

For most browser tasks, you only need three tools:

1. **`navigate`** — open a URL
2. **`observe`** — see what's on the page (returns interactive elements with stable refs)
3. **`act`** — batch multiple interactions into a single call

```
navigate({ url: "https://example.com/login" })
observe({ includeScreenshot: true })
act({
  steps: [
    { action: "action/fill", selector: "@e1", value: "user@example.com" },
    { action: "action/fill", selector: "@e2", value: "password123" },
    { action: "action/click", selector: "role:button:Sign in" }
  ]
})
```

Read on for the full tool reference, selector guide, and advanced patterns.

## Decision: Which Tool?

**I need to open a page** → `navigate`

**I need to understand what's on the page:**
- I want interactive elements with stable refs → `observe` (set `includeScreenshot: true` for visual context)
- I want the page structure cheaply → `aria_snapshot` (preferred — ~80% fewer tokens than `accessibility`)
- I want to read article/body text → `content` with `format: "markdown"`
- I want a visual capture → `screenshot`

**I need to interact with something:**
- Single click → `click`
- Fill a form field (replaces content) → `fill`
- Type character-by-character (autocomplete, search-as-you-type) → `type`
- Press Enter/Tab/Escape/keyboard shortcut → `press`
- Select from dropdown → `select`
- Scroll to reveal more → `scroll`
- Trigger hover menu → `hover`

**I need to do multiple things at once** → `act` (batch 2–50 steps, single round-trip)

**I need structured data from the page** → `extract` (give it a JSON schema)

**I need to check an element's state** → `element` (visible? enabled? checked? value?)

**I need to manage tabs** → `pages` / `activate_page` / `close_page`

**I need to go back/forward/reload** → `go_back` / `go_forward` / `reload`

## Selectors

Every interaction tool takes a `selector` parameter. Use this priority:

```
role:button:Submit        ← Best. ARIA role + accessible name. Survives redesigns.
text:Sign in              ← Visible text content.
label:Email address       ← Form label association.
placeholder:Search...     ← Input placeholder text.
testId:submit-btn         ← data-testid attribute.
ref:@e3  (or just @e3)   ← Stable ref from a prior observe call.
css:.btn-primary          ← Last resort. Fragile.
#element-id               ← Shorthand for CSS ID selector.
```

**Rules:**
- Always prefer `role:` for buttons, links, inputs, checkboxes. They survive DOM changes.
- Use `text:` when there's no clear ARIA role.
- Never copy CSS selectors from page source. They break across deployments.
- If you don't know what selectors are available, call `observe` first and use the returned refs.

## The Observe → Act Pattern

For any multi-step interaction on a page you haven't seen yet:

**Step 1: Observe.**
```
observe({ includeScreenshot: true, maxElements: 30 })
```
Returns interactive elements with stable refs (`@e1`, `@e2`, ...) and optional annotated screenshot. Now you know exactly what's on the page.

**Step 2: Act.**
Batch all your actions into one call:
```
act({
  steps: [
    { action: "action/fill", selector: "@e1", value: "user@example.com" },
    { action: "action/fill", selector: "@e2", value: "hunter2" },
    { action: "action/click", selector: "role:button:Sign in" }
  ]
})
```

This pattern turns 4+ round-trips into 2. Use it.

## Efficiency Rules

1. **`aria_snapshot` over `accessibility`.** Same structure, ~80% fewer tokens.
2. **`observe` with `maxElements`.** Default is 50. Set it lower when you can: `maxElements: 20`.
3. **`observe` with `filterRoles`.** Focus: `filterRoles: ["button", "link", "textbox"]`.
4. **`act` over individual calls.** A login flow is 1 `act`, not 3 separate fill/click calls.
5. **`extract` over manual parsing.** Define a JSON schema. Let BAP extract. Don't scrape HTML.
6. **`content({ format: "markdown" })` over screenshots for text.** Markdown is compact and parseable.
7. **`fill` over `type` for form fields.** `fill` clears and sets; `type` sends keystrokes one at a time.

## Recipes

### Login
```
act({
  steps: [
    { action: "page/navigate", url: "https://app.example.com/login" },
    { action: "action/fill", selector: "label:Email", value: "user@example.com" },
    { action: "action/fill", selector: "label:Password", value: "password123" },
    { action: "action/click", selector: "role:button:Sign in" }
  ]
})
```

### Extract a table of data
```
navigate({ url: "https://store.example.com/products" })
extract({
  instruction: "Extract product listings",
  mode: "list",
  schema: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        price: { type: "number" },
        inStock: { type: "boolean" }
      }
    }
  }
})
```

### Read an article
```
navigate({ url: "https://blog.example.com/post", waitUntil: "networkidle" })
content({ format: "markdown" })
```

### Complex form with observe
```
observe({ filterRoles: ["textbox", "combobox", "checkbox"] })
act({
  steps: [
    { action: "action/fill", selector: "@e1", value: "Jane Doe" },
    { action: "action/fill", selector: "@e2", value: "jane@example.com" },
    { action: "action/select", selector: "@e3", value: "Canada" },
    { action: "action/check", selector: "@e4" },
    { action: "action/click", selector: "role:button:Submit" }
  ]
})
```

### Search with autocomplete
```
type({ selector: "role:combobox:Search", text: "browser agent", delay: 100 })
press({ key: "ArrowDown" })
press({ key: "Enter" })
```

## Error Recovery

| Problem | Fix |
|---------|-----|
| Element not found | `observe` the page again — the DOM changed. Use fresh refs. |
| Navigation timeout | Use `waitUntil: "domcontentloaded"` instead of `"networkidle"`. |
| Stale ref | Refs persist within a page but invalidate after navigation. Re-observe. |
| Click intercepted | `scroll` to the element first, or use `press({ key: "Enter", selector: "..." })`. |
| Page loaded but blank | Wait, then `reload`. Some SPAs hydrate slowly. |

## Do Not

- Use CSS selectors copied from browser DevTools. They break.
- Call `accessibility` when `aria_snapshot` works. Wastes tokens.
- Make individual click/fill calls when `act` can batch them.
- Take a screenshot to read text. Use `content({ format: "markdown" })`.
- Skip `observe` on pages you haven't seen. You'll guess wrong.
- Parse raw HTML. Use `extract` with a schema.

---

## Advanced

### Multi-tab workflows

Use `pages` to list all open tabs, `activate_page` to switch between them, and `close_page` to clean up. Useful for comparing content across tabs or handling pop-ups.

```
navigate({ url: "https://a.example.com" })
navigate({ url: "https://b.example.com" })   // opens in new tab
pages()                                        // returns [{id, url}, ...]
activate_page({ pageId: "page-1" })           // switch back to first tab
```

### Waiting strategies

The `waitUntil` parameter on `navigate` controls when the page is considered loaded:

| Value | When to use |
|-------|-------------|
| `"load"` | Default. Fine for most pages. |
| `"domcontentloaded"` | Faster. Use when you don't need images/fonts. |
| `"networkidle"` | Slowest but most complete. Use for SPAs that fetch data after load. |

If a page renders dynamically after navigation, use `observe` or `aria_snapshot` with a short delay rather than relying on `networkidle`.

### Annotated screenshots (Set-of-Marks)

`observe` supports `annotateScreenshot: true` which overlays numbered markers on each interactive element. Useful for visual debugging or confirming which element a ref points to.

```
observe({ includeScreenshot: true, annotateScreenshot: true, maxElements: 20 })
```

The returned screenshot will have numbered badges corresponding to element refs.

### Nested extraction with complex schemas

`extract` supports deeply nested JSON schemas. Use `mode: "single"` for a single object, `mode: "list"` for arrays, or `mode: "table"` for tabular data.

```
extract({
  instruction: "Extract job listings with company details",
  mode: "list",
  schema: {
    type: "array",
    items: {
      type: "object",
      properties: {
        title: { type: "string" },
        company: {
          type: "object",
          properties: {
            name: { type: "string" },
            location: { type: "string" }
          }
        },
        salary: { type: "number" },
        remote: { type: "boolean" }
      }
    }
  }
})
```

### Error handling in batched actions

`act` accepts `stopOnFirstError` (default: `true`). Set to `false` if you want to continue executing steps even when one fails — useful for best-effort form fills where some fields may not exist.

```
act({
  stopOnFirstError: false,
  steps: [
    { action: "action/fill", selector: "label:First name", value: "Jane" },
    { action: "action/fill", selector: "label:Middle name", value: "A." },  // may not exist
    { action: "action/fill", selector: "label:Last name", value: "Doe" }
  ]
})
```
