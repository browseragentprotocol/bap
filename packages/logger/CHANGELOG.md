# @browseragentprotocol/logger

## 0.5.0

### Minor Changes

- c970d42: Add `bap scroll` CLI command, fix session persistence ghost pages, polished 2K demo videos.

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

## 0.4.0

### Minor Changes

- 982ee6b: Harden release readiness for public launch by shipping explicit package licenses
  and changelogs in npm tarballs, tightening package metadata, improving CLI
  browser messaging, and adding stronger CI and release verification.

## 0.2.0

### Minor Changes

- 7b5941a: v0.2.0 — browser selection, clean tool names, smarter extract

## 0.1.0

### Minor Changes

- eb08aae: Initial public release
