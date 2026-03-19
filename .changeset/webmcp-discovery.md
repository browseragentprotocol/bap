---
"@browseragentprotocol/protocol": minor
"@browseragentprotocol/server-playwright": minor
"@browseragentprotocol/client": minor
"@browseragentprotocol/mcp": minor
---

Add WebMCP tool discovery support via new `discovery/discover` protocol method. Detects tools exposed by websites through the W3C WebMCP standard (declarative HTML attributes and imperative navigator.modelContext API). Also available through `agent/observe` with opt-in `includeWebMCPTools` parameter.
