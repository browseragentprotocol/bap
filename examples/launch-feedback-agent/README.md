# Launch Feedback Agent

This example shows a real browser-automation workflow for a coding agent using
`bap v0.4.0`: review launch feedback after a release, collect evidence from the
browser, and write a concise report.

It is designed for the exact moment after posting on Hacker News, LinkedIn,
GitHub, or docs-driven communities.

## Why this is a good real-world example

- It uses a real browser session, not a synthetic test page.
- It combines navigation, observation, extraction, screenshots, and note-taking.
- It benefits from BAP's persistent sessions, semantic selectors, and fused
  `--observe` flows.
- It maps to a recurring founder/developer workflow: "what is the market saying
  about our launch right now?"

## Best setup

Use the CLI-first path:

```bash
npm i -g @browseragentprotocol/cli
bap install-skill
```

By default, BAP CLI will prefer installed Chrome, run visibly, and try to stay
close to a real-user browser workflow. If you want a dedicated automation
profile instead of your default browser state:

```bash
bap open https://news.ycombinator.com --profile ~/.bap/profiles/launch
```

## Copy-paste agent prompt

Give your coding agent a task like this:

```text
Use BAP CLI to do launch-feedback triage for BAP.

Goals:
1. Review Hacker News for launch-relevant discussion.
2. Capture at least one screenshot and one accessibility snapshot as evidence.
3. Extract the most relevant posts or links I should review.
4. Write a concise markdown report to ./launch-feedback.md.

Constraints:
- Prefer fused BAP calls like `bap goto ... --observe` and `bap act ... --observe`.
- Reuse the same session during the workflow.
- Keep artifacts in ./.bap/launch-feedback/.
- If a page is noisy, use `bap observe --max=...` and semantic selectors instead of CSS.
- Stop with a short summary of what you found and where you saved the artifacts.
```

## What the agent should do

A strong run usually looks like this:

1. Open Hacker News in a named session.
2. Observe the page to find the main navigation and likely links.
3. Visit the most relevant section, such as `new` or a launch-related thread.
4. Capture a screenshot and snapshot for traceability.
5. Extract the titles and links worth reviewing.
6. Save a markdown summary with:
   - what changed
   - what people are responding to
   - links worth opening next
   - any obvious bugs, confusion, or positioning feedback

## Example BAP command sequence

These are the kinds of commands your agent should emit:

```bash
bap -s=launch open https://news.ycombinator.com
bap -s=launch observe --max=12
bap -s=launch act click:role:link:"new" --observe --tier=interactive
bap -s=launch screenshot --file=.bap/launch-feedback/hn.png
bap -s=launch snapshot --file=.bap/launch-feedback/hn.yaml
bap -s=launch extract --fields="title,url"
```

If the agent needs multiple pages or deeper review:

```bash
bap -s=launch tab-new https://news.ycombinator.com/newest
bap -s=launch tabs
bap -s=launch tab-select 1
bap -s=launch observe --max=20
```

## Suggested report shape

Have the agent write something like:

```md
# Launch Feedback

## Highlights
- ...

## Links to review
- ...

## Positioning notes
- ...

## Evidence
- Screenshot: .bap/launch-feedback/hn.png
- Snapshot: .bap/launch-feedback/hn.yaml
```

## Why BAP helps here

- `bap observe` gives the agent compact, token-efficient page state.
- `bap act ... --observe` reduces roundtrips during multi-step browsing.
- Named sessions keep the same browser state across commands.
- Real-browser execution makes it practical to extend this flow to logged-in
  dashboards, email, analytics, support tools, or social platforms later.

## Local verification

This workflow was validated against the `v0.4.0` release branch and the
published-package install path:

- packaged CLI opened `https://example.com`
- observation and screenshot worked from the installed tarball
- the Hacker News demo completed successfully and wrote artifacts

You can combine this workflow with [`hacker-news-cli`](../hacker-news-cli/README.md)
for a faster launch-video demo, then graduate to this agent-driven version for
real launch monitoring.
