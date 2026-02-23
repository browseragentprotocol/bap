# BAP vs WebMCP: A Technical Comparison

This document compares the Browser Agent Protocol (BAP) with WebMCP, the W3C Community Group standard for exposing website tools to AI agents. These are complementary technologies that address different layers of the AI-browser interaction stack.

## What Is WebMCP?

WebMCP is a W3C Community Group standard, driven primarily by Google and Microsoft, that allows websites to expose structured tools to AI agents through browser-native APIs. Chrome 146 Canary includes an initial implementation behind an experimental flag.

WebMCP provides two API surfaces for tool declaration:

### Declarative API (HTML Attributes)

Websites annotate existing HTML forms with attributes that describe their purpose to AI agents:

```html
<form toolname="search-products" tooldescription="Search the product catalog by keyword">
  <input name="query" toolparamdescription="Search keywords" />
  <input name="category" toolparamdescription="Product category filter" />
  <button type="submit">Search</button>
</form>
```

The browser parses these attributes and surfaces them as structured tool definitions to any connected agent. The `toolname` and `tooldescription` attributes live on `<form>` elements, while `toolparamdescription` annotates individual `<input>` elements.

### Imperative API (JavaScript)

For dynamic tools that do not map to static forms, websites register tools programmatically via `navigator.modelContext`:

```javascript
navigator.modelContext.addTool({
  name: "add-to-cart",
  description: "Add a product to the shopping cart",
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "Product identifier" },
      quantity: { type: "number", description: "Number of items" }
    },
    required: ["productId"]
  },
  handler: async ({ productId, quantity }) => {
    // Site-defined logic
  }
});
```

The imperative API supports richer schemas and dynamic registration/deregistration of tools as the page state changes.

## The Fundamental Difference

BAP and WebMCP solve different problems at different layers:

**WebMCP = Website exposes tools (cooperative model).** The website author explicitly opts in by annotating forms or registering tools via JavaScript. The agent discovers only what the site chooses to expose. This requires adoption: sites that have not added WebMCP attributes or code expose nothing.

**BAP = Agent controls browser (universal model).** The agent operates on any website through browser automation -- accessibility tree inspection, semantic selectors, screenshot annotation, and structured extraction. No site changes are required. BAP works on the entire web as it exists today.

| | WebMCP | BAP |
|---|---|---|
| **Who acts** | The website provides tools; the agent calls them | The agent controls the browser directly |
| **Site cooperation** | Required | Not required |
| **Coverage** | Only sites that implement WebMCP | Every website |
| **Interaction model** | Function call (agent invokes a declared tool) | Browser automation (agent observes, clicks, fills, extracts) |

## Head-to-Head Comparison

| Dimension | BAP | WebMCP |
|---|---|---|
| **Adoption / Availability** | Works today on any site. Published on npm, available as an MCP server, CLI, and Claude Code plugin. | Chrome 146 Canary behind a flag. Requires per-site adoption by web developers. No production deployments yet. |
| **Security Model** | Sandboxed browser instance controlled by the agent. Supports domain allowlists, scope-based authorization (readonly/standard/full/privileged), and approval workflows for sensitive actions. | Site-defined tool handlers run in the page's security context. The browser mediates tool invocation. Security depends on each site's implementation. |
| **Performance** | Fused operations (navigate+observe, act+observe) cut roundtrips by 50-85%. Incremental observation and response tiers minimize payload size. Composite `act` batches dozens of steps into one call. | Single function call per tool invocation with no browser automation overhead. No DOM traversal or accessibility tree serialization. Potentially lower latency for sites that implement it. |
| **Capabilities** | Full browser control: navigation, form filling, clicking, scrolling, hovering, keyboard input, screenshot capture, accessibility tree inspection, structured data extraction, multi-tab management, cookie/storage access. | Scoped to tools the site explicitly declares. Cannot interact with UI elements outside declared tools. No general-purpose browser automation. |
| **Developer Experience** | Install one package (`@browseragentprotocol/mcp` or `@browseragentprotocol/cli`). Works immediately against any site. Semantic selectors survive redesigns. SKILL.md documents guide agent behavior. | Website developers add HTML attributes or JavaScript to their pages. Agent developers call discovered tools by name. Simple invocation model but requires per-site effort. |
| **Ecosystem** | TypeScript SDK, Python SDK, MCP bridge, CLI with 26 commands, plugin system, skill installer supporting 13 AI agent platforms. | W3C Community Group specification. Chrome implementation in progress. No standalone SDK -- the browser is the runtime. |
| **Browser Support** | Chromium, Firefox, WebKit, Chrome, Edge (via Playwright). Cross-browser from day one. | Chrome 146 Canary only (behind flag). Other browsers have not announced implementations. |
| **Works Without Site Changes** | Yes. Operates on the accessibility tree and DOM of any page. | No. Sites must add `toolname`/`tooldescription` attributes or call `navigator.modelContext` APIs. |

## How BAP CLI and SKILL.md Relate

BAP's architecture includes a skill system that provides agent-level documentation:

