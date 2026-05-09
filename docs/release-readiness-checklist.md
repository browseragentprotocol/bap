# BAP v1.0 Release Readiness Checklist

## Goal

Decide whether the current branch is ready to become the v1.0 release candidate
for BAP as the execution layer for browser agents.

## Go / No-Go Criteria

### Product story

- [ ] Root README clearly explains the execution-layer wedge
- [ ] Root docs showcase the major 1.0 operator flows
- [ ] CLI / MCP / SDK / server docs do not contradict each other
- [ ] Vendor-neutral wording is preserved

### Release surfaces

- [ ] Changesets for publishable npm packages are present
- [ ] Python SDK release line is represented in its changelog
- [ ] Runtime-visible versions are synchronized
- [ ] Release docs match current local and CI verification behavior

### Engineering verification

- [ ] `pnpm build`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm check:artifacts`
- [ ] `pnpm release:verify`

### Operational confidence

- [ ] First-run path is coherent (`doctor -> status -> goto --observe -> act`)
- [ ] Trust surfaces are visible enough for operators
- [ ] Handoff/resume feels like a supported workflow
- [ ] Trace surfaces feel like product UX, not raw logs
- [ ] Remaining risks are explicit and acceptable as v1 defers

## Known Acceptable Defers

These are not automatic blockers unless product requirements change:

- trace/task-story grouping remains heuristic rather than protocol-native
- `submit` / `credential-affecting` risk classes are heuristic
- domain visibility reflects server-side allowed-host policy rather than a full
  cross-surface policy model

## Current Blocking Questions

- Are all packages ready to move from `0.9.0` to `1.0.0`?
- Do we want a root 1.0 release note/changelog checked in before versioning?
- Are there any remaining cross-interface gaps that are true blockers rather
  than acceptable defers?
