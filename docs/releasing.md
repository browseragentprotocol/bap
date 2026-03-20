# Release Automation

BAP uses automated releases for both npm and PyPI.

## Release Branch Policy

`main` is the only release branch.

- Changesets uses `main` as the base branch.
- CI and release automation publish only from pushes to `main`.
- Release PRs should merge into `main`; do not publish from feature branches,
  temporary branches, or pre-release branches.

## What happens on `main`

When a pull request with one or more changesets lands on `main`, GitHub Actions
will:

1. Run the release verification suite (`pnpm release:verify`)
2. Create or update the Changesets release PR
3. On merge of that release PR, publish npm packages
4. Create GitHub Releases for the published npm packages
5. Sync the Python SDK version to the release version
6. Build, validate, and publish `browser-agent-protocol` to PyPI
7. Verify that npm and PyPI now expose the expected versions

## Required GitHub configuration

### npm

- Repository secret: `NPM_TOKEN`
- Package permissions on npm for the `@browseragentprotocol` scope
- Trusted publishing / provenance enabled on npm if you want attestation

### PyPI

- A PyPI project named `browser-agent-protocol`
- GitHub trusted publishing configured for this repository
- A GitHub environment named `pypi`

## Local verification before merging

Run the launch-readiness checks locally:

```bash
npx pnpm release:verify
```

To inspect publishable npm tarballs directly:

```bash
npx pnpm build
npx pnpm check:artifacts
```

## Versioning model

- Published npm packages are versioned with Changesets
- The Python SDK version is synced automatically to the same release version by
  `scripts/sync-python-version.mjs`
- The release workflow verifies both registries after publish
- Current version: `0.6.0` (all packages linked, versioned together via changesets)

## Common failure modes

- Missing changeset for a publishable package change
- npm tarball missing `LICENSE`, `README.md`, or `CHANGELOG.md`
- Python version drift between `pyproject.toml`, `package.json`, and
  `src/browseragentprotocol/__init__.py`
- PyPI publish blocked because trusted publishing or project permissions are not
  configured

## Recovery

If npm publishes successfully but the Python SDK fails afterward, fix the issue
on `main` and then manually run the `Release` workflow with
`python_only = true`. That recovery mode rebuilds, tests, publishes, and
verifies the current `browser-agent-protocol` version on PyPI without forcing a
new npm release.
