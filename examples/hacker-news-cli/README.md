# Hacker News CLI Demo

This is the fastest repo-local demo for BAP launch videos, README walkthroughs,
and smoke validation. It shows the core user story:

1. Start a clean browser session
2. Open a real public website
3. Capture an AI-friendly observation
4. Save a screenshot and accessibility snapshot

## Prerequisites

- Node.js 20+
- `npx pnpm install`
- `npx pnpm build`

## Run it

```bash
./examples/hacker-news-cli/run-cli-demo.sh
```

If this is a clean machine without Playwright browsers installed yet, run this
once first:

```bash
npx playwright install chromium
```

The script writes artifacts to `.bap/demo/hacker-news/` by default:

- `observe.txt`
- `hacker-news.png`
- `hacker-news.yaml`

You can override the output folder:

```bash
./examples/hacker-news-cli/run-cli-demo.sh /tmp/bap-hn-demo
```

## Use it with published packages

If you want the exact same flow without cloning the repo, these are the
equivalent commands:

```bash
npx -y @browseragentprotocol/cli -s=hn-demo --browser=chromium --no-profile --headless open https://news.ycombinator.com
npx -y @browseragentprotocol/cli -s=hn-demo observe --max=12
npx -y @browseragentprotocol/cli -s=hn-demo screenshot --file=.bap/demo/hacker-news/hacker-news.png
npx -y @browseragentprotocol/cli -s=hn-demo snapshot --file=.bap/demo/hacker-news/hacker-news.yaml
npx -y @browseragentprotocol/cli -s=hn-demo close
```

## Why this demo works well

- It uses a stable, public site that does not require credentials
- It exercises both observation and artifact generation
- It produces assets that are easy to show in README screenshots or a video
