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
npx pnpm install --frozen-lockfile
npx pnpm release:verify
```

`pnpm release:verify` resolves the Changesets base ref automatically. It prefers
the local `main` branch and falls back to `origin/main`, which keeps detached
worktrees and release-prep branches verifiable without manual branch setup. If
your clone does not have either ref, fetch `origin/main` before retrying.

When verifying a dirty local branch, `release:verify` snapshots the current
working tree for the Changesets status step so uncommitted `.changeset/*.md`
files and related package edits are checked together. CI still sees committed
branch state only, so keep release changesets intentionally present rather than
relying on local-only files.

For Python package validation, use Python 3.10+ as required by
`packages/python-sdk/pyproject.toml`. If your system `python3` is older, run
the Python verification steps in a dedicated `python3.12` virtual environment.

To inspect publishable npm tarballs directly:

```bash
npx pnpm build
npx pnpm check:artifacts
```

## Versioning model

- Published npm packages are versioned with Changesets
- The Python SDK version is synced automatically to the same release version by
  `scripts/sync-python-version.mjs`
- Runtime-visible version surfaces (`BAP_VERSION`, CLI `--version`, server
  banners, and the protocol spec doc) are synced by
  `scripts/sync-runtime-versions.mjs`
- The release workflow verifies both registries after publish
- The canonical release version is the linked npm package version in
  `packages/cli/package.json`; release prep should not hardcode a stale number in
  docs or runtime banners

## Common failure modes

- Missing changeset for a publishable package change
- Malformed changeset frontmatter or a release branch without a clear release
  plan (`pnpm changeset status`)
- `pnpm release:verify` fails with `Failed to find where HEAD diverged from "main"`
  because the local clone/worktree does not have a `main` ref yet
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

## Python verification note

The Python SDK requires **Python 3.10+**. If your local `python3` points to an
older interpreter, use a newer runtime explicitly (for example `python3.12`) or
run the verification steps inside a virtual environment created from a supported
Python version.
