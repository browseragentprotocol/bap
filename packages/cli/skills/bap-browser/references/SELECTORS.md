# BAP Semantic Selectors Reference

## Overview

BAP supports three selector styles:
- stable refs returned by `bap observe`
- positional refs from snapshot-style workflows
- semantic selectors

Semantic selectors describe elements by their purpose, not their position.
They survive page layout changes, dynamic content updates, and A/B tests.

## Selector Types

### Stable Refs
```
@ep44e3j     → Stable ref returned by `bap observe`
@submitBtn   → Named stable ref
```

Use the exact ref that BAP prints, including the leading `@`.

### Positional Refs (Compatibility)
```
e15          → Element ref from last snapshot (playwright-cli compatible)
```

`e<N>` refs are useful for playwright-cli compatibility, but current `bap observe`
commonly returns stable refs such as `@ep44e3j`.

### Role Selector
```
role:button:"Submit"
role:textbox:"Email"
role:link:"Home"
role:heading:"Welcome"
role:checkbox:"Remember me"
role:combobox:"Country"
role:searchbox:"Search"
role:listitem:"Item 1"
```
Uses ARIA roles. Most reliable for interactive elements.

### Text Selector
```
text:"Sign in"
text:"Add to cart"
text:"Next page"
```
Matches by visible text content. Case-sensitive exact match.

### Label Selector
```
label:"Email address"
label:"Password"
label:"First name"
```
Matches form inputs by their associated `<label>` text. Best for forms.

### Placeholder Selector
```
placeholder:"Enter your email..."
placeholder:"Search products"
```
Matches inputs by placeholder attribute.

### Test ID Selector
```
testid:"submit-btn"
testid:"login-form"
testid:"product-card"
```
Matches by `data-testid` attribute. Most stable for apps that use test IDs.

## Using Selectors in Commands

### Single commands
```bash
bap click role:button:"Submit"
bap fill label:"Email" "user@example.com"
bap hover text:"Learn more"
bap click @ep44e3j
```

### In composite actions (`bap act`)
```bash
bap act fill:label:"Email"="user@example.com" \
        fill:label:"Password"="secret123" \
        click:role:button:"Sign in"
```

Step syntax: `action:selector=value` (for fill/type) or `action:selector` (for click/check).

## Selector Precedence

When multiple elements match, BAP returns the first visible, interactive match.
To disambiguate, combine with more specific roles or use the exact stable ref
returned by `bap observe`.

## Fallback Behavior

If a semantic selector doesn't match, BAP returns a clear error message
with the closest matches found on the page, helping the agent self-correct.

## Best Practice

1. Start with semantic selectors when the target is obvious.
2. If the page is noisy, run `bap observe --max=<N>`.
3. Reuse the exact `@ref` from the observation output for precise clicks.
