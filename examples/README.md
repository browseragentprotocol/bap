# Examples

Runnable BAP examples for learning, demos, and local sanity checks.

## Available examples

- [`blog-reader`](./blog-reader/README.md): navigate to piyushvyas.com, find a
  blog post about the Browser Agent Protocol, read it, and extract a summary —
  showcasing navigation, clicking, scrolling, and extraction in a real workflow.

## Running examples from the repo

1. Install workspace dependencies: `npx pnpm install`
2. Build the packages: `npx pnpm build`
3. Follow the example-specific README

If you want to run the same flows from published packages instead of the local
workspace build, swap the local `node packages/.../dist/...` commands for the
equivalent `npx -y @browseragentprotocol/...` commands shown in each example.
