# @browseragentprotocol/cli

## 0.4.0

### Minor Changes

- 982ee6b: Harden release readiness for public launch by shipping explicit package licenses
  and changelogs in npm tarballs, tightening package metadata, improving CLI
  browser messaging, and adding stronger CI and release verification.
- 982ee6b: Add server-side session persistence for CLI. Browser pages now survive across CLI invocations via a dormant session store. When a client with a `sessionId` disconnects, the server parks browser state instead of destroying it. On reconnect with the same `sessionId`, state is restored transparently. CLI auto-generates `sessionId` as `cli-<port>` with `-s=<name>` override for multi-session use cases.

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
