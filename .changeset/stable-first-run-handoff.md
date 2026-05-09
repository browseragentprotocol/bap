---
"@browseragentprotocol/protocol": minor
"@browseragentprotocol/client": minor
"@browseragentprotocol/server-playwright": minor
"@browseragentprotocol/cli": minor
---

Improve first-run stability and human handoff workflows across the BAP stack.

CLI changes:
- add `bap doctor` for browser/profile readiness checks before first use
- add `bap handoff` / `bap resume` for CAPTCHA and MFA interruptions
- fall back to a fresh Playwright Chromium profile when Chrome or Edge is missing
- retry without the auto-detected profile when that profile is locked or busy

Server and client changes:
- expose browser launch state so the CLI can resume sessions with the real browser/profile settings
- let handoff sessions override dormant TTL so manual work does not expire after the default parking window
- preserve current-tab session storage when switching between headless and visible handoff modes
- fail stale element refs fast across observe, extract, frame, and condition flows
