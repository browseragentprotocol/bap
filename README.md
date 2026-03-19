# Browser Agent Protocol (BAP)

Give your coding agent a real browser that feels fast, semantic, and reliable.

BAP is the browser layer for Codex, Claude Code, and other AI agents. It keeps
a real browser session warm, observes pages in an AI-friendly way, and lets
agents act with semantic selectors and fused operations instead of brittle CSS
and endless roundtrips.

<p align="center">
  <img src="./assets/demos/blog-reader.gif" alt="BAP navigating piyushvyas.com, clicking through to a blog post, and scrolling through it" width="960" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@browseragentprotocol/cli">CLI</a> •
  <a href="https://www.npmjs.com/package/@browseragentprotocol/mcp">MCP</a> •
  <a href="https://pypi.org/project/browser-agent-protocol/">Python</a> •
  <a href="./packages/cli/README.md">Docs</a> •
  <a href="./LICENSE">Apache-2.0</a>
</p>

## Start Here

For most users, the best setup is `CLI + SKILL.md`.

```bash
npm i -g @browseragentprotocol/cli
bap install-skill
```

Then ask your agent something like:

```text
Use BAP to open https://piyushvyas.com, click on "Writing", find the
"Introducing Browser Agent Protocol" blog post, read through it, and
give me a summary of what BAP is.
```

If you just installed the skill, start a fresh Claude/Codex session so it
reloads the BAP guidance.

## Why Developers Try BAP

- **Real browser workflow:** BAP prefers installed Chrome, keeps session state warm, and stays close to a normal user browser instead of starting from scratch on every command.
- **Better selectors:** use `role:button:"Submit"` and `label:"Email"` instead of brittle CSS.
- **Fewer roundtrips:** `goto --observe`, `act --observe`, stable refs, and structured extraction cut tool chatter.
- **Sticky agent experience:** the browser daemon stays warm across commands, so agents keep momentum instead of constantly reopening tabs and re-observing the world.
- **Multiple surfaces:** start with the CLI, use MCP when your platform wants tools, and drop to TypeScript or Python SDKs when you want to embed BAP in your own stack.

## What It Looks Like

<p align="center">
  <img src="./assets/demos/skill-scorer.gif" alt="BAP fetching a SKILL.md from GitHub, pasting it into skills.menu, and scoring it" width="960" />
</p>

## Quick Example — Read a Blog Post

```bash
# Open a website and observe the page
bap goto https://piyushvyas.com --observe

# Navigate to the Writing section
bap act click:text:"Writing" --observe

# Open the blog post about BAP
bap act click:text:"Introducing Browser Agent Protocol" --observe

# Scroll through and extract the content
bap scroll down --pixels=5000
bap extract --fields="title,content"
```

## Smooth First Run

- `CLI + SKILL.md` is the default path for Claude Code, Codex, and other coding agents that can run shell commands.
- BAP prefers headful Chrome and a persistent session by default.
- Use `--headless` for CI or background runs.
- Use `--no-profile` if your normal Chrome profile is busy.
- Use `--profile <dir>` for a dedicated long-lived automation profile with cookies and state.
- Use `bap close-all` when you want to stop the daemon and browser sessions completely.

## Choose Your Interface

- **CLI + SKILL.md:** the main path and the best place to start.
- **MCP:** the second choice for tool-native clients that prefer an MCP server.
- **TypeScript SDK:** for apps, agent backends, and custom integrations.
- **Python SDK:** for notebooks, backend jobs, and Python agents.

Need MCP instead of shell commands?

```bash
npx -y @browseragentprotocol/mcp
```

Need SDKs?

```bash
npm install @browseragentprotocol/client
pip install browser-agent-protocol
```

## Try the Repo Demo

- [Blog reader demo](./examples/blog-reader/README.md)

Quick run from the repo:

```bash
npx pnpm install
npx pnpm build
./examples/blog-reader/run-demo.sh
```

This navigates to piyushvyas.com, finds the BAP blog post, reads through it,
and saves screenshots and extracted content to `.bap/demo/blog-reader/`.

## Against Other Browser Tools

- **Against Playwright CLI:** BAP is built for agent workflows, not just human shell scripting.
- **Against Playwright MCP:** when shell access is available, BAP CLI can solve the same job with fewer agent roundtrips.
- **Against Chrome DevTools/CDP:** CDP is the low-level browser transport; BAP is the higher-level agent layer on top.

## Docs

- [CLI documentation](./packages/cli/README.md)
- [MCP documentation](./packages/mcp/README.md)
- [TypeScript SDK documentation](./packages/client/README.md)
- [Python SDK documentation](./packages/python-sdk/README.md)
- [Browser automation decision guide](./docs/browser-tools-guide.md)
- [BAP and WebMCP comparison](./docs/webmcp-comparison.md)

## For Maintainers

- [Release automation guide](./docs/releasing.md)
- [Contributing](./CONTRIBUTING.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)

## License

Code in this repo is Apache-2.0. Some bundled assets and documentation have
additional notices described in [LICENSE](./LICENSE).
