# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```sh
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages
pnpm typecheck        # Type-check all packages
pnpm lint             # Run ESLint across all packages
pnpm lint:fix         # Auto-fix lint issues
pnpm check            # Run typecheck + lint together
pnpm format           # Format all source files with Prettier
pnpm format:check     # Check formatting without writing
pnpm clean            # Remove all build outputs and node_modules

# Run a single package script
pnpm --filter @browseragentprotocol/protocol build
pnpm --filter @browseragentprotocol/client typecheck
pnpm --filter @browseragentprotocol/server-playwright lint
```

## Code Style Guidelines

- **TypeScript**: Strict type checking, ES modules, explicit return types for public APIs
- **Naming**: PascalCase for classes/types/interfaces, camelCase for functions/variables
- **Files**: Lowercase with hyphens (e.g., `bap-client.ts`), test files with `.test.ts` suffix
- **Imports**: ES module style, include `.js` extension for local imports, group imports logically
- **Formatting**: 2-space indentation, semicolons required, double quotes (Prettier default)
- **Comments**: JSDoc for public APIs, inline comments only for complex logic

## Architecture Overview

### Package Structure

```
packages/
├── protocol/          # Core types, Zod schemas, errors, selectors
├── logger/            # Pretty logging utilities with colors and icons
├── client/            # TypeScript SDK for connecting to BAP servers
├── server-playwright/ # BAP server implementation using Playwright
├── mcp/               # Model Context Protocol integration
└── python-sdk/     # Python SDK (browseragentprotocol on PyPI)
```

### Package Dependencies

```
protocol (foundation - no internal deps)
logger (standalone - picocolors only)
    ↑
    ├── client (depends on protocol)
    │       ↑
    │       └── mcp (depends on client + protocol + logger)
    │
    ├── server-playwright (depends on protocol + logger)
    │
    └── python-client (standalone Python package, mirrors protocol types)
```

### Protocol Design

BAP uses **JSON-RPC 2.0** over **WebSocket** for communication:

- **Requests**: Client sends method + params, server responds with result or error
- **Notifications**: One-way messages (no response expected)
- **Events**: Server pushes page/console/network events to subscribed clients

### Core Types (in `protocol` package)

| Type | Description |
|------|-------------|
| `BAPSelector` | Semantic element selector (role, text, css, etc.) |
| `Page` | Browser page/tab representation |
| `AccessibilityNode` | Accessibility tree node |
| `BAPError` | Base error class with JSON-RPC error codes |

## Key Patterns

### Semantic Selectors

BAP uses semantic selectors instead of brittle CSS selectors:

```typescript
import { role, text, label, css } from "@browseragentprotocol/protocol";

// Preferred: Semantic selectors
role("button", "Submit")     // ARIA role + accessible name
text("Sign in")              // Visible text content
label("Email address")       // Associated label

// Fallback: CSS/XPath
css(".btn-primary")
xpath("//button[@type='submit']")
```

### Client Connection Flow

```typescript
import { BAPClient } from "@browseragentprotocol/client";

// 1. Create client with server URL
const client = new BAPClient("ws://localhost:9222");

// 2. Connect and initialize (exchanges capabilities)
await client.connect();

// 3. Launch browser
await client.launch({ browser: "chromium", headless: true });

// 4. Create page and interact
await client.createPage({ url: "https://example.com" });
await client.click(role("button", "Submit"));

// 5. Clean up
await client.close();
```

### Error Handling

```typescript
import {
  BAPError,
  BAPTimeoutError,
  BAPContextNotFoundError,
  BAPApprovalDeniedError,
  BAPFrameNotFoundError,
  BAPStreamCancelledError,
  ErrorCodes
} from "@browseragentprotocol/protocol";

try {
  await client.click(role("button", "Missing"));
} catch (error) {
  if (error instanceof BAPTimeoutError) {
    // Handle timeout
  } else if (error instanceof BAPContextNotFoundError) {
    // Handle missing context
  } else if (error instanceof BAPApprovalDeniedError) {
    // Handle approval denied
  } else if (error instanceof BAPError) {
    console.log(error.code);    // ErrorCodes.ElementNotFound
    console.log(error.message); // "Element not found: role=button, name=Missing"
  }
}
```

### Server Implementation (Playwright)

The server translates BAP protocol messages to Playwright API calls:

```typescript
// BAP request
{ method: "action/click", params: { selector: { type: "role", role: "button", name: "Submit" } } }

