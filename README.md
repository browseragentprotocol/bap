# Browser Agent Protocol (BAP)

[![CI](https://github.com/browseragentprotocol/bap/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/browseragentprotocol/bap/actions/workflows/ci.yml)
[![npm: CLI](https://img.shields.io/npm/v/@browseragentprotocol/cli)](https://www.npmjs.com/package/@browseragentprotocol/cli)
[![npm: MCP](https://img.shields.io/npm/v/@browseragentprotocol/mcp)](https://www.npmjs.com/package/@browseragentprotocol/mcp)
[![PyPI](https://img.shields.io/pypi/v/browser-agent-protocol)](https://pypi.org/project/browser-agent-protocol/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Semantic browser control for AI agents.

BAP gives you a production-minded browser stack for agents: a shell CLI, an
MCP server, a TypeScript SDK, and a Python SDK on top of a Playwright-backed
runtime. It is built for semantic selectors, composite actions, structured
extraction, persistent browser sessions, and fewer agent roundtrips.

```bash
# Primary path: CLI + SKILL.md for coding agents
npm i -g @browseragentprotocol/cli
bap install-skill
bap open https://news.ycombinator.com
bap observe --max=12
bap act click:role:link:"new" --observe

# Secondary path: MCP for protocol-native agents
npx @browseragentprotocol/mcp
```

## Why BAP

- **Semantic selectors:** use `role:button:"Submit"` and `label:"Email"` instead of brittle CSS.
- **Composite actions:** batch multi-step flows into a single `act` call or command.
- **AI-friendly observation:** accessibility-first snapshots, stable refs, and structured extraction.
- **CLI-first for coding agents:** the default path is shell commands plus `SKILL.md`, not a giant tool list.
- **Persistent real-browser workflow:** BAP CLI prefers installed Chrome, starts headful by default, keeps a long-lived daemon, and reuses browser state across commands.
- **Multiple surfaces:** ship the same mental model through CLI, MCP, TypeScript, and Python.
- **Measured efficiency:** verified benchmark docs show up to 27% fewer tool calls than Playwright MCP in standard flows and up to 55% fewer with fused operations. See [docs/browser-tools-guide.md](./docs/browser-tools-guide.md).

## Recommended Adoption Order

| Surface | Package | Best for |
| --- | --- | --- |
| CLI + SKILL.md | [`@browseragentprotocol/cli`](./packages/cli) | the main path for coding agents that can run shell commands |
| MCP | [`@browseragentprotocol/mcp`](./packages/mcp) | the second option for protocol-native clients that prefer MCP tools |
| TypeScript SDK | [`@browseragentprotocol/client`](./packages/client) | custom agent backends and app integrations |
| Playwright server | [`@browseragentprotocol/server-playwright`](./packages/server-playwright) | running the browser runtime directly |
| Protocol types | [`@browseragentprotocol/protocol`](./packages/protocol) | shared schemas, selectors, and errors |
| Python SDK | [`browser-agent-protocol`](./packages/python-sdk) | Python agents, notebooks, backend jobs |

## Quick Start

### CLI

```bash
npm i -g @browseragentprotocol/cli
bap install-skill
bap open https://example.com
bap observe --max=20
bap act fill:role:textbox:"Email"="user@example.com" \
        fill:role:textbox:"Password"="secret" \
        click:role:button:"Sign in"
```

This is the recommended production setup for most users: the CLI does the
browser work, and `bap install-skill` installs the BAP `SKILL.md` guidance so
coding agents use better defaults for observation, selectors, and composite
actions.

By default, BAP CLI prefers installed Chrome, runs headful, and reuses a
persistent session so agents stay close to a normal user browser workflow
instead of spinning up a fresh browser on every command. Use `--headless` for
CI or background automation. If you need a dedicated automation profile, use
`--profile <dir>` or `--no-profile`. Chrome can restrict direct automation of a
live default profile, so a dedicated profile directory is the most reliable
production setup.

### MCP

Use MCP when your agent platform prefers native tool transport over shell
commands.

Run standalone:

```bash
npx -y @browseragentprotocol/mcp
```

Or add it to any MCP-compatible client:

```json
{
  "mcpServers": {
    "bap-browser": {
      "command": "npx",
      "args": ["-y", "@browseragentprotocol/mcp"]
    }
  }
}
```

### SDKs

```bash
npm install @browseragentprotocol/client
pip install browser-agent-protocol
```

```ts
import { BAPClient, role } from "@browseragentprotocol/client";

const client = new BAPClient("ws://localhost:9222");
await client.connect();
await client.launch({ browser: "chromium", headless: true });
await client.createPage({ url: "https://example.com" });
await client.click(role("button", "Submit"));
await client.close();
```

```python
import asyncio
from browseragentprotocol import BAPClient, role

async def main() -> None:
    async with BAPClient("ws://localhost:9222") as client:
        await client.launch(browser="chromium", headless=True)
        await client.create_page(url="https://example.com")
        await client.click(role("button", "Submit"))

asyncio.run(main())
```

## Demo

Use the repo-local Hacker News demo for launch videos, smoke tests, and README
walkthroughs:

- [Examples index](./examples/README.md)
- [Hacker News CLI demo](./examples/hacker-news-cli/README.md)

Quick run:

```bash
npx pnpm install
npx pnpm build
./examples/hacker-news-cli/run-cli-demo.sh
```

This writes an observation, screenshot, and accessibility snapshot to
`.bap/demo/hacker-news/`.

If you are on a fresh machine without Playwright browsers yet, install Chromium
once with `npx playwright install chromium`.

## Integrations

- `bap install-skill` is the main recommended setup and installs or updates BAP guidance for 13 AI coding-agent surfaces.
- The MCP package is the second recommended setup for Claude Code, Claude Desktop, Codex, Gemini CLI, and other MCP clients.
- BAP can discover WebMCP tools when websites expose them, then fall back to browser automation when they do not. See [docs/webmcp-comparison.md](./docs/webmcp-comparison.md).

## Positioning

- **Against Playwright CLI:** BAP CLI is optimized for coding agents, not just human shell users. `bap act`, `bap observe`, `bap extract`, and response tiers reduce tool chatter and keep prompts smaller.
- **Against Playwright MCP:** BAP favors fewer roundtrips and better agent ergonomics over raw per-call latency. When an agent can run shell commands, `CLI + SKILL.md` is the primary recommendation.
- **Against Chrome DevTools:** DevTools/CDP is the low-level browser control plane. BAP is the agent layer on top: semantic selectors, structured extraction, fused operations, and shared browser state.

## Production Readiness

- **Automated CI:** Node 20/22 validation, cross-platform CLI/MCP smoke tests, npm tarball auditing, and Python build validation in GitHub Actions.
- **Automated releases:** Changesets release PRs, GitHub Releases, npm publication with provenance enabled, and PyPI publication with registry verification.
- **Artifact hygiene:** published packages now ship `README.md`, `CHANGELOG.md`, and `LICENSE`.
- **Security docs:** responsible disclosure process is documented in [SECURITY.md](./SECURITY.md).
- **Public repo hygiene:** issue templates, pull request template, Dependabot, contributing guide, and code of conduct are included.

## Docs

- [CLI documentation](./packages/cli/README.md)
- [MCP documentation](./packages/mcp/README.md)
- [TypeScript SDK documentation](./packages/client/README.md)
- [Python SDK documentation](./packages/python-sdk/README.md)
- [Browser automation decision guide](./docs/browser-tools-guide.md)
- [BAP and WebMCP comparison](./docs/webmcp-comparison.md)
- [Release automation guide](./docs/releasing.md)

## Monorepo Packages

### TypeScript

| Package | Description |
| --- | --- |
| [`@browseragentprotocol/cli`](./packages/cli) | CLI for shell-based AI agents |
| [`@browseragentprotocol/mcp`](./packages/mcp) | MCP server for protocol-native agents |
| [`@browseragentprotocol/client`](./packages/client) | TypeScript client SDK |
| [`@browseragentprotocol/server-playwright`](./packages/server-playwright) | Playwright-backed BAP server |
| [`@browseragentprotocol/protocol`](./packages/protocol) | Protocol types, schemas, selectors, errors |
| [`@browseragentprotocol/logger`](./packages/logger) | Shared logger utilities |

### Python

| Package | Description |
| --- | --- |
| [`browser-agent-protocol`](./packages/python-sdk) | Async and sync Python SDK for BAP |

## Contributing

Start with [CONTRIBUTING.md](./CONTRIBUTING.md). For community expectations, see
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

Code in this repo is Apache-2.0. Some bundled assets and documentation have
additional notices described in [LICENSE](./LICENSE).
