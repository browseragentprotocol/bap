# Advanced BAP Patterns

## Multi-tab workflows

Use `pages` to list all open tabs, `activate_page` to switch between them, and `close_page` to clean up. Useful for comparing content across tabs or handling pop-ups.

```
navigate({ url: "https://a.example.com" })
navigate({ url: "https://b.example.com" })   // opens in new tab
pages()                                        // returns [{id, url}, ...]
activate_page({ pageId: "page-1" })           // switch back to first tab
```

## Waiting strategies

The `waitUntil` parameter on `navigate` controls when the page is considered loaded:

| Value | When to use |
|-------|-------------|
| `"load"` | Default. Fine for most pages. |
| `"domcontentloaded"` | Faster. Use when you don't need images/fonts. |
| `"networkidle"` | Slowest but most complete. Use for SPAs that fetch data after load. |

If a page renders dynamically after navigation, use `observe` or `aria_snapshot` with a short delay rather than relying on `networkidle`.

## Annotated screenshots (Set-of-Marks)

`observe` supports `annotateScreenshot: true` which overlays numbered markers on each interactive element. Useful for visual debugging or confirming which element a ref points to.

```
observe({ includeScreenshot: true, annotateScreenshot: true, maxElements: 20 })
```

The returned screenshot will have numbered badges corresponding to element refs.

## Nested extraction with complex schemas

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

## Error handling in batched actions

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
