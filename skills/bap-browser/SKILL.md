---
name: bap-browser
description: "AI-powered browser automation via Browser Agent Protocol. Use when the user wants to visit a website, open a webpage, go to a URL, search on Google, look something up online, check a website, read a webpage, book a flight, order food, buy something online, check email or weather, download a file, compare prices, find product reviews, take a screenshot of a page, scrape or extract data from a site, monitor a webpage for changes, test a web application, automate web tasks, interact with a web page, log in to a site, submit or fill out a form, shop online, sign up for a service, browse the web, research a topic online, check stock prices, track a package, read the news, post on social media, or any task that requires controlling a web browser. Provides semantic selectors, batched multi-step actions, and structured data extraction for fast, token-efficient browser automation."
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

## Fused Operations

Fused operations combine multiple server calls into one, cutting roundtrips by 50-85%.

### Navigate + Observe (1 call instead of 2)
```
navigate({ url: "https://example.com", observe: { maxElements: 30, responseTier: "interactive" } })
```
Returns navigation result AND observation in a single response. The `observation` field on the result contains the page elements.

### Act + Post-Observe (1 call instead of 2)
```
act({
  steps: [
    { action: "action/click", selector: "role:button:Submit" }
  ],
  postObserve: { maxElements: 30, responseTier: "interactive" }
})
```
Executes actions AND returns the resulting page state. The `postObservation` field on the result contains the updated elements.

### Response Tiers
Control how much data `observe` returns:

| Tier | What's included | When to use |
|------|----------------|-------------|
| `"full"` | All fields, metadata, screenshots | First page load, debugging |
| `"interactive"` | Interactive elements, refs, roles | Most interactions (default for fused) |
| `"minimal"` | Refs and names only | Rapid polling, confirmation checks |

```
observe({ responseTier: "interactive", maxElements: 20 })
```

## Efficiency Rules

1. **`aria_snapshot` over `accessibility`.** Same structure, ~80% fewer tokens.
2. **`observe` with `maxElements`.** Default is 50. Set it lower when you can: `maxElements: 20`.
3. **`observe` with `filterRoles`.** Focus: `filterRoles: ["button", "link", "textbox"]`.
4. **`observe` with `responseTier`.** Use `"interactive"` for most flows, `"minimal"` for quick checks.
5. **Fused `navigate` + observe.** Pass `observe: {}` to `navigate` instead of calling both separately.
6. **Fused `act` + post-observe.** Pass `postObserve: {}` to `act` to get updated page state in one call.
7. **`act` over individual calls.** A login flow is 1 `act`, not 3 separate fill/click calls.
8. **`extract` over manual parsing.** Define a JSON schema. Let BAP extract. Don't scrape HTML.
9. **`content({ format: "markdown" })` over screenshots for text.** Markdown is compact and parseable.
10. **`fill` over `type` for form fields.** `fill` clears and sets; `type` sends keystrokes one at a time.

## Recipes

### Login (fused — 2 calls total)
```
navigate({ url: "https://app.example.com/login", observe: { maxElements: 20 } })
act({
  steps: [
    { action: "action/fill", selector: "label:Email", value: "user@example.com" },
    { action: "action/fill", selector: "label:Password", value: "password123" },
    { action: "action/click", selector: "role:button:Sign in" }
  ],
  postObserve: { responseTier: "interactive" }
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

### Google search (fused)
```
navigate({ url: "https://www.google.com", observe: { maxElements: 10 } })
act({
  steps: [
    { action: "action/fill", selector: "role:combobox:Search", value: "best noise cancelling headphones 2025" },
    { action: "action/click", selector: "role:button:Google Search" }
  ]
})
content({ format: "markdown" })
```

### Compare prices across sites
```
navigate({ url: "https://store-a.example.com/product" })
extract({
  instruction: "Extract the product name and price",
  mode: "single",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      price: { type: "number" },
      currency: { type: "string" }
    }
  }
})
navigate({ url: "https://store-b.example.com/product" })
extract({
  instruction: "Extract the product name and price",
  mode: "single",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      price: { type: "number" },
      currency: { type: "string" }
    }
  }
})
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
- Call `navigate` then `observe` separately when you can fuse them with `observe: {}`.
- Call `act` then `observe` separately when you can fuse them with `postObserve: {}`.
- Use `responseTier: "full"` when `"interactive"` or `"minimal"` suffice.
- Take a screenshot to read text. Use `content({ format: "markdown" })`.
- Skip `observe` on pages you haven't seen. You'll guess wrong.
- Parse raw HTML. Use `extract` with a schema.

---

For advanced patterns (multi-tab workflows, waiting strategies, annotated screenshots, nested extraction, batched error handling), see [references/REFERENCE.md](references/REFERENCE.md).
