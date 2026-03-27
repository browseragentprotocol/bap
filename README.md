# Browser Agent Protocol (BAP)

The execution layer for browser agents. 10-25ms per action, zero token overhead, structured observations your LLM can actually use.

BAP sits between your AI agent and the browser. The agent decides *what* to do, BAP does it — instantly, reliably, with semantic selectors and session persistence.

<p align="center">
  <img src="./assets/demos/blog-reader.gif" alt="BAP navigating a website, clicking through pages, and scrolling through a blog post" width="960" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@browseragentprotocol/cli"><strong>CLI</strong></a> &nbsp;·&nbsp;
  <a href="https://www.npmjs.com/package/@browseragentprotocol/mcp"><strong>MCP</strong></a> &nbsp;·&nbsp;
  <a href="https://pypi.org/project/browser-agent-protocol/"><strong>Python</strong></a> &nbsp;·&nbsp;
  <a href="./packages/cli/README.md"><strong>Docs</strong></a> &nbsp;·&nbsp;
  <a href="./LICENSE"><strong>Apache-2.0</strong></a>
</p>

---

## Why BAP

Every browser action in your agent pipeline has a cost — latency, tokens, and dollars.

```
                  per action    per 20-action task    1000 tasks/day
Stagehand          800ms, $0.01      $0.20                 $200
Browser Use       1500ms, $0.02      $0.40                 $400
BAP (in-process)    20ms, $0.00      $0.00                   $0
```

Stagehand and Browser Use send every click and fill through an LLM. BAP doesn't — your agent's LLM decides the action, BAP executes it directly via Playwright. The LLM call happens once (in your agent), not per-action (in the browser layer).

**BAP is for teams that want to control the intelligence.** You bring the LLM, BAP brings the browser.

## What BAP gives your agent

| | Without BAP | With BAP |
|---|---|---|
| **What the LLM sees** | Raw HTML (10,000+ tokens) | `@submit button: "Submit"`, `@email textbox: "Email"` (50 tokens) |
| **Latency per action** | 800-1500ms (LLM in the loop) | 10-25ms (direct execution) |
| **Session state** | Lost between turns | Persisted — browser stays warm |
| **When selectors break** | Agent fails | Self-healing via uSEID fallback |
| **Reproducibility** | Non-deterministic | DBAR deterministic replay |

## Get Started

```bash
npm i -g @browseragentprotocol/cli
bap install-skill
```

Or run `bap demo` for a guided walkthrough.

Then give your agent a task:

```text
Use BAP to open https://example.com, find the pricing page, and extract the plan names and prices.
```

## Quick Example

```bash
# Navigate and observe — one fused call
bap goto https://example.com --observe

# Agent sees structured output:
#   @navPricing link: "Pricing"
#   @heroSignup button: "Get Started"
#   @searchInput textbox: "Search..."

# Agent decides to click pricing — BAP executes in 15ms
bap act click:@navPricing --observe

# Extract structured data
bap extract --fields="plan,price,features"
```

## How it works

```
Your LLM Agent          ← decides what to do (planning, reasoning)
    ↓
BAP (MCP or CLI)        ← executes it (10-25ms, structured observations)
    ↓
Playwright              ← handles the browser (auto-wait, smart inputs)
    ↓
Chrome/Firefox/WebKit   ← renders the page
```

BAP is a thin protocol layer over Playwright. It adds:

- **Structured observations** — interactive elements with refs, roles, and action hints instead of raw HTML
- **Semantic selectors** — `role:button:"Submit"`, `text:"Sign in"`, `@ref` instead of brittle CSS
- **Fused operations** — `goto --observe` saves a roundtrip, `act --observe` chains action + observation
- **Session persistence** — browser stays alive across agent turns, no re-launching
- **Self-healing selectors (uSEID)** — when elements change between page loads, BAP falls back to semantic identity matching
- **Deterministic replay (DBAR)** — record a browser session, replay it identically for testing and CI

## Interfaces

| Interface | Install | Best for |
|---|---|---|
| **MCP (in-process)** | `npx @browseragentprotocol/mcp --in-process` | Fastest — 10-25ms/action, zero WebSocket overhead |
| **MCP (standalone)** | `npx @browseragentprotocol/mcp` | Standard MCP clients (Claude, Cursor, Codex) |
| **CLI + SKILL.md** | `npm i -g @browseragentprotocol/cli` | Coding agents with shell access |
| **TypeScript SDK** | `npm i @browseragentprotocol/client` | Apps and agent backends |
| **Python SDK** | `pip install browser-agent-protocol` | Python agents and notebooks |

## Benchmark

Measured on real websites (Wikipedia, Hacker News) — [browserbench](https://github.com/pyyush/browserbench):

```
Action           CDP-raw   Playwright   BAP MCP    BAP CLI    PW CLI
─────────────────────────────────────────────────────────────────────
navigate           68ms       593ms       26ms      1490ms     590ms
observe            14ms         7ms        8ms       145ms     591ms
fill                1ms        18ms       13ms       148ms     588ms
extract             0ms         8ms        5ms       164ms     604ms
─────────────────────────────────────────────────────────────────────
tokens/call          0           0         35          155        0
pass rate          100%        100%       100%        100%     100%
```

BAP MCP (in-process) is within 2x of raw CDP and matches Playwright's direct API — while giving your agent structured observations, semantic selectors, and session persistence.

## When to use what

| Use case | Recommendation |
|---|---|
| **Known workflows on known sites** (scraping, testing, data entry) | BAP MCP or Playwright — you know the selectors, AI per-action adds no value |
| **Agent on unfamiliar sites** (find pricing, navigate docs) | BAP for execution + your LLM for planning. Structured observations make the LLM cheaper and more accurate |
| **Don't want to build the planning layer** | Stagehand — bundles LLM + execution, but 40x slower and $200+/day at scale |
| **Complex multi-step goals** | Browser Use — highest abstraction, highest cost |
| **Scale (100+ concurrent browsers)** | Browserbase for infrastructure + BAP for the automation layer |

## See It in Action

<p align="center">
  <img src="./assets/demos/workflow.gif" alt="BAP navigating a bookstore, clicking Travel category, and viewing book details" width="960" />
  <br/>
  <em>Navigate → click → browse: 3 commands, one workflow</em>
</p>

<p align="center">
  <img src="./assets/demos/skill-scorer.gif" alt="BAP browsing GitHub to find a SKILL.md, then scoring it on skills.menu" width="960" />
  <br/>
  <em>Multi-site workflow: browse GitHub → open skills.menu → paste &amp; score</em>
</p>

## Tips

- BAP defaults to headful Chrome with a persistent session.
- Use `--headless` for CI or background runs.
- Use `--no-profile` if your Chrome profile is busy.
- Use `--slim` mode to cut tool definitions to ~600 tokens (vs ~4,200 for Playwright MCP).
- Use `bap close-all` to stop the daemon and all sessions.

## Docs

- [CLI](./packages/cli/README.md)
- [MCP](./packages/mcp/README.md)
- [TypeScript SDK](./packages/client/README.md)
- [Python SDK](./packages/python-sdk/README.md)
- [Browser tools decision guide](./docs/browser-tools-guide.md)

## Contributing

- [Release automation](./docs/releasing.md)
- [Contributing guide](./CONTRIBUTING.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
