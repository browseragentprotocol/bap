/**
 * @fileoverview BAP MCP Integration
 * @module @browseragentprotocol/mcp
 * @version 0.1.0
 *
 * Exposes Browser Agent Protocol as an MCP (Model Context Protocol) server.
 * Allows AI agents like Claude to control browsers through standardized MCP tools.
 *
 * TODO (MEDIUM): Add input validation on tool arguments before passing to BAP client
 * TODO (MEDIUM): Replace unsafe `as any` type casts with proper type narrowing
 * TODO (MEDIUM): Enforce session timeout (maxSessionDuration) - currently unused
 * TODO (MEDIUM): Add resource cleanup on partial failure in ensureClient()
 * TODO (LOW): parseSelector should validate empty/whitespace-only strings
 * TODO (LOW): Consider sanitizing URLs in verbose logging to prevent token leakage
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type Tool,
  type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BAPClient,
  WebSocketTransport,
  type BAPSelector,
} from "@browseragentprotocol/client";

// =============================================================================
// Types
// =============================================================================

export interface BAPMCPServerOptions {
  /** BAP server URL (default: ws://localhost:9222) */
  bapServerUrl?: string;
  /** Server name for MCP (default: bap-browser) */
  name?: string;
  /** Server version (default: 1.0.0) */
  version?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Allowed domains for navigation (empty = all allowed) */
  allowedDomains?: string[];
  /** Maximum session duration in seconds (default: 3600) */
  maxSessionDuration?: number;
}

