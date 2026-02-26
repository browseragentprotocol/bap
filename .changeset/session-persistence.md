---
"@browseragentprotocol/protocol": minor
"@browseragentprotocol/server-playwright": minor
"@browseragentprotocol/client": minor
"@browseragentprotocol/cli": minor
---

Add server-side session persistence for CLI. Browser pages now survive across CLI invocations via a dormant session store. When a client with a `sessionId` disconnects, the server parks browser state instead of destroying it. On reconnect with the same `sessionId`, state is restored transparently. CLI auto-generates `sessionId` as `cli-<port>` with `-s=<name>` override for multi-session use cases.
