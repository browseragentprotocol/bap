# Demo Video Recorder

Automated Screen Studio-style demo recordings for BAP. Produces polished MP4
and GIF files with human-like cursor movements and zoom-at-click effects.

## Prerequisites

- Node.js 20+
- Playwright chromium: `npx playwright install chromium`
- FFmpeg: `brew install ffmpeg`
- Optional: gifski (`brew install gifski`) for better GIF quality

## Record both demos

```bash
./scripts/record-demo/run.sh
```

Watch it happen (opens a visible browser):

```bash
./scripts/record-demo/run.sh --headful
```

## Output

```
assets/demos/
  blog-reader.mp4     # Demo 1: reading a blog post on piyushvyas.com
  blog-reader.gif
  skill-scorer.mp4    # Demo 2: scoring a SKILL.md on skills.menu
  skill-scorer.gif
```

## Pipeline

1. **Playwright recording** — captures the browser viewport as WebM with an
   injected DOM cursor element for visible mouse movement
2. **Bezier cursor paths** — cubic bezier curves with Fitts's Law timing for
   human-like motion between click targets
3. **Event logging** — all clicks, moves, and scrolls saved to JSON with
   timestamps for post-processing
4. **FFmpeg post-processing** — WebM to H.264 MP4, zoom-at-click-points via
   programmatic crop+scale filter chains, GIF export via gifski or palettegen

## Files

| File                    | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `run.sh`                | Entry point — records both demos and post-processes    |
| `harness.mjs`           | Shared recording context, cursor overlay, event logger |
| `bezier.mjs`            | Cubic bezier path generation with Fitts's Law timing   |
| `demo-blog-reader.mjs`  | Demo 1 script                                          |
| `demo-skill-scorer.mjs` | Demo 2 script                                          |
| `ffmpeg-post.sh`        | WebM → MP4 + zoom effects + GIF export                 |
