# BAP Monorepo Changelog

## Unreleased (planned 1.0.0)

### Why 1.0

BAP is graduating from a promising browser-agent toolkit into a coherent
execution layer for browser agents:

- fast browser execution
- structured observations
- session persistence
- coherent CLI / MCP / SDK / server surfaces
- explicit trust, handoff, and operator-facing recovery flows

### Headline capabilities in the 1.0 line

- **Execution cockpit UX**
  - `bap doctor`, `bap status`, `bap sessions`, `bap tabs`
  - clearer handoff/resume lifecycle
  - task/story-first trace surfaces
- **Structured browser execution**
  - semantic selectors
  - fused navigate/observe and act/observe flows
  - delta-first observe/recovery loops
- **Trust surfaces**
  - approval modes: `readonly`, `standard`, `privileged`
  - visible domain/redaction posture
  - `bap act --explain` and `bap act --audit`
- **Cross-interface consistency**
  - aligned protocol, CLI, MCP, TS SDK, Python SDK, and server surfaces
  - synchronized runtime/version artifact checks
- **Release/readiness hardening**
  - stronger artifact verification
  - release verification that handles detached/worktree contexts more gracefully

### Included release themes

- First-run stability and doctor flow improvements
- Human handoff and resume workflows
- Session persistence and lifecycle visibility
- Richer trace/recovery UX
- Python SDK release-line alignment
- Honest docs, benchmarks, and release automation

### Canonical detailed sources

For package-by-package history, see:

- `packages/cli/CHANGELOG.md`
- `packages/client/CHANGELOG.md`
- `packages/logger/CHANGELOG.md`
- `packages/mcp/CHANGELOG.md`
- `packages/protocol/CHANGELOG.md`
- `packages/python-sdk/CHANGELOG.md`
- `packages/server-playwright/CHANGELOG.md`