interface ToolResult {
  content: Array<{
    type: "text" | "image";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// =============================================================================
// Selector Parsing
// =============================================================================

/**
 * Parse a selector string into a BAPSelector object.
 * Supports all 10 BAP selector types:
 * - role:button:Submit -> { type: "role", role: "button", name: "Submit" }
 * - text:Click here -> { type: "text", value: "Click here" }
 * - label:Email -> { type: "label", value: "Email" }
 * - css:.btn-primary -> { type: "css", value: ".btn-primary" }
 * - xpath://button[@id='submit'] -> { type: "xpath", value: "//button[@id='submit']" }
 * - placeholder:Enter email -> { type: "placeholder", value: "Enter email" }
 * - testId:submit-button -> { type: "testId", value: "submit-button" }
 * - ref:@submitBtn -> { type: "ref", ref: "@submitBtn" }
 * - coords:100,200 -> { type: "coordinates", x: 100, y: 200 }
 * - #submit-btn -> { type: "css", value: "#submit-btn" } (CSS shorthand)
 */
function parseSelector(selector: string): BAPSelector {
  // Role selector: role:button:Submit
  if (selector.startsWith("role:")) {
    const parts = selector.slice(5).split(":");
    const roleValue = parts[0] as any;
    const name = parts.slice(1).join(":") || undefined;
    return { type: "role", role: roleValue, name };
  }

  // Text selector: text:Click here
  if (selector.startsWith("text:")) {
    return { type: "text", value: selector.slice(5) };
  }

  // Label selector: label:Email
  if (selector.startsWith("label:")) {
    return { type: "label", value: selector.slice(6) };
  }

  // CSS selector: css:.btn-primary
  if (selector.startsWith("css:")) {
    return { type: "css", value: selector.slice(4) };
  }

  // XPath selector: xpath://button[@id='submit']
  if (selector.startsWith("xpath:")) {
    return { type: "xpath", value: selector.slice(6) };
  }

  // Placeholder selector: placeholder:Enter email
  if (selector.startsWith("placeholder:")) {
    return { type: "placeholder", value: selector.slice(12) };
  }

  // TestId selector: testId:submit-button
  if (selector.startsWith("testId:")) {
    return { type: "testId", value: selector.slice(7) };
  }

  // Ref selector: ref:@submitBtn or just @submitBtn
  if (selector.startsWith("ref:")) {
    return { type: "ref", ref: selector.slice(4) };
  }
  if (selector.startsWith("@")) {
    return { type: "ref", ref: selector };
  }

  // Coordinates selector: coords:100,200
  if (selector.startsWith("coords:")) {
    const coords = selector.slice(7).split(",");
    if (coords.length >= 2 && coords[0] && coords[1]) {
      const x = parseInt(coords[0], 10);
      const y = parseInt(coords[1], 10);
      if (!isNaN(x) && !isNaN(y)) {
        return { type: "coordinates", x, y };
      }
    }
  }

  // CSS shorthand for IDs and classes
  if (selector.startsWith("#") || selector.startsWith(".")) {
    return { type: "css", value: selector };
  }

  // Default to text selector for plain strings
  return { type: "text", value: selector };
}

/**
 * Format a BAPSelector for display in AI output
 */
function formatSelectorForDisplay(selector: BAPSelector): string {
  switch (selector.type) {
    case "role":
      return `role:${selector.role}${selector.name ? `:${selector.name}` : ""}`;
    case "text":
      return `text:${selector.value}`;
    case "label":
      return `label:${selector.value}`;
    case "testId":
      return `testId:${selector.value}`;
    case "css":
      return selector.value.startsWith("#") || selector.value.startsWith(".")
        ? selector.value
        : `css:${selector.value}`;
    case "xpath":
      return `xpath:${selector.value}`;
    case "placeholder":
      return `placeholder:${selector.value}`;
    case "ref":
      return selector.ref;
    case "coordinates":
      return `coords:${selector.x},${selector.y}`;
    case "semantic":
      return `semantic:${selector.description}`;
    default:
      return JSON.stringify(selector);
  }
}

// =============================================================================
// Tool Definitions
// =============================================================================

const TOOLS: Tool[] = [
  // Navigation
  {
    name: "bap_navigate",
    description:
      "Navigate the browser to a URL. Use this to open web pages. Returns the page title and URL after navigation.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (must include protocol, e.g., https://)",
        },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"],
          description: "When to consider navigation complete (default: load)",
        },
      },
      required: ["url"],
    },
  },

  // Element Interaction
  {
    name: "bap_click",
    description:
      'Click an element on the page. Use semantic selectors like "role:button:Submit" or "text:Sign in" for reliability.',
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            'Element selector. Formats: "role:button:Submit", "text:Click here", "label:Email", "css:.btn", "#id"',
        },
        clickCount: {
          type: "number",
          description: "Number of clicks (default: 1, use 2 for double-click)",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "bap_type",
    description:
      "Type text into an input field. First clicks the element, then types the text character by character.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: 'Element selector for the input field. E.g., "role:textbox:Email" or "label:Password"',
        },
        text: {
          type: "string",
          description: "Text to type into the field",
        },
        delay: {
          type: "number",
          description: "Delay between keystrokes in milliseconds (default: 0)",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "bap_fill",
    description:
      "Fill an input field with text (clears existing content first). Faster than bap_type for form filling.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: 'Element selector for the input field. E.g., "role:textbox:Search" or "label:Username"',
        },
        value: {
          type: "string",
          description: "Value to fill into the field",
        },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "bap_press",
    description: "Press a keyboard key. Use for Enter, Tab, Escape, or keyboard shortcuts like Ctrl+A.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: 'Key to press. E.g., "Enter", "Tab", "Escape", "Control+a", "Meta+c"',
        },
        selector: {
          type: "string",
          description: "Optional: element to focus before pressing key",
        },
      },
      required: ["key"],
    },
  },
  {
    name: "bap_select",
    description: "Select an option from a dropdown/select element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: 'Selector for the select/dropdown element. E.g., "role:combobox:Country"',
        },
        value: {
          type: "string",
          description: "Value or label of the option to select",
        },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "bap_scroll",
    description: "Scroll the page or a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Direction to scroll (default: down)",
        },
        amount: {
          type: "number",
          description: "Amount to scroll in pixels (default: 500)",
        },
        selector: {
          type: "string",
          description: "Optional: element to scroll within (scrolls page viewport if not specified)",
        },
      },
    },
  },
  {
    name: "bap_hover",
    description: "Hover over an element. Useful for triggering hover menus or tooltips.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: 'Element selector to hover over. E.g., "role:menuitem:Settings"',
        },
      },
      required: ["selector"],
    },
  },

  // Observations
  {
    name: "bap_screenshot",
    description:
      "Take a screenshot of the current page. Returns the image as base64. Use for visual verification.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description: "Capture full page including scrollable content (default: false)",
        },
      },
    },
  },
  {
    name: "bap_accessibility",
    description:
      "Get the accessibility tree of the page. Returns a structured representation ideal for understanding page layout and finding elements. RECOMMENDED: Use this before interacting with elements.",
    inputSchema: {
      type: "object",
      properties: {
        interestingOnly: {
          type: "boolean",
          description: "Only return interactive/actionable elements (default: true)",
        },
      },
    },
  },
  {
    name: "bap_aria_snapshot",
    description:
      "Get a token-efficient YAML snapshot of the page accessibility tree. ~80% fewer tokens than full accessibility tree. Best for LLM context.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional: get snapshot of specific element subtree only",
        },
      },
    },
  },
  {
    name: "bap_content",
    description:
      "Get page content as text or markdown. Useful for reading article content or extracting text.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["text", "markdown", "html"],
          description: "Output format (default: text)",
        },
      },
    },
  },
  {
    name: "bap_element",
    description:
      "Query properties of a specific element. Check if an element exists, is visible, enabled, etc.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Element selector to query",
        },
        properties: {
          type: "array",
          items: {
            type: "string",
            enum: ["visible", "enabled", "checked", "text", "value", "boundingBox"],
          },
          description: 'Properties to query (default: ["visible", "enabled"])',
        },
      },
      required: ["selector"],
    },
  },

  // Page Management
  {
    name: "bap_pages",
    description: "List all open pages/tabs. Returns page IDs and URLs.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bap_activate_page",
    description: "Switch to a different page/tab by its ID.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          description: "ID of the page to activate (from bap_pages)",
        },
      },
      required: ["pageId"],
    },
  },
  {
    name: "bap_close_page",
    description: "Close the current page/tab.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bap_go_back",
    description: "Navigate back in browser history.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bap_go_forward",
    description: "Navigate forward in browser history.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "bap_reload",
    description: "Reload the current page.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // Agent (Composite Actions, Observations, and Data Extraction)
  {
    name: "bap_act",
    description: `Execute a sequence of browser actions in a single call.
Useful for multi-step flows like login, form submission, or navigation sequences.
Each step can have conditions and error handling. More efficient than calling actions individually.`,
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "Array of action steps to execute in order",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Human-readable label for this step (for debugging)",
              },
              action: {
                type: "string",
                description: "BAP action to execute",
                enum: [
                  "action/click", "action/dblclick", "action/fill", "action/type", "action/press",
                  "action/hover", "action/scroll", "action/select", "action/check", "action/uncheck",
                  "page/navigate", "page/reload", "page/goBack", "page/goForward",
                ],
              },
              selector: {
                type: "string",
                description: 'Element selector for action (e.g., "role:button:Submit", "text:Login")',
              },
              value: {
                type: "string",
                description: "Value for fill/type/select actions",
              },
              url: {
                type: "string",
                description: "URL for page/navigate action",
              },
              key: {
                type: "string",
                description: "Key for action/press (e.g., \"Enter\", \"Tab\")",
              },
            },
            required: ["action"],
          },
        },
        stopOnFirstError: {
          type: "boolean",
          description: "Stop execution if any step fails (default: true)",
        },
      },
      required: ["steps"],
    },
  },
  {
    name: "bap_observe",
    description: `Get an AI-optimized observation of the current page.
Returns interactive elements with pre-computed selectors, making it easy to determine
what actions are possible. Supports stable element refs and annotated screenshots.
RECOMMENDED: Use this before complex interactions to understand the page.`,
    inputSchema: {
      type: "object",
      properties: {
        includeScreenshot: {
          type: "boolean",
          description: "Include a screenshot of the page",
        },
        includeAccessibility: {
          type: "boolean",
          description: "Include the full accessibility tree",
        },
        maxElements: {
          type: "number",
          description: "Maximum number of interactive elements to return (default: 50)",
        },
        filterRoles: {
          type: "array",
          items: { type: "string" },
          description: 'Filter to specific ARIA roles (e.g., ["button", "link", "textbox"])',
        },
        annotateScreenshot: {
          type: "boolean",
          description: "Annotate screenshot with numbered element markers (Set-of-Marks style). Useful for visual element identification.",
        },
        stableRefs: {
          type: "boolean",
          description: "Use stable element refs that persist across observations (default: true)",
        },
      },
    },
  },
  {
    name: "bap_extract",
    description: `Extract structured data from the current page.
Use natural language instructions and a JSON schema to extract data like product listings,
tables, contact information, or any structured content.`,
    inputSchema: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "Natural language description of what data to extract",
        },
        schema: {
          type: "object",
          description: "JSON Schema defining the structure of the data to extract",
          properties: {
            type: {
              type: "string",
              enum: ["object", "array", "string", "number", "boolean"],
            },
            properties: {
              type: "object",
              description: "Properties for object type",
            },
            items: {
              type: "object",
              description: "Items schema for array type",
            },
          },
          required: ["type"],
        },
        mode: {
          type: "string",
          enum: ["single", "list", "table"],
          description: "Extraction mode: single item, list of items, or tabular data",
        },
        selector: {
          type: "string",
          description: "Optional selector to limit extraction scope",
        },
      },
      required: ["instruction", "schema"],
    },
  },
];

