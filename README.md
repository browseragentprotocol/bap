# Browser Agent Protocol (BAP)

The execution layer for browser agents: fast execution, structured observations, session persistence, and coherent CLI/MCP/SDK surfaces.

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

BAP keeps the intelligence above the browser layer. Your agent decides what to
do; BAP executes it quickly, returns structured state, and keeps the session
warm across turns and interfaces.

The current benchmark suite shows BAP Standard using about **15% fewer tool
calls** than Playwright in an apples-to-apples workflow, and BAP Fused reaching
about **37% fewer** on covered scenarios. See the
[browser tools decision guide](./docs/browser-tools-guide.md) for the
methodology and caveats.

**BAP is for teams that want to control the intelligence.** You bring the LLM, BAP brings the browser.

## What BAP gives your agent

| | Without BAP | With BAP |
|---|---|---|
| **What the LLM sees** | Raw HTML (10,000+ tokens) | `@submit button: "Submit"`, `@email textbox: "Email"` (50 tokens) |
| **Browser execution loop** | Repeated raw DOM/tool hops | Structured actions and observations |
| **Session state** | Lost between turns | Persisted — browser stays warm |
| **When selectors break** | Agent fails | Self-healing via uSEID fallback |
| **Across interfaces** | Separate browser state per surface | One coherent CLI/MCP/SDK/server model |

## Get Started

```bash
npm i -g @browseragentprotocol/cli
bap doctor
bap status
bap demo
bap install-skill
```

Or run `bap demo` for a guided walkthrough.

Then give your agent a task:

```text
Use BAP to open https://example.com, find the pricing page, and extract the plan names and prices.
```

## What's in the 1.0 line

- **Execution cockpit UX** — `doctor`, `status`, session visibility, handoff/resume, and story-first traces
- **Structured browser execution** — semantic selectors, fused actions, and compact observations
- **Trust surfaces** — approval modes, risk classes, domain visibility, and redaction posture
- **Cross-interface coherence** — aligned CLI, MCP, TS SDK, Python SDK, and server behavior

## Choose your starting point

| If you are... | Start here |
|---|---|
| Evaluating BAP quickly | `bap demo` then `bap goto <url> --observe` |
| Building an agent with shell access | [CLI docs](./packages/cli/README.md) |
| Building an MCP-native agent | [MCP docs](./packages/mcp/README.md) |
| Embedding BAP in a TypeScript app | [TypeScript SDK docs](./packages/client/README.md) |
| Embedding BAP in a Python agent/notebook | [Python SDK docs](./packages/python-sdk/README.md) |

## Operator workflow

```bash
# Check first-run/browser readiness
bap doctor

# Confirm lifecycle, approval mode, domains, and redaction posture
bap status

# Navigate and get structured state
bap goto https://example.com --observe

# Preview trust/risk before a mutating flow
bap act --explain click:e3

# Execute and keep an audit trail
bap act --audit click:e3 --observe

# Hand off to a human if needed, then resume with a delta-first view
bap handoff "CAPTCHA"
bap resume

# Read task/story summaries before raw request traces
bap trace
```

## Quick Example

```bash
# Navigate and observe — one fused call
bap goto https://example.com --observe

# After a small DOM change, observe only the diff
bap observe --diff

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
- **Cross-interface coherence** — one execution model across CLI, MCP, SDKs, and the Playwright server

## Interfaces

| Interface | Install | Best for |
|---|---|---|
| **MCP (in-process)** | `npx @browseragentprotocol/mcp --in-process` | Fastest — 10-25ms/action, zero WebSocket overhead |
| **MCP (standalone)** | `npx @browseragentprotocol/mcp` | Standard MCP-native agent clients |
| **CLI + SKILL.md** | `npm i -g @browseragentprotocol/cli` | Coding agents with shell access |
| **TypeScript SDK** | `npm i @browseragentprotocol/client` | Apps and agent backends |
| **Python SDK** | `pip install browser-agent-protocol` | Python agents and notebooks |

## Benchmark

Measured on real sites with the reproducible benchmark suite in
[`browseragentprotocol/benchmarks`](https://github.com/browseragentprotocol/benchmarks):

| Scenario | BAP Standard | BAP Fused | Playwright |
|---|:---:|:---:|:---:|
| baseline | 2 | 2 | 2 |
| observe | 2 | 1 | 2 |
| extract | 2 | 2 | 2 |
| form | 4 | 3 | 5 |
| ecommerce | 8 | 5 | 11 |
| workflow | 5 | 4 | 5 |
| **Total** | **23** | **17** | **27** |

BAP Standard is the fair comparison. BAP Fused shows what happens when you use
its optimization layer (`navigate --observe`, `act --observe`, and semantic
selectors without a prior observe). See the
[browser tools decision guide](./docs/browser-tools-guide.md) for the full
methodology, limitations, and where Playwright still wins.

## When to use what

| Use case | Recommendation |
|---|---|
| **Known workflows on known sites** (scraping, testing, data entry) | BAP MCP or Playwright — you know the selectors, AI per-action adds no value |
| **Agent on unfamiliar sites** (find pricing, navigate docs) | BAP for execution + your LLM for planning. Structured observations make the LLM cheaper and more accurate |
| **Don't want to build the planning layer** | Use a higher-level browser agent stack; BAP is the execution layer, not the planner |
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
- Run `bap doctor` before the first real task to verify browser/profile readiness.
- Run `bap status` any time you need to confirm session lifecycle, active page, or handoff state.
- Use `bap act --explain ...` to preview approval mode, domain/redaction posture, and risk classes before a mutating sequence.
- Use `bap act --audit ...` when you want a step-by-step audit trail after execution.
- Use `--headless` for CI or background runs.
- If the auto-detected Chrome profile is busy, BAP retries without it. Use `--no-profile` for a guaranteed fresh browser.
- Use `bap handoff "CAPTCHA"` to hand a session to a human, then `bap resume` to continue automation.
- Use `--slim` mode to cut tool definitions to ~600 tokens (vs ~4,200 for Playwright MCP).
- Use `bap close-all` to stop the daemon and all sessions.

## Docs

- [CLI](./packages/cli/README.md)
- [MCP](./packages/mcp/README.md)
- [TypeScript SDK](./packages/client/README.md)
- [Python SDK](./packages/python-sdk/README.md)
- [Browser tools decision guide](./docs/browser-tools-guide.md)
- [Release automation](./docs/releasing.md)
- [Release readiness checklist](./docs/release-readiness-checklist.md)
- [Monorepo changelog / 1.0 release notes](./CHANGELOG.md)

## Contributing

- [Contributing guide](./CONTRIBUTING.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