- **SKILL.md** files describe BAP's tools, selector syntax, efficiency patterns, and recipes in a format optimized for AI agent consumption. They tell agents *how to use BAP well* -- when to observe vs. act, how to batch steps, which response tier to pick.

- **WebMCP** provides page-level tool exposure. It tells agents *what a specific page offers* -- search this catalog, add this item to a cart, submit this form.

These operate at different levels of the stack:

```
Agent reads SKILL.md    -->  Knows how to use BAP tools effectively
Agent navigates to page -->  BAP observes the page (elements, refs, structure)
Page exposes WebMCP     -->  Agent discovers site-declared tools
Agent decides strategy  -->  Use WebMCP tool (if available) OR BAP automation
```

SKILL.md enriches agent context at the protocol level. WebMCP enriches agent context at the page level. Both contribute to better agent decision-making without conflicting.

## Complementary Positioning

BAP and WebMCP are not competitors. They address different parts of the agent-browser interaction problem:

- **BAP works on the entire existing web.** It uses accessibility tree inspection, semantic selectors, and browser automation to interact with any page regardless of whether the site was designed for AI agents. This is essential today, when the vast majority of websites have no AI-agent-facing APIs.

- **WebMCP provides a structured contract for cooperative sites.** When a site implements WebMCP, agents can invoke well-defined tools with explicit schemas, descriptions, and site-managed handlers. This is a higher-fidelity interaction for the subset of sites that adopt it.

The progression for an agent encountering a page looks like:

1. **WebMCP tools available?** Use them -- they are the site's intended agent interface with defined semantics and error handling.
2. **No WebMCP tools?** Fall back to BAP's universal browser automation. Observe the page, identify interactive elements, and act.
3. **Partial WebMCP coverage?** Use WebMCP tools for declared functionality, BAP automation for everything else.

Together, they cover the full spectrum from "site has never heard of AI agents" to "site provides a rich, purpose-built agent API."

## BAP's WebMCP Integration

BAP includes first-class protocol support for discovering and surfacing WebMCP tools. This means agents using BAP do not need separate WebMCP integration -- BAP bridges the two worlds.

### `discovery/discover` Protocol Method

The `discovery/discover` method scans a page for WebMCP tools and returns them as structured data:

```
discovery/discover({
  pageId: "page-1",          // Optional; defaults to active page
  options: {
    maxTools: 50,            // Cap on returned tools
    includeInputSchemas: true // Include JSON schemas for parameters
  }
})
```

Returns:

```json
{
  "tools": [
    {
      "name": "search-products",
      "description": "Search the product catalog by keyword",
      "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } },
      "source": "webmcp-declarative",
      "formSelector": "form[toolname='search-products']"
    }
  ],
  "totalDiscovered": 1,
  "apiVersion": "1.0"
}
```

Each tool includes a `source` field indicating which API surface exposed it: `"webmcp-declarative"` for HTML attribute-based tools or `"webmcp-imperative"` for JavaScript API-based tools.

### `agent/observe` with `includeWebMCPTools`

For agents that want a unified view of a page, the `observe` method accepts an `includeWebMCPTools` flag:

```
observe({
  maxElements: 30,
  includeWebMCPTools: true
})
```

When enabled, the observation result includes a `webmcpTools` array alongside the standard interactive elements. This fuses page observation and tool discovery into a single call, consistent with BAP's philosophy of minimizing roundtrips.

### `discover_tools` MCP Tool

For agents using BAP through the MCP bridge (Claude Code, Claude Desktop, and other MCP-native clients), tool discovery is exposed as a standard MCP tool. Agents call `discover_tools` to scan the current page for WebMCP tools without needing to understand the underlying `discovery/discover` protocol method.

### Progressive Detection

BAP's discovery implementation follows a progressive detection strategy:

1. **Declarative scan first.** Query the DOM for `form[toolname]` elements and extract tool metadata from HTML attributes. This is fast and does not require JavaScript execution.
2. **Imperative scan second.** Check for `navigator.modelContext` and enumerate any programmatically registered tools. This catches dynamic tools that do not have DOM representation.
3. **Graceful fallback.** If neither API surface is present, discovery returns an empty tool list with `totalDiscovered: 0`. No errors, no noise -- the agent proceeds with standard BAP automation.

This layered approach means agents get the best available information from every page without brittle feature detection or version checks.

## Summary

| Aspect | BAP | WebMCP | Together |
|---|---|---|---|
| **Works on** | Any website | Opted-in websites | Every website, with richer tools where available |
| **Interaction** | Browser automation | Tool invocation | Agent picks the best approach per-action |
| **Available** | Today (npm, PyPI) | Chrome Canary (experimental) | BAP bridges WebMCP tools as they appear |
| **Site effort** | None | Attributes or JavaScript | Incremental -- sites add WebMCP at their own pace |
| **Agent value** | Full browser control | Structured, site-intended tools | Complete coverage with graceful enhancement |

BAP provides universal browser automation that works everywhere today. WebMCP provides a cooperative channel for sites that choose to expose structured tools. BAP's built-in WebMCP discovery ensures agents benefit from both without managing two separate integrations.
