# Blog Reader Demo

A real-world BAP demo: navigate to [piyushvyas.com](https://piyushvyas.com),
find the "Introducing Browser Agent Protocol" blog post, read it, and summarize
it — all from the command line.

This showcases the core BAP workflow: navigate, observe, click, scroll, extract.

## Prerequisites

- Node.js 20+
- `npx pnpm install`
- `npx pnpm build`

## Run it

```bash
./examples/blog-reader/run-demo.sh
```

If this is a clean machine without Playwright browsers installed yet:

```bash
npx playwright install chromium
```

The script writes artifacts to `.bap/demo/blog-reader/` by default:

- `homepage.png` — screenshot of the homepage
- `writing.png` — the Writing page with blog posts
- `article.png` — the BAP blog post
- `article-content.txt` — extracted article text

You can override the output folder:

```bash
./examples/blog-reader/run-demo.sh /tmp/bap-blog-demo
```

## Use it with published packages

Same flow without cloning the repo:

```bash
npx -y @browseragentprotocol/cli -s=blog --browser=chromium --headless open https://piyushvyas.com
npx -y @browseragentprotocol/cli -s=blog observe
npx -y @browseragentprotocol/cli -s=blog act click:text:"Writing" --observe
npx -y @browseragentprotocol/cli -s=blog act click:text:"Introducing Browser Agent Protocol" --observe
npx -y @browseragentprotocol/cli -s=blog scroll down --pixels=5000
npx -y @browseragentprotocol/cli -s=blog extract --fields="title,content"
npx -y @browseragentprotocol/cli -s=blog close
```

## Copy-paste agent prompt

Give your coding agent this task:

```text
Use BAP to read a blog post about the Browser Agent Protocol.

1. Open https://piyushvyas.com
2. Click on "Writing" to go to the blog
3. Find and click "Introducing Browser Agent Protocol"
4. Scroll through the article to the end
5. Extract the article content and give me a summary of what BAP is and why it matters
```

## Why this demo works well

- It uses a real public website with no login required
- It exercises navigation, clicking, scrolling, observation, and extraction
- It tells a story: discovering a blog post, reading it, and summarizing it
- It demonstrates BAP doing useful work, not just mechanical page interaction
