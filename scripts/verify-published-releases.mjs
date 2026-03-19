#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!mode) {
  fail("Expected verification mode: npm or pypi");
}

if (mode === "npm") {
  const raw = process.env.PUBLISHED_NPM_PACKAGES;

  if (!raw) {
    fail("PUBLISHED_NPM_PACKAGES is not set");
  }

  const publishedPackages = JSON.parse(raw);

  if (!Array.isArray(publishedPackages) || publishedPackages.length === 0) {
    fail("No published npm packages were reported by changesets");
  }

  for (const pkg of publishedPackages) {
    const publishedVersion = JSON.parse(
      execFileSync("npm", ["view", pkg.name, "version", "--json"], {
        encoding: "utf8",
      }),
    );

    if (publishedVersion !== pkg.version) {
      fail(`npm verification failed for ${pkg.name}: expected ${pkg.version}, got ${publishedVersion}`);
    }

    console.log(`Verified npm package ${pkg.name}@${pkg.version}`);
  }

  process.exit(0);
}

if (mode === "pypi") {
  const pyprojectToml = readFileSync(resolve(repoRoot, "packages/python-sdk/pyproject.toml"), "utf8");
  const expectedVersion = pyprojectToml.match(/^version = "([^"]+)"$/m)?.[1];

  if (!expectedVersion) {
    fail("Could not determine the expected Python package version");
  }

  const response = await fetch("https://pypi.org/pypi/browser-agent-protocol/json");

  if (!response.ok) {
    fail(`PyPI verification request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const publishedVersion = payload.info?.version;

  if (publishedVersion !== expectedVersion) {
    fail(
      `PyPI verification failed for browser-agent-protocol: expected ${expectedVersion}, got ${publishedVersion}`,
    );
  }

  console.log(`Verified PyPI package browser-agent-protocol==${expectedVersion}`);
  process.exit(0);
}

fail(`Unknown verification mode: ${mode}`);
