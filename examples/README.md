# Examples

Runnable BAP examples for learning, demos, and local sanity checks.

## Available examples

- [`hacker-news-cli`](./hacker-news-cli/README.md): a fast CLI demo that opens
  Hacker News, captures an AI-friendly observation, writes a screenshot, and
  saves an accessibility snapshot.
- [`launch-feedback-agent`](./launch-feedback-agent/README.md): a browser
  research workflow where an AI coding agent reviews a discussion thread,
  collects evidence, and writes a report.

## Running examples from the repo

1. Install workspace dependencies: `npx pnpm install`
2. Build the packages: `npx pnpm build`
3. Follow the example-specific README

If you want to run the same flows from published packages instead of the local
workspace build, swap the local `node packages/.../dist/...` commands for the
equivalent `npx -y @browseragentprotocol/...` commands shown in each example.
