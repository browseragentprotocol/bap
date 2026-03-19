#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPackageJsonPath = resolve(repoRoot, "packages/cli/package.json");
const pythonPackageJsonPath = resolve(repoRoot, "packages/python-sdk/package.json");
const pyprojectPath = resolve(repoRoot, "packages/python-sdk/pyproject.toml");
const pythonInitPath = resolve(
  repoRoot,
  "packages/python-sdk/src/browseragentprotocol/__init__.py",
);

const canonicalVersion = JSON.parse(readFileSync(canonicalPackageJsonPath, "utf8")).version;

function updateFile(filePath, replacer) {
  const original = readFileSync(filePath, "utf8");
  const updated = replacer(original);

  if (original === updated) {
    return false;
  }

  writeFileSync(filePath, updated);
  return true;
}

let updatedSomething = false;

updatedSomething =
  updateFile(pythonPackageJsonPath, (content) =>
    content.replace(/"version": "([^"]+)"/, `"version": "${canonicalVersion}"`),
  ) || updatedSomething;

updatedSomething =
  updateFile(pyprojectPath, (content) =>
    content.replace(/^version = "([^"]+)"$/m, `version = "${canonicalVersion}"`),
  ) || updatedSomething;

updatedSomething =
  updateFile(pythonInitPath, (content) =>
    content.replace(/^__version__ = "([^"]+)"$/m, `__version__ = "${canonicalVersion}"`),
  ) || updatedSomething;

if (updatedSomething) {
  console.log(`Synced Python SDK version to ${canonicalVersion}`);
} else {
  console.log(`Python SDK already synced at ${canonicalVersion}`);
}

process.exit(0);
