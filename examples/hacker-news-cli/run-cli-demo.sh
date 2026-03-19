#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${1:-"$ROOT_DIR/.bap/demo/hacker-news"}"
SESSION_NAME="hn-demo"

mkdir -p "$OUTPUT_DIR"

run_bap() {
  node "$ROOT_DIR/packages/cli/dist/cli.js" "-s=$SESSION_NAME" --browser=chromium --no-profile --headless "$@"
}

if ! run_bap open https://news.ycombinator.com; then
  printf 'Failed to launch the Hacker News demo browser.\n' >&2
  printf 'If this is a fresh machine, install Chromium first:\n' >&2
  printf '  npx playwright install chromium\n' >&2
  exit 1
fi

run_bap observe --max=12 | tee "$OUTPUT_DIR/observe.txt"
run_bap screenshot "--file=$OUTPUT_DIR/hacker-news.png"
run_bap snapshot "--file=$OUTPUT_DIR/hacker-news.yaml"
run_bap close

printf 'Demo artifacts written to %s\n' "$OUTPUT_DIR"
