# Contributing to Browser Agent Protocol

Thank you for your interest in contributing to BAP. This document covers the process for contributing to this project.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm 9.x (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Git

### Setup

```bash
git clone https://github.com/browseragentprotocol/bap.git
cd bap
pnpm install
pnpm build
```

### Verify your setup

```bash
pnpm typecheck   # Type checking across all packages
pnpm lint        # ESLint
pnpm test        # Vitest test suites
```

## Repository Structure

```
packages/
  protocol/           # Core types, schemas, and shared utilities (Zod)
  logger/             # Structured logging
  client/             # TypeScript WebSocket client SDK
  server-playwright/  # Playwright-based BAP server
  mcp/                # MCP (Model Context Protocol) bridge
  cli/                # Shell CLI for browser automation
  python-sdk/         # Python client SDK
```

**Dependency order**: `protocol` -> `logger` -> `client` / `server-playwright` -> `mcp` / `cli`

All packages are built with `tsup` and managed with `turborepo`.

## Development Workflow

### 1. Create a branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make changes

- Protocol changes go in `packages/protocol/src/types/`
- Server handler changes go in `packages/server-playwright/src/server.ts`
- Client SDK changes go in `packages/client/src/index.ts`
- CLI commands go in `packages/cli/src/commands/`

### 3. Build and test

```bash
pnpm build       # Build all packages (respects dependency order)
pnpm typecheck   # Must pass with zero errors
pnpm lint        # Must pass with zero errors (warnings are acceptable)
pnpm test        # All tests must pass
```

### 4. Submit a pull request

- Keep PRs focused on a single change
- Include tests for new functionality
- Update relevant README files if adding user-facing features
- Reference any related issues

## Code Style

- TypeScript strict mode is enabled across all packages
- ESLint with `typescript-eslint` rules
- Prettier for formatting (`pnpm format`)
- Use Zod schemas for all protocol types (no raw `interface` for wire types)
- All new protocol fields must be optional for backward compatibility

## Testing

Tests use [Vitest](https://vitest.dev/). Each package has its own test configuration.

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @browseragentprotocol/protocol test

# Run with coverage
pnpm test:coverage
```

### Test guidelines

- Schema validation tests go in `packages/protocol/src/__tests__/`
- CLI flag/command tests go in `packages/cli/__tests__/`
- MCP tool tests go in `packages/mcp/src/__tests__/`
- Integration tests that require a browser go in `packages/server-playwright/src/__tests__/`

## Protocol Changes

BAP uses JSON-RPC 2.0 over WebSocket. If you are changing the protocol:

1. Update Zod schemas in `packages/protocol/src/types/`
2. Export new types from `packages/protocol/src/types/index.ts`
3. Implement server handling in `packages/server-playwright/src/server.ts`
4. Add client passthrough in `packages/client/src/index.ts`
5. Add schema validation tests
6. All new fields must be **optional** to maintain backward compatibility

## Reporting Issues

- Use [GitHub Issues](https://github.com/browseragentprotocol/bap/issues)
- Include BAP version, Node.js version, and browser type
- For bugs: include steps to reproduce, expected vs actual behavior
- For feature requests: describe the use case and proposed API

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
