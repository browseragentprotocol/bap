# Browser Automation for AI Agents: A Decision Guide

AI agents increasingly need browser access — to fill forms, extract data, navigate workflows, and interact with web applications. Today, three categories of browser tools exist for agents:

1. **MCP servers** — expose browser actions as tools via the Model Context Protocol
2. **CLI tools** — shell commands that agents invoke directly (often paired with SKILL.md files)
3. **Screenshot/vision** — pixel-level interaction via screenshots and coordinates

This guide covers the MCP and CLI approaches with verifiable facts, focusing on [BAP (Browser Agent Protocol)](https://github.com/browseragentprotocol/bap) and [Playwright MCP](https://github.com/microsoft/playwright-mcp) / [Playwright CLI](https://github.com/microsoft/playwright-cli). All benchmark data is reproducible via the [benchmark suite](https://github.com/browseragentprotocol/benchmarks).

---

## The Landscape

| Tool | Interface | Publisher | npm Package | License |
|------|-----------|-----------|-------------|---------|
| BAP MCP | MCP (stdio) | [browseragentprotocol](https://github.com/browseragentprotocol) | `@browseragentprotocol/mcp` | Apache-2.0 |
| BAP CLI | Shell commands | [browseragentprotocol](https://github.com/browseragentprotocol) | `@browseragentprotocol/cli` | Apache-2.0 |
| Playwright MCP | MCP (stdio) | [Microsoft](https://github.com/microsoft) | `@playwright/mcp` | Apache-2.0 |
| Playwright CLI | Shell commands | [Microsoft](https://github.com/microsoft) | `@playwright/cli` | Apache-2.0 |

> **Playwright MCP GitHub stars:** ~27.5k (as of Feb 2026). Microsoft-backed with a large ecosystem.

All four tools use [Playwright](https://playwright.dev/) as the underlying browser engine.

---

## Architecture

### Playwright MCP — Single-Process

Playwright MCP embeds Playwright directly in the MCP server process. When an agent calls a tool, the server executes the browser action in-process. This means **lower per-call latency** — no inter-process communication overhead.

### BAP MCP — Two-Process

BAP MCP uses a bridge architecture: the MCP server communicates with a separate Playwright server over WebSocket (JSON-RPC 2.0). This adds **~50–200ms per call** but enables:

- **Session persistence** — the browser survives MCP server restarts
- **Multi-client access** — CLI and MCP can control the same browser simultaneously
- **Shared state** — observations, element refs, and cookies persist across interfaces

### Playwright CLI

Standalone shell commands. Each invocation is a separate process. The `--install-skills` flag generates a SKILL.md for agent consumption.

### BAP CLI

Shell commands that connect to a persistent daemon (shared with MCP). The browser survives across commands, and element refs from `bap observe` remain valid for subsequent `bap act` calls.

### What Playwright MCP Recommends

From the [Playwright MCP README](https://github.com/microsoft/playwright-mcp):

> _"If you are using a **coding agent**, you might benefit from using the [CLI+SKILLS](https://github.com/microsoft/playwright-cli) instead."_

BAP agrees with this guidance — CLI + SKILL.md is the better pattern for coding agents. BAP CLI extends it with composite actions, semantic selectors, and structured extraction.

---

## MCP Server Comparison

Side-by-side comparison of BAP MCP and Playwright MCP. Every claim links to a verifiable source.

| Dimension | BAP MCP | Playwright MCP | Source |
|-----------|---------|----------------|--------|
| **Tools** | 23 | 31 (17 core + 6 vision + 5 test + 3 other) | [BAP MCP source](../packages/mcp), [Playwright MCP README](https://github.com/microsoft/playwright-mcp) |
| **Composite actions** | `act` batches N steps in 1 call | No built-in batching | [Playwright MCP README](https://github.com/microsoft/playwright-mcp) (verified: no `batch_execute` or similar) |
| **Observation** | `observe` → structured elements with refs, selectors, action hints | `browser_snapshot` → raw accessibility tree | [Benchmark observe scenario](https://github.com/browseragentprotocol/benchmarks) |
| **Extraction** | `extract` with JSON Schema | `browser_evaluate` with custom JS | [Benchmark extract scenario](https://github.com/browseragentprotocol/benchmarks) |
| **Fused operations** | navigate+observe, act+pre/postObserve in 1 call | Not available | [BAP protocol spec](../packages/protocol) |
| **Response tiers** | full / interactive / minimal | Not available | [BAP protocol spec](../packages/protocol) |
| **WebMCP discovery** | `discover_tools` + observe integration | Not available | [BAP MCP source](../packages/mcp) |
| **Per-call latency** | +50–200ms (WebSocket overhead) | Lower (single-process) | [Benchmark fairness notes](https://github.com/browseragentprotocol/benchmarks#fairness-notes) |
| **Form filling** | `act` composite (N fills + click = 1 call) | `browser_fill_form` (batches fills, separate click) | [Benchmark form scenario](https://github.com/browseragentprotocol/benchmarks) |

---

## Benchmark Results

All data from the [reproducible benchmark suite](https://github.com/browseragentprotocol/benchmarks). Clone the repo and run `./run.sh` to reproduce.

### Methodology

- Both servers spawned via `StdioClientTransport` — identical to how any MCP client connects
- **Real websites** (saucedemo.com, books.toscrape.com, etc.), not synthetic test pages
- **No LLM involved** — measures raw MCP tool efficiency, not prompt quality
- Each scenario: 1 warmup run (excluded) + N measured runs, median selected
- Token estimation: `ceil(responsePayloadBytes / 4)`
- All tool calls timed with `performance.now()`

### Results

| Scenario | Site | BAP Calls | Playwright Calls | Δ | What BAP Does |
|----------|------|-----------|-----------------|---|---------------|
| baseline | quotes.toscrape.com | 2 | 2 | — | Equivalent (navigate + screenshot) |
| extract | books.toscrape.com | 2 | 2 | Token story | `extract` with JSON Schema vs `browser_evaluate` with custom JS |
| form | the-internet.herokuapp.com | 3 | 5 | 40% fewer calls | `act` batches fill+fill+click in 1 call |
| observe | news.ycombinator.com | 2 | 2 | Output story | Structured elements vs raw accessibility tree |
| **ecommerce** | **saucedemo.com** | **3** | **11** | **73% fewer calls** | **7 steps batched in 1 `act` call** |
| workflow | books.toscrape.com | 4 | 5 | 20% fewer calls | `extract` eliminates a snapshot step |

Source: [`src/scenarios/`](https://github.com/browseragentprotocol/benchmarks/tree/main/src/scenarios) in the benchmarks repo.

### Fairness — Read This

These benchmarks are designed to be honest, not promotional. Important caveats:

- **Latency favors Playwright.** BAP's two-process architecture adds ~50–200ms WebSocket overhead per call. Playwright MCP is consistently faster on wall-clock time per call.

- **Token estimation is approximate.** `ceil(bytes / 4)` is a rough heuristic. Screenshots inflate counts due to base64 encoding.

- **Playwright call counts are optimistic.** All tool arguments are pre-written (no LLM). In real agent flows, Playwright would need additional `browser_snapshot` calls for the LLM to decide what to do — increasing its actual call count.

- **BAP `extract` uses heuristics.** Playwright's `browser_evaluate` runs precise DOM queries and may return more accurate results. The extract scenario compares tool efficiency, not extraction accuracy.

- **Playwright uses its most efficient tools.** Each scenario uses `browser_fill_form` for batched fills and `browser_evaluate` for direct JS extraction. We do not artificially inflate Playwright's call counts.

---

## CLI Comparison

| Dimension | BAP CLI | Playwright CLI | Source |
|-----------|---------|----------------|--------|
| **Commands** | 23 | ~70+ (granular: individual storage, network, DevTools cmds) | [BAP CLI docs](../packages/cli), [Playwright CLI README](https://github.com/microsoft/playwright-cli) |
| **Composite actions** | `bap act fill:...=val click:...` (N steps, 1 cmd) | Individual commands | CLI docs |
| **Semantic selectors** | `role:button:"Submit"`, `label:"Email"` | Accessibility tree refs (`e<N>`) | CLI docs |
| **Observation** | `bap observe --tier=interactive` (tiered output) | `playwright-cli snapshot` (full tree) | CLI docs |
| **Extraction** | `bap extract --fields="title,price"` | `playwright-cli eval` (manual JS) | CLI docs |
| **SKILL.md** | Yes (CLI + MCP variants) | Yes (`--install-skills`) | Package repos |
| **Token efficiency** | Composite actions + response tiers | _"Token-efficient. Does not force page data into LLM."_ (official README — no specific numbers) | [Playwright CLI README](https://github.com/microsoft/playwright-cli) |
| **Platform support** | 13 platforms via `bap install-skill` | Claude Code, GitHub Copilot | Package READMEs |

> **Note on third-party claims:** Some blogs cite specific token reduction numbers for Playwright CLI (e.g., "4x fewer tokens"). These numbers are **not in Microsoft's official README** and we do not cite them here. Microsoft's official claim is: _"Token-efficient. Does not force page data into LLM."_

For a detailed command-by-command mapping between Playwright CLI and BAP CLI, see the [migration guide](../packages/cli/skills/bap-browser/references/MIGRATION.md).

---

## What Should You Use?

### Coding agent (Claude Code, Codex, Gemini CLI, Cursor, etc.)?

**→ BAP CLI** with `bap install-skill`

Why: Composite `bap act` batches multi-step flows into one shell command. Semantic selectors (`role:button:"Submit"`) survive page redesigns. Structured `bap extract --fields="title,price"` eliminates writing custom JS. SKILL.md for 13 platforms.

Alternative: Playwright CLI for simple single-action interactions where composite batching isn't needed.

### MCP-native agent (Claude Desktop, custom MCP client)?

**→ BAP MCP** (`npx @browseragentprotocol/mcp`)

Why: `act` batches steps, `observe` returns structured elements with refs, fused operations (navigate+observe, act+postObserve) cut roundtrips. `extract` with JSON Schema for structured data.

Alternative: Playwright MCP if per-call latency matters more than total call count, or if you're already embedded in the Playwright testing ecosystem.

### Need CLI + MCP access to the same browser?

**→ BAP** — shared server architecture. The CLI daemon and MCP bridge connect to the same Playwright server. Observations, element refs, and cookies persist across both interfaces.

Playwright MCP and Playwright CLI are separate processes with no shared state.

### Already deep in the Playwright testing ecosystem?

**→ Playwright MCP** is the zero-friction add-on for your existing Playwright setup. If you already use Playwright for testing, adding the MCP server requires no new dependencies.

---

### The Bottom Line

BAP and Playwright use the same engine (Playwright). BAP adds an AI-optimized layer: composite actions, semantic selectors, structured extraction, and fused operations. For agents that do more than click one button at a time, BAP reduces roundtrips, tokens, and complexity.

---

## Getting Started

### CLI — For coding agents

```bash
npm i -g @browseragentprotocol/cli
bap install-skill   # Auto-detects your agent platform, installs SKILL.md
```

### MCP — For protocol-native agents

```bash
npx @browseragentprotocol/mcp
```

### Plugin — For Claude Code

```
/install-plugin https://github.com/browseragentprotocol/bap
```

---

*Last updated: Feb 2026. All star counts, tool counts, and benchmark data verified at time of writing. Run the [benchmark suite](https://github.com/browseragentprotocol/benchmarks) to reproduce.*
