# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | Yes                |
| < 0.2   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in BAP, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please send a report to the maintainers via one of these channels:

1. **GitHub Security Advisories**: Use the [private vulnerability reporting](https://github.com/browseragentprotocol/bap/security/advisories/new) feature on GitHub
2. **Email**: Send details to the repository maintainers listed in the GitHub organization

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected versions and packages
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, targeting:
  - Critical: 48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release cycle

## Security Considerations

BAP controls web browsers on behalf of AI agents. Operators and users should be aware of these security boundaries:

### Authentication

- The `--token` flag enables token-based authentication for WebSocket connections
- **Always use authentication in production** — without it, any process on the network can control the browser
- Tokens are compared using constant-time equality to prevent timing attacks

### Network exposure

- By default, the server binds to `localhost` only
- Do not expose BAP servers to the public internet without authentication and TLS
- Use `--host` with caution; binding to `0.0.0.0` exposes the server to all network interfaces

### Domain restrictions

- The `--allowed-domains` flag restricts which domains the browser can navigate to
- Use this in production to prevent navigation to unintended sites

### Browser sandbox

- BAP inherits Playwright's browser sandbox settings
- Chromium runs with sandbox enabled by default
- Do not disable the browser sandbox in production

### Data handling

- Screenshots and page content may contain sensitive data
- Storage state export (`getStorageState`) includes cookies and local storage
- Treat all browser data as potentially sensitive

## Dependencies

BAP depends on:
- **Playwright** for browser control
- **ws** for WebSocket transport
- **Zod** for schema validation

We monitor dependencies for known vulnerabilities and update promptly.
