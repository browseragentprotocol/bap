# @browseragentprotocol/protocol

Core types, schemas, and utilities for the Browser Agent Protocol (BAP).

## Installation

```bash
npm install @browseragentprotocol/protocol
```

> **Note:** Most users should install `@browseragentprotocol/client` instead, which re-exports everything from this package.

## Usage

```typescript
import {
  // Selector helpers
  role, text, css, xpath, label, testId,

  // Types
  type BAPSelector,
  type Page,
  type AccessibilityNode,

  // Errors
  BAPError,
  BAPTimeoutError,

  // Protocol constants
  BAP_VERSION,
  ErrorCodes,
} from "@browseragentprotocol/protocol";

// Create semantic selectors
const submitButton = role("button", "Submit");
const emailInput = label("Email address");
const searchBox = text("Search...");
```

## Semantic Selectors

BAP uses semantic selectors that are more stable and AI-friendly than CSS selectors:

| Function | Description | Example |
|----------|-------------|---------|
| `role(role, name?)` | ARIA role and accessible name | `role("button", "Submit")` |
| `text(content)` | Visible text content | `text("Sign in")` |
| `label(text)` | Associated label text | `label("Email")` |
| `placeholder(text)` | Placeholder attribute | `placeholder("Search...")` |
| `testId(id)` | Test ID attribute | `testId("submit-btn")` |
| `css(selector)` | CSS selector (fallback) | `css(".btn-primary")` |
| `xpath(expression)` | XPath expression | `xpath("//button[@type='submit']")` |

## Zod Schemas

All types have corresponding Zod schemas for runtime validation:

```typescript
import { BAPSelectorSchema } from "@browseragentprotocol/protocol";

const selector = { type: "role", role: "button", name: "Submit" };
const validated = BAPSelectorSchema.parse(selector);
```

## Error Classes

```typescript
import {
  BAPError,           // Base error class
  BAPTimeoutError,    // Operation timed out
  BAPConnectionError, // Connection failed
  BAPElementNotFoundError, // Element not found
  BAPNavigationError, // Navigation failed
} from "@browseragentprotocol/protocol";

try {
  await client.click(role("button", "Missing"));
} catch (error) {
  if (error instanceof BAPElementNotFoundError) {
    console.log("Element not found:", error.message);
  }
}
```

## License

Apache-2.0
