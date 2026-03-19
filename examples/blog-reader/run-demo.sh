#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${1:-"$ROOT_DIR/.bap/demo/blog-reader"}"
SESSION_NAME="blog-demo"

mkdir -p "$OUTPUT_DIR"

run_bap() {
  node "$ROOT_DIR/packages/cli/dist/cli.js" "-s=$SESSION_NAME" --browser=chromium --no-profile --headless "$@"
}

printf '=== BAP Blog Reader Demo ===\n\n'

# Step 1: Open the homepage
printf '1. Opening piyushvyas.com...\n'
if ! run_bap open https://piyushvyas.com; then
  printf 'Failed to open the browser.\n' >&2
  printf 'If this is a fresh machine, install Chromium first:\n' >&2
  printf '  npx playwright install chromium\n' >&2
  exit 1
fi

run_bap screenshot "--file=$OUTPUT_DIR/homepage.png"
printf '   Screenshot saved: %s/homepage.png\n\n' "$OUTPUT_DIR"

# Step 2: Navigate to Writing
printf '2. Clicking "Writing" to view blog posts...\n'
run_bap act 'click:text:"Writing"' --observe
run_bap screenshot "--file=$OUTPUT_DIR/writing.png"
printf '   Screenshot saved: %s/writing.png\n\n' "$OUTPUT_DIR"

# Step 3: Find and click the BAP blog post
printf '3. Opening "Introducing Browser Agent Protocol"...\n'
run_bap act 'click:text:"Introducing Browser Agent Protocol"' --observe
run_bap screenshot "--file=$OUTPUT_DIR/article.png"
printf '   Screenshot saved: %s/article.png\n\n' "$OUTPUT_DIR"

# Step 4: Scroll to the end of the article
printf '4. Scrolling through the article...\n'
run_bap scroll down --pixels=2000
run_bap scroll down --pixels=2000
run_bap scroll down --pixels=2000

# Step 5: Extract the article content
printf '5. Extracting article content...\n'
run_bap extract --fields="title,content" | tee "$OUTPUT_DIR/article-content.txt"
printf '\n   Content saved: %s/article-content.txt\n\n' "$OUTPUT_DIR"

# Clean up
run_bap close

printf '=== Demo complete ===\n'
printf 'Artifacts written to %s\n' "$OUTPUT_DIR"
