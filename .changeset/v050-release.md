---
"@browseragentprotocol/cli": minor
"@browseragentprotocol/protocol": minor
"@browseragentprotocol/logger": minor
"@browseragentprotocol/client": minor
"@browseragentprotocol/server-playwright": minor
"@browseragentprotocol/mcp": minor
---

Add `bap scroll` CLI command, fix session persistence ghost pages, polished 2K demo videos.

### New

- `bap scroll [up|down|left|right] [--pixels=N]` — scroll the page or an element into view
- Automated demo video recorder (`scripts/record-demo/`) with bezier cursor, zoom-at-click effects, and GIF export
- Two 2K demo GIFs embedded in README: blog reader and skill scorer (multi-tab workflow)

### Fixed

- `ensureReady()` no longer treats `about:blank` ghost pages from failed session restores as valid — re-initializes browser instead
- `--pixels` flag for scroll command parsed correctly in CLI arg parser

### Changed

- README rewritten: vendor-neutral, table layout, polished demo GIFs
- Removed old `examples/` directory (replaced by demo recordings)
- Removed 6 orphaned asset PNGs