// Translates to Playwright
await page.getByRole("button", { name: "Submit" }).click();
```

## MCP Integration

The `@browseragentprotocol/mcp` package exposes BAP as an MCP server:

```
Claude Desktop → MCP (stdio) → BAP MCP Server → BAP Client → BAP Server → Browser
```

MCP tools available: `bap_launch`, `bap_navigate`, `bap_click`, `bap_fill`, `bap_screenshot`, `bap_accessibility`, `bap_act`, `bap_observe`, `bap_extract`

## Agent Methods (AI-Optimized)

BAP provides three composite methods optimized for AI agents:

| Method | Purpose |
|--------|---------|
| `agent/act` | Execute multi-step action sequences atomically |
| `agent/observe` | Get AI-optimized page observations (accessibility tree, interactive elements, screenshots) |
| `agent/extract` | Extract structured data from pages using JSON schema |

```typescript
// Execute multiple actions atomically
await client.act({
  steps: [
    { action: "action/fill", params: { selector: label("Email"), value: "user@example.com" } },
    { action: "action/click", params: { selector: role("button", "Submit") } },
  ],
});

// Get AI-optimized observation
const obs = await client.observe({
  includeAccessibilityTree: true,
  includeInteractiveElements: true,
  maxElements: 50,
});

// Extract structured data
const data = await client.extract({
  instruction: "Extract all product names and prices",
  schema: { type: "array", items: { type: "object", properties: { name: { type: "string" }, price: { type: "number" } } } },
});
```

## Development Learnings & Gotchas

### Zod Recursive Schemas

**Problem**: Using `z.lazy()` for recursive schemas can cause TypeScript type inference issues:
```typescript
// ❌ This causes "implicitly has type 'any'" error
export const RecursiveSchema = z.object({
  children: z.array(z.lazy(() => RecursiveSchema)).optional(),
});
```

**Solution**: Use explicit type annotation with a non-recursive schema (max nesting levels):
```typescript
// ✅ Explicit type annotation avoids inference issues
export const ExtractionSchemaSchema: z.ZodType<{
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, { type: string; description?: string }>;
  items?: { type: string; properties?: Record<string, unknown> };
}> = z.object({
  type: z.enum(["object", "array", "string", "number", "boolean"]),
  properties: z.record(z.object({ type: z.string(), description: z.string().optional() })).optional(),
  items: z.object({ type: z.string(), properties: z.record(z.unknown()).optional() }).optional(),
});
```

### Unused Parameters in TypeScript

When a parameter is required by an interface but not used in implementation, prefix with underscore:
```typescript
// ❌ Causes "declared but never read" error
private async doSomething(instruction: string): Promise<void> { }

// ✅ Prefix with underscore
private async doSomething(_instruction: string): Promise<void> { }
```

### Type Exports from Protocol

When adding new types to `packages/protocol/src/types/`, always:
1. Export from the specific file (e.g., `agent.ts`)
2. Re-export from `packages/protocol/src/types/index.ts`
3. Re-export from `packages/protocol/src/index.ts`

### Testing Build Changes

After modifying protocol types, always run in order:
```sh
pnpm build        # Build all packages (protocol first)
pnpm typecheck    # Verify types across packages
pnpm lint         # Check for style issues
```

### Browser-Side Code in page.evaluate()

When writing code that runs in browser context via Playwright's `page.evaluate()`, TypeScript doesn't have DOM types available. Use `any` types and access globals via `globalThis`:

```typescript
// ❌ TypeScript errors: Cannot find name 'document', 'Image'
const annotated = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const img = new Image();
});

// ✅ Use globalThis and any types
const annotated = await page.evaluate(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (globalThis as any).document;
  const canvas = doc.createElement('canvas');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const img = new (globalThis as any).Image();
});
```

### Empty Catch Blocks

When catching errors that don't need to be used, use empty catch syntax (not `_error`):

```typescript
// ❌ ESLint error: '_error' is defined but never used
try { ... } catch (_error) { }

