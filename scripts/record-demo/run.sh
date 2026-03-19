#!/usr/bin/env bash
#
# Record both demo videos end-to-end.
#
# Prerequisites:
#   - Node.js 20+
#   - Playwright chromium: npx playwright install chromium
#   - FFmpeg: brew install ffmpeg
#   - Optional: gifski (brew install gifski) for better GIF quality
#
# Usage:
#   ./scripts/record-demo/run.sh
#   ./scripts/record-demo/run.sh --headful   # Watch the recording happen

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/assets/demos"

# Check prerequisites
command -v node >/dev/null || { echo "Error: Node.js required" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "Error: FFmpeg required (brew install ffmpeg)" >&2; exit 1; }

mkdir -p "$OUTPUT_DIR"

echo "=== BAP Demo Video Recorder ==="
echo ""

# Pass --headful to the demo scripts via environment variable
if [[ "${1:-}" == "--headful" ]]; then
  export DEMO_HEADFUL=1
  echo "Mode: headful (browser window visible)"
else
  echo "Mode: headless (use --headful to watch)"
fi
echo ""

# Record Demo 1: Blog Reader
echo "--- Demo 1: Blog Reader ---"
node "$SCRIPT_DIR/demo-blog-reader.mjs"
echo ""

# Record Demo 2: Skill Scorer
echo "--- Demo 2: Skill Scorer ---"
node "$SCRIPT_DIR/demo-skill-scorer.mjs"
echo ""

# Post-process both
echo "--- Post-processing ---"
bash "$SCRIPT_DIR/ffmpeg-post.sh" "$OUTPUT_DIR/blog-reader"
echo ""
bash "$SCRIPT_DIR/ffmpeg-post.sh" "$OUTPUT_DIR/skill-scorer"
echo ""

# Summary
echo "=== Done ==="
echo ""
echo "Output files:"
ls -lh "$OUTPUT_DIR"/*.mp4 "$OUTPUT_DIR"/*.gif 2>/dev/null || echo "  (no output files found)"
echo ""
echo "To embed in README:"
echo '  ![Blog Reader Demo](./assets/demos/blog-reader.gif)'
echo '  ![Skill Scorer Demo](./assets/demos/skill-scorer.gif)'
