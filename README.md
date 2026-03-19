# Browser Agent Protocol (BAP)

Give your AI agent a real browser — fast, semantic, and reliable.

BAP keeps a browser session warm, observes pages in an AI-friendly way,
and lets agents act with semantic selectors and fused operations instead
of brittle CSS and endless roundtrips.

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

## Get Started

```bash
npm i -g @browseragentprotocol/cli
bap install-skill
```

Then give your agent a task:

```text
Use BAP to open https://piyushvyas.com, go to Writing, find the
"Introducing Browser Agent Protocol" post, and summarize it.
```

Start a fresh agent session after installing the skill so it picks up
the BAP guidance.

## Why BAP

|                        |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| **Real browser**       | Prefers installed Chrome, keeps session state warm, stays close to a normal user browser |
| **Semantic selectors** | `role:button:"Submit"` and `label:"Email"` instead of brittle CSS                        |
| **Fewer roundtrips**   | `goto --observe`, `act --observe`, stable refs, and structured extraction                |
| **Warm daemon**        | Browser stays alive across commands — agents keep momentum                               |
| **Multiple surfaces**  | CLI, MCP, TypeScript SDK, Python SDK — pick what fits your stack                         |

## See It in Action

<p align="center">
  <img src="./assets/demos/skill-scorer.gif" alt="BAP browsing GitHub to find a SKILL.md, then scoring it on skills.menu" width="960" />
  <br/>
  <em>Multi-site workflow: browse GitHub → open skills.menu → paste &amp; score</em>
</p>

## Quick Example

```bash
# Navigate and observe the page
bap goto https://piyushvyas.com --observe

# Click through to a blog post
bap act click:text:"Writing" --observe
bap act click:text:"Introducing Browser Agent Protocol" --observe

# Scroll and extract
bap scroll down --pixels=5000
bap extract --fields="title,content"
```

## Interfaces

| Interface          | Install                              | Best for                        |
| ------------------ | ------------------------------------ | ------------------------------- |
| **CLI + SKILL.md** | `npm i -g @browseragentprotocol/cli` | Coding agents with shell access |
| **MCP**            | `npx -y @browseragentprotocol/mcp`   | Tool-native MCP clients         |
| **TypeScript SDK** | `npm i @browseragentprotocol/client` | Apps and agent backends         |
| **Python SDK**     | `pip install browser-agent-protocol` | Notebooks and Python agents     |

## Tips

- BAP defaults to headful Chrome with a persistent session.
- Use `--headless` for CI or background runs.
- Use `--no-profile` if your Chrome profile is busy.
- Use `bap close-all` to stop the daemon and all sessions.

## Against Other Tools

- **vs Playwright CLI** — BAP is built for agent workflows, not human shell scripting.
- **vs Playwright MCP** — When shell access is available, BAP CLI solves the same job with fewer roundtrips.
- **vs Chrome DevTools / CDP** — CDP is the low-level transport; BAP is the agent layer on top.

## Docs

- [CLI](./packages/cli/README.md)
- [MCP](./packages/mcp/README.md)
- [TypeScript SDK](./packages/client/README.md)
- [Python SDK](./packages/python-sdk/README.md)
- [Browser tools decision guide](./docs/browser-tools-guide.md)
- [BAP and WebMCP comparison](./docs/webmcp-comparison.md)

## Contributing

- [Release automation](./docs/releasing.md)
- [Contributing guide](./CONTRIBUTING.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.