// ✅ Empty catch (TypeScript 4.0+)
try { ... } catch { }
```

### Adding New Selector Types

When adding a new selector type to `BAPSelectorSchema`:
1. Create the schema in `packages/protocol/src/types/selectors.ts`
2. Add to the `BAPSelectorSchema` discriminated union
3. Create a factory function (e.g., `ref()`)
4. Export from `packages/protocol/src/types/index.ts`
5. Update server's `resolveSelector()` to handle the new type

### Server ClientState Extensions

When adding per-page tracking (like element registries), add to `ClientState` interface:
```typescript
interface ClientState {
  // ... existing fields
  elementRegistries: Map<string, PageElementRegistry>;
}
```
Initialize in the connection handler and clean up on page close/navigation.

## Implemented Features

### Element Reference System (Stable Refs)
- Elements get stable refs based on identity (testId > id > aria-label > hash)
- Refs persist across multiple `agent/observe` calls
- New `RefSelector` type for targeting elements by ref: `{ type: "ref", ref: "@submitBtn" }`
- New fields on `InteractiveElement`: `stability`, `previousRef`

### Screenshot Annotation (Set-of-Marks)
- Annotate screenshots with numbered badges at interactive elements
- Configurable badge/box styles via `AnnotationOptions`
- Returns `annotationMap` linking labels to element refs
- Browser-side canvas rendering (no additional dependencies)

### Multi-Context Support
- Create isolated browser contexts with `context/create`
- Each context has separate cookies, storage, and settings
- List contexts with `context/list`, destroy with `context/destroy`
- Pages can be created in specific contexts via `contextId` parameter
- Resource limits prevent context proliferation

### Human-in-the-Loop Approval
- Server sends `approval/required` notifications for sensitive actions
- Client responds with `approval/respond` (approve, deny, approve-session)
- Configurable approval rules based on actions, selectors, domains
- Timeout protection and audit logging
- New error codes: `ApprovalDenied`, `ApprovalTimeout`, `ApprovalRequired`

### Frame & Shadow DOM Support
- List frames in page with `frame/list`
- Switch to frame context with `frame/switch` (by ID, selector, or URL)
- Return to main frame with `frame/main`
- Domain validation for cross-origin frames
- Shadow DOM auto-piercing (Playwright default behavior)

### Streaming Responses
- Large responses can be streamed via `stream/chunk` notifications
- Client receives chunks with index and offset for reassembly
- `stream/end` notification includes checksum for verification
- `stream/cancel` method to abort in-progress streams
- Memory-efficient for screenshots and large DOM trees

### Python SDK

The Python SDK (`packages/python-sdk/`) provides a Pythonic interface to BAP:

```python
from browseragentprotocol import BAPClient, role, label

async def main():
    async with BAPClient("ws://localhost:9222") as client:
        await client.launch(browser="chromium", headless=True)
        await client.create_page(url="https://example.com")

        await client.click(role("button", "Submit"))
        await client.fill(label("Email"), "user@example.com")

        screenshot = await client.screenshot()

# Sync wrapper for scripts/notebooks
from browseragentprotocol import BAPClientSync

with BAPClientSync("ws://localhost:9222") as client:
    client.launch(browser="chromium", headless=True)
    client.click(role("button", "Submit"))
```

**Python SDK Commands**:
```sh
# Install in development mode
cd packages/python-sdk && pip install -e .

# Run type checking
python -m mypy src/browseragentprotocol --ignore-missing-imports

# Run linting
python -m ruff check src/browseragentprotocol

# CLI commands
bap connect ws://localhost:9222    # Test connection
bap info ws://localhost:9222       # Get server info
```

**Python SDK Structure**:
- `client.py` - Main async BAPClient class
- `sync_client.py` - Synchronous wrapper (BAPClientSync)
- `transport.py` - WebSocket transport (aiohttp)
- `sse.py` - SSE transport alternative (httpx-sse)
- `context.py` - Context managers (bap_client, bap_session)
- `cli.py` - CLI entry point
- `errors.py` - Exception hierarchy matching TypeScript
- `types/` - Pydantic models matching protocol types

## Planned Features

See `ROADMAP.md` for feature status and upcoming plans.
