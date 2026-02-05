# @browseragentprotocol/client

TypeScript SDK for connecting to BAP (Browser Agent Protocol) servers.

## Installation

```bash
npm install @browseragentprotocol/client
```

## Quick Start

```typescript
import { BAPClient, role } from "@browseragentprotocol/client";

// Connect to a BAP server
const client = new BAPClient("ws://localhost:9222");
await client.connect();

// Launch browser and create a page
await client.launch({ browser: "chromium", headless: false });
await client.createPage({ url: "https://example.com" });

// Interact using semantic selectors
await client.click(role("button", "Submit"));
await client.fill(role("textbox", "Email"), "user@example.com");

// Get page state for AI reasoning
const { tree } = await client.accessibility();

// Clean up
await client.close();
```

## Semantic Selectors

Use AI-friendly selectors instead of brittle CSS:

```typescript
import { role, text, label, testId } from "@browseragentprotocol/client";

// By accessibility role
await client.click(role("button", "Submit"));
await client.fill(role("textbox", "Search"));

// By visible text
await client.click(text("Sign in"));

// By label
await client.fill(label("Email address"), "user@example.com");

// By test ID
await client.click(testId("submit-button"));
```

## API Reference

### Connection

```typescript
const client = new BAPClient(url, options?);
await client.connect();
await client.close();
```

### Browser Control

```typescript
await client.launch({ browser: "chromium", headless: true });
await client.closeBrowser();
```

### Page Management

```typescript
const page = await client.createPage({ url: "https://example.com" });
await client.navigate("https://another.com");
await client.reload();
await client.goBack();
await client.goForward();
await client.closePage();
```

### Actions

```typescript
await client.click(selector);
await client.dblclick(selector);
await client.fill(selector, "text");
await client.type(selector, "text");
await client.clear(selector);
await client.press("Enter");
await client.hover(selector);
await client.scroll({ direction: "down", amount: 500 });
await client.select(selector, "option-value");
await client.check(selector);
await client.uncheck(selector);
```

### Observations

```typescript
const { data } = await client.screenshot();
const { tree } = await client.accessibility();
const { snapshot } = await client.ariaSnapshot();
const { content } = await client.content("text");
```

### Events

```typescript
client.on("page", (event) => console.log("Page event:", event));
client.on("console", (event) => console.log("Console:", event));
client.on("network", (event) => console.log("Network:", event));
client.on("dialog", (event) => console.log("Dialog:", event));
```

## Requirements

- Node.js >= 20.0.0
- A running BAP server (e.g., `@browseragentprotocol/server`)

## License

Apache-2.0
