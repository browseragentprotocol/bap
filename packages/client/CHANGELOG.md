# @browseragentprotocol/client

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

### Patch Changes

- Updated dependencies [c970d42]
  - @browseragentprotocol/protocol@0.5.0

## 0.4.0

### Minor Changes

- 982ee6b: Harden release readiness for public launch by shipping explicit package licenses
  and changelogs in npm tarballs, tightening package metadata, improving CLI
  browser messaging, and adding stronger CI and release verification.
- 982ee6b: Add server-side session persistence for CLI. Browser pages now survive across CLI invocations via a dormant session store. When a client with a `sessionId` disconnects, the server parks browser state instead of destroying it. On reconnect with the same `sessionId`, state is restored transparently. CLI auto-generates `sessionId` as `cli-<port>` with `-s=<name>` override for multi-session use cases.
- 982ee6b: Add WebMCP tool discovery support via new `discovery/discover` protocol method. Detects tools exposed by websites through the W3C WebMCP standard (declarative HTML attributes and imperative navigator.modelContext API). Also available through `agent/observe` with opt-in `includeWebMCPTools` parameter.

### Patch Changes

- Updated dependencies [982ee6b]
- Updated dependencies [982ee6b]
- Updated dependencies [982ee6b]
  - @browseragentprotocol/protocol@0.4.0

## 0.3.0

### Minor Changes

- 7fbae25: Add `@browseragentprotocol/cli` package with 20+ browser automation commands, composite selectors, session management, and skill installation. Add fused kernel operations to protocol and server-playwright for batch action execution.

### Patch Changes

- Updated dependencies [7fbae25]
  - @browseragentprotocol/protocol@0.3.0

## 0.2.0

### Minor Changes

- 7b5941a: v0.2.0 — browser selection, clean tool names, smarter extract

### Patch Changes

- Updated dependencies [7b5941a]
  - @browseragentprotocol/protocol@0.2.0

## 0.1.0

### Minor Changes

- eb08aae: Initial public release

### Patch Changes

- Updated dependencies [eb08aae]
  - @browseragentprotocol/protocol@0.1.0