// =============================================================================
// Resource Definitions
// =============================================================================

const RESOURCES: Resource[] = [
  {
    uri: "bap://page/state",
    name: "Current Page State",
    description: "Current page URL, title, and status",
    mimeType: "application/json",
  },
  {
    uri: "bap://page/accessibility",
    name: "Accessibility Tree",
    description: "Full accessibility tree of the current page",
    mimeType: "application/json",
  },
  {
    uri: "bap://page/aria-snapshot",
    name: "ARIA Snapshot",
    description: "Token-efficient YAML accessibility snapshot",
    mimeType: "text/yaml",
  },
  {
    uri: "bap://page/screenshot",
    name: "Page Screenshot",
    description: "Screenshot of the current page viewport",
    mimeType: "image/png",
  },
];

// =============================================================================
// BAP MCP Server
// =============================================================================

/**
 * BAP MCP Server - Exposes BAP as an MCP server
 */
export class BAPMCPServer {
  private server: Server;
  private client: BAPClient | null = null;
  private transport: WebSocketTransport | null = null;
  private options: Required<BAPMCPServerOptions>;

  constructor(options: BAPMCPServerOptions = {}) {
    this.options = {
      bapServerUrl: options.bapServerUrl ?? "ws://localhost:9222",
      name: options.name ?? "bap-browser",
      version: options.version ?? "1.0.0",
      verbose: options.verbose ?? false,
      allowedDomains: options.allowedDomains ?? [],
      maxSessionDuration: options.maxSessionDuration ?? 3600,
    };

    this.server = new Server(
      {
        name: this.options.name,
        version: this.options.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Log a message if verbose mode is enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.options.verbose) {
      console.error(`[BAP-MCP] ${message}`, ...args);
    }
  }

  /**
   * Validate domain is allowed
   */
  private isAllowedDomain(url: string): boolean {
    if (this.options.allowedDomains.length === 0) {
      return true;
    }

    try {
      const parsed = new URL(url);
      return this.options.allowedDomains.some((domain) => {
        if (domain.startsWith("*.")) {
          const baseDomain = domain.slice(2);
          return parsed.hostname === baseDomain || parsed.hostname.endsWith(`.${baseDomain}`);
        }
        return parsed.hostname === domain;
      });
    } catch {
      return false;
    }
  }

  /**
   * Ensure BAP client is connected
   */
  private async ensureClient(): Promise<BAPClient> {
    if (this.client) {
      return this.client;
    }

    this.log("Connecting to BAP server:", this.options.bapServerUrl);

    this.transport = new WebSocketTransport(this.options.bapServerUrl);
    this.client = new BAPClient(this.transport);

    // Connect and initialize the protocol
    await this.client.connect();

    // Launch browser
    await this.client.launch({ headless: false });

    this.log("BAP client connected and browser launched");
    return this.client;
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: RESOURCES,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.handleToolCall(name, args ?? {});
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const result = await this.handleResourceRead(uri);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: `Error: ${message}`,
            },
          ],
        };
      }
    });
  }

  /**
   * Handle a tool call
   */
  private async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const client = await this.ensureClient();

    this.log(`Tool call: ${name}`, args);

    switch (name) {
      // Navigation
      case "bap_navigate": {
        const url = args.url as string;

        // Security check
        if (!this.isAllowedDomain(url)) {
          return {
            content: [{ type: "text", text: `Error: Domain not allowed. Allowed domains: ${this.options.allowedDomains.join(", ") || "all"}` }],
            isError: true,
          };
        }

        // Ensure we have a page (create one if needed)
        const pages = await client.listPages();
        if (!pages.pages || pages.pages.length === 0) {
          await client.createPage({ url });
          return {
            content: [
              {
                type: "text",
                text: `Navigated to: ${url}`,
              },
            ],
          };
        }

        const waitUntil = (args.waitUntil as string) ?? "load";
        const result = await client.navigate(url, { waitUntil: waitUntil as any });
        return {
          content: [
            {
              type: "text",
              text: `Navigated to: ${result.url}\nStatus: ${result.status}`,
            },
          ],
        };
      }

      // Element Interaction
      case "bap_click": {
        const selector = parseSelector(args.selector as string);
        const options = args.clickCount ? { clickCount: args.clickCount as number } : undefined;
        await client.click(selector, options);
        return {
          content: [{ type: "text", text: `Clicked: ${args.selector}` }],
        };
      }

      case "bap_type": {
        const selector = parseSelector(args.selector as string);
        const text = args.text as string;
        const delay = args.delay as number | undefined;
        await client.type(selector, text, { delay });
        return {
          content: [{ type: "text", text: `Typed "${text}" into: ${args.selector}` }],
        };
      }

      case "bap_fill": {
        const selector = parseSelector(args.selector as string);
        const value = args.value as string;
        await client.fill(selector, value);
        return {
          content: [{ type: "text", text: `Filled "${value}" into: ${args.selector}` }],
        };
      }

      case "bap_press": {
        const key = args.key as string;
        const selector = args.selector ? parseSelector(args.selector as string) : undefined;
        await client.press(key, selector);
        return {
          content: [{ type: "text", text: `Pressed: ${key}` }],
        };
      }

      case "bap_select": {
        const selector = parseSelector(args.selector as string);
        const value = args.value as string;
        await client.select(selector, value);
        return {
          content: [{ type: "text", text: `Selected "${value}" in: ${args.selector}` }],
        };
      }

      case "bap_scroll": {
        const direction = (args.direction as string) ?? "down";
        const amount = (args.amount as number) ?? 500;
        const selector = args.selector ? parseSelector(args.selector as string) : undefined;
        await client.scroll(selector, { direction: direction as any, amount });
        return {
          content: [{ type: "text", text: `Scrolled ${direction} by ${amount}px` }],
        };
      }

      case "bap_hover": {
        const selector = parseSelector(args.selector as string);
        await client.hover(selector);
        return {
          content: [{ type: "text", text: `Hovered over: ${args.selector}` }],
        };
      }

      // Observations
      case "bap_screenshot": {
        const fullPage = args.fullPage as boolean ?? false;
        const result = await client.screenshot({ fullPage });
        return {
          content: [
            {
              type: "image",
              data: result.data,
              mimeType: `image/${result.format}`,
            },
          ],
        };
      }

      case "bap_accessibility": {
        const interestingOnly = args.interestingOnly as boolean ?? true;
        const result = await client.accessibility({ interestingOnly });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.tree, null, 2),
            },
          ],
        };
      }

      case "bap_aria_snapshot": {
        const selector = args.selector ? parseSelector(args.selector as string) : undefined;
        const result = await client.ariaSnapshot(selector);
        return {
          content: [
            {
              type: "text",
              text: `URL: ${result.url}\nTitle: ${result.title}\n\n${result.snapshot}`,
            },
          ],
        };
      }

      case "bap_content": {
        const format = (args.format as string) ?? "text";
        const result = await client.content(format as any);
        return {
          content: [{ type: "text", text: result.content }],
        };
      }

      case "bap_element": {
        const selector = parseSelector(args.selector as string);
        const properties = (args.properties as string[]) ?? ["visible", "enabled"];
        const result = await client.element(selector, properties as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Page Management
      case "bap_pages": {
        const result = await client.listPages();
        const text = result.pages
          .map((p) => `${p.id === result.activePage ? "* " : "  "}${p.id}: ${p.url} (${p.title})`)
          .join("\n");
        return {
          content: [{ type: "text", text: `Pages:\n${text}` }],
        };
      }

      case "bap_activate_page": {
        const pageId = args.pageId as string;
        await client.activatePage(pageId);
        return {
          content: [{ type: "text", text: `Activated page: ${pageId}` }],
        };
      }

      case "bap_close_page": {
        await client.closePage();
        return {
          content: [{ type: "text", text: "Closed current page" }],
        };
      }

      case "bap_go_back": {
        await client.goBack();
        return {
          content: [{ type: "text", text: "Navigated back" }],
        };
      }

      case "bap_go_forward": {
        await client.goForward();
        return {
          content: [{ type: "text", text: "Navigated forward" }],
        };
      }

      case "bap_reload": {
        await client.reload();
        return {
          content: [{ type: "text", text: "Reloaded page" }],
        };
      }

      // Agent (Composite Actions, Observations, and Data Extraction)
      case "bap_act": {
        const steps = (args.steps as any[]).map((s: any) => {
          const step: any = {
            label: s.label,
            action: s.action,
            params: {},
          };

          if (s.selector) {
            step.params.selector = parseSelector(s.selector);
          }
          if (s.value !== undefined) {
            step.params.value = s.value;
          }
          if (s.url) {
            step.params.url = s.url;
          }
          if (s.key) {
            step.params.key = s.key;
          }
          if (s.text) {
            step.params.text = s.text;
          }

          return step;
        });

        const result = await client.act({
          steps,
          stopOnFirstError: args.stopOnFirstError as boolean ?? true,
        });

        // Format result for AI consumption
        const summary = result.success
          ? `Executed ${result.completed}/${result.total} steps successfully`
          : `Failed at step ${(result.failedAt ?? 0) + 1}: ${result.results[result.failedAt ?? 0]?.error?.message ?? "Unknown error"}`;

        const stepDetails = result.results
          .map((r: any) =>
            `${r.success ? "OK" : "FAIL"} Step ${r.step + 1}${r.label ? ` (${r.label})` : ""}: ${
              r.success ? "completed" : r.error?.message ?? "failed"
            }`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `${summary}\n\n${stepDetails}\n\nTotal time: ${result.duration}ms`,
            },
          ],
          isError: !result.success,
        };
      }

      case "bap_observe": {
        const annotate = args.annotateScreenshot as boolean;
        const result = await client.observe({
          includeScreenshot: (args.includeScreenshot as boolean) || annotate,
          includeAccessibility: args.includeAccessibility as boolean,
          includeInteractiveElements: true,
          includeMetadata: true,
          includeBounds: annotate, // Need bounds for annotation
          maxElements: (args.maxElements as number) ?? 50,
          filterRoles: args.filterRoles as string[],
          // New features
          annotateScreenshot: annotate ? { enabled: true } : undefined,
          stableRefs: args.stableRefs as boolean | undefined,
        });

        const content: Array<{ type: "text" | "image"; text?: string; data?: string; mimeType?: string }> = [];

        // Metadata
        if (result.metadata) {
          content.push({
            type: "text",
            text: `Page: ${result.metadata.title}\nURL: ${result.metadata.url}\nViewport: ${result.metadata.viewport.width}x${result.metadata.viewport.height}`,
          });
        }

        // Interactive elements (formatted for AI)
        if (result.interactiveElements && result.interactiveElements.length > 0) {
          const elementList = result.interactiveElements
            .map((el: any, i: number) => {
              const selector = formatSelectorForDisplay(el.selector);
              const hints = el.actionHints.join(", ");
              // Use ref from element (stable or indexed)
              const ref = el.ref ?? `@e${i + 1}`;
              const stability = el.stability ? ` [${el.stability}]` : "";
              return `${ref}${stability} ${el.role}${el.name ? `: "${el.name}"` : ""} - ${selector} (${hints})`;
            })
            .join("\n");

          content.push({
            type: "text",
            text: `\nInteractive Elements (${result.interactiveElements.length}/${result.totalInteractiveElements ?? "?"}):\n${elementList}`,
          });
        }

        // Annotation map (if screenshot was annotated)
        if (result.annotationMap && result.annotationMap.length > 0) {
          const mapText = result.annotationMap
            .map((m: any) => `[${m.label}] -> ${m.ref}`)
            .join("\n");
          content.push({
            type: "text",
            text: `\nAnnotation Map:\n${mapText}`,
          });
        }

        // Screenshot
        if (result.screenshot) {
          const annotatedNote = result.screenshot.annotated ? " (annotated)" : "";
          content.push({
            type: "text",
            text: `\nScreenshot${annotatedNote}:`,
          });
          content.push({
            type: "image",
            data: result.screenshot.data,
            mimeType: `image/${result.screenshot.format}`,
          });
        }

        return { content };
      }

      case "bap_extract": {
        const result = await client.extract({
          instruction: args.instruction as string,
          schema: args.schema as any,
          mode: args.mode as "single" | "list" | "table" | undefined,
          selector: args.selector ? parseSelector(args.selector as string) : undefined,
        });

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: `Extraction successful (confidence: ${Math.round((result.confidence ?? 0) * 100)}%)\n\nExtracted data:\n${JSON.stringify(result.data, null, 2)}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Extraction failed: ${result.error ?? "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  /**
   * Handle a resource read
   */
  private async handleResourceRead(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType: string;
      text?: string;
      blob?: string;
    }>;
  }> {
    const client = await this.ensureClient();

    this.log(`Resource read: ${uri}`);

    switch (uri) {
      case "bap://page/state": {
        const pages = await client.listPages();
        const activePage = pages.pages.find((p) => p.id === pages.activePage);
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  url: activePage?.url,
                  title: activePage?.title,
                  status: activePage?.status,
                  pageCount: pages.pages.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "bap://page/accessibility": {
        const tree = await client.accessibility({ interestingOnly: false });
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(tree.tree, null, 2),
            },
          ],
        };
      }

      case "bap://page/aria-snapshot": {
        const result = await client.ariaSnapshot();
        return {
          contents: [
            {
              uri,
              mimeType: "text/yaml",
              text: result.snapshot,
            },
          ],
        };
      }

      case "bap://page/screenshot": {
        const result = await client.screenshot();
        return {
          contents: [
            {
              uri,
              mimeType: `image/${result.format}`,
              blob: result.data,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  /**
   * Start the MCP server using stdio transport
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.log("BAP MCP Server running on stdio");
  }

  /**
   * Close the server and clean up
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    await this.server.close();
    this.log("BAP MCP Server closed");
  }
}

// =============================================================================
// Exports
// =============================================================================

export { BAPClient, type BAPSelector } from "@browseragentprotocol/client";
export { parseSelector, formatSelectorForDisplay };
