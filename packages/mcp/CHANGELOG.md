# @browseragentprotocol/mcp

## 0.4.0

### Minor Changes

- 982ee6b: Harden release readiness for public launch by shipping explicit package licenses
  and changelogs in npm tarballs, tightening package metadata, improving CLI
  browser messaging, and adding stronger CI and release verification.
- 982ee6b: Add WebMCP tool discovery support via new `discovery/discover` protocol method. Detects tools exposed by websites through the W3C WebMCP standard (declarative HTML attributes and imperative navigator.modelContext API). Also available through `agent/observe` with opt-in `includeWebMCPTools` parameter.

### Patch Changes

- Updated dependencies [982ee6b]
- Updated dependencies [982ee6b]
- Updated dependencies [982ee6b]
  - @browseragentprotocol/client@0.4.0
  - @browseragentprotocol/logger@0.4.0
  - @browseragentprotocol/protocol@0.4.0

## 0.3.0

### Minor Changes

- 7fbae25: Add `@browseragentprotocol/cli` package with 20+ browser automation commands, composite selectors, session management, and skill installation. Add fused kernel operations to protocol and server-playwright for batch action execution.

### Patch Changes

- Updated dependencies [7fbae25]
  - @browseragentprotocol/protocol@0.3.0
  - @browseragentprotocol/client@0.3.0

## 0.2.0

### Minor Changes

- 7b5941a: v0.2.0 — browser selection, clean tool names, smarter extract

### Patch Changes

- Updated dependencies [7b5941a]
  - @browseragentprotocol/protocol@0.2.0
  - @browseragentprotocol/logger@0.2.0
  - @browseragentprotocol/client@0.2.0

## 0.1.0

### Minor Changes

- eb08aae: Initial public release

### Patch Changes

- Updated dependencies [eb08aae]
  - @browseragentprotocol/client@0.1.0
  - @browseragentprotocol/logger@0.1.0
  - @browseragentprotocol/protocol@0.1.0
