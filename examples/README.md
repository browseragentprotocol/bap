# Examples

These examples are designed for launch demos, onboarding, and release-smoke
validation.

## Available examples

- [`hacker-news-cli`](./hacker-news-cli/README.md): a fast CLI demo that opens
  Hacker News, captures an AI-friendly observation, writes a screenshot, and
  saves an accessibility snapshot.

## Running examples from the repo

1. Install workspace dependencies: `npx pnpm install`
2. Build the packages: `npx pnpm build`
3. Follow the example-specific README

If you want to run the same flows from published packages instead of the local
workspace build, swap the local `node packages/.../dist/...` commands for the
equivalent `npx -y @browseragentprotocol/...` commands shown in each example.
