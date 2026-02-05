# browser-agent-protocol

Python SDK for the Browser Agent Protocol (BAP) - control browsers with AI agents.

## Installation

```bash
pip install browser-agent-protocol
```

## Quick Start

### Async API (recommended)

```python
import asyncio
from browseragentprotocol import BAPClient, role, text, label

async def main():
    async with BAPClient("ws://localhost:9222") as client:
        # Launch browser
        await client.launch(browser="chromium", headless=True)

        # Create page and navigate
        await client.create_page(url="https://example.com")

        # Click using semantic selectors
        await client.click(role("button", "Submit"))

        # Fill form fields
        await client.fill(label("Email"), "user@example.com")

        # Take screenshot
        screenshot = await client.screenshot()
        print(f"Screenshot: {len(screenshot.data)} bytes")

        # Get accessibility tree (ideal for AI agents)
        tree = await client.accessibility()
        print(f"Found {len(tree.tree)} nodes")

asyncio.run(main())
```

### High-Level Session Helper

```python
from browseragentprotocol.context import bap_session, role

async with bap_session(
    "ws://localhost:9222",
    start_url="https://example.com"
) as client:
    await client.click(role("button", "Accept"))
    content = await client.content()
```

### Sync API (for scripts and notebooks)

```python
from browseragentprotocol import BAPClientSync, role

with BAPClientSync("ws://localhost:9222") as client:
    client.launch(browser="chromium", headless=True)
    client.create_page(url="https://example.com")

    client.click(role("button", "Submit"))
    screenshot = client.screenshot()
```

### CLI

```bash
# Test connection to a BAP server
bap connect ws://localhost:9222

# Get server info (with JSON output)
bap info ws://localhost:9222 --json
```

## Semantic Selectors

BAP uses semantic selectors instead of brittle CSS selectors:

```python
from browseragentprotocol import role, text, label, css, xpath, test_id, ref

# Recommended: Semantic selectors
role("button", "Submit")           # ARIA role + accessible name
text("Sign in")                    # Visible text content
label("Email address")             # Associated label

# Developer-controlled identifiers
test_id("submit-button")           # data-testid attribute

# Stable element references
ref("@submitBtn")                  # Element ref from agent/observe

# Fallback: CSS/XPath
css(".btn-primary")
xpath("//button[@type='submit']")
```

## AI Agent Methods

BAP provides three composite methods optimized for AI agents:

### agent/observe - Get AI-optimized page snapshots

```python
observation = await client.observe(
    include_accessibility=True,
    include_interactive_elements=True,
    include_screenshot=True,
    max_elements=50,
    annotate_screenshot=True,  # Set-of-Marks style annotation
)

# Interactive elements with stable refs
for element in observation.interactive_elements:
    print(f"{element.ref}: {element.role} - {element.name}")
    # @e1: button - Submit
    # @e2: textbox - Email

# Screenshot with numbered badges linking to elements
if observation.annotation_map:
    for annotation in observation.annotation_map:
        print(f"[{annotation.label}] -> {annotation.ref}")
```

### agent/act - Execute multi-step sequences atomically

```python
from browseragentprotocol import BAPClient

result = await client.act([
    BAPClient.step("action/fill", {"selector": label("Email"), "value": "user@example.com"}),
    BAPClient.step("action/fill", {"selector": label("Password"), "value": "secret123"}),
    BAPClient.step("action/click", {"selector": role("button", "Sign In")}),
])

print(f"Completed {result.completed}/{result.total} steps")
print(f"Success: {result.success}")
```

### agent/extract - Extract structured data

```python
data = await client.extract(
    instruction="Extract all product names and prices",
    schema={
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "price": {"type": "number"},
            },
        },
    },
)

if data.success:
    for product in data.data:
        print(f"{product['name']}: ${product['price']}")
```

## Multi-Context Support

Create isolated browser contexts with separate cookies/storage:

```python
# Create isolated context
context = await client.create_context(
    context_id="user-session",
    options={
        "viewport": {"width": 1920, "height": 1080},
        "locale": "en-US",
    },
)

# Create page in specific context
page = await client.create_page(
    url="https://example.com",
    context_id=context.context_id,
)

# Clean up
await client.destroy_context(context.context_id)
```

## Frame Support

Navigate iframes and cross-origin frames:

```python
# List frames
frames = await client.list_frames()
for frame in frames.frames:
    print(f"{frame.frame_id}: {frame.url}")

# Switch to iframe
await client.switch_frame(selector=css("iframe#payment"))

# Interact within frame
await client.fill(label("Card number"), "4242424242424242")

# Return to main frame
await client.main_frame()
```

## Human-in-the-Loop Approval

Handle approval requests for sensitive actions:

```python
def handle_approval(params):
    print(f"Approval needed: {params.rule}")
    print(f"Action: {params.original_request}")
    # In a real app, show UI to user
    return "approve"

client.on_approval_required(handle_approval)

# Respond to approval request
await client.respond_to_approval(
    request_id="...",
    decision="approve",  # or "deny", "approve-session"
    reason="User approved the action",
)
```

## Error Handling

```python
from browseragentprotocol import (
    BAPError,
    BAPTimeoutError,
    BAPElementNotFoundError,
    BAPApprovalDeniedError,
)

try:
    await client.click(role("button", "Missing"))
except BAPTimeoutError as e:
    print(f"Timeout: {e.message}")
    if e.retryable:
        # Retry the operation
        pass
except BAPElementNotFoundError as e:
    print(f"Element not found: {e.details}")
except BAPApprovalDeniedError as e:
    print(f"Action denied: {e.message}")
except BAPError as e:
    print(f"Error {e.code}: {e.message}")
```

## Requirements

- Python 3.10+
- aiohttp >= 3.9.0
- pydantic >= 2.0.0
- anyio >= 4.0.0
- httpx >= 0.27.0
- httpx-sse >= 0.4.0

## License

Apache-2.0
