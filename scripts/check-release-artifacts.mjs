#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const issuesUrl = "https://github.com/browseragentprotocol/bap/issues";

const npmPackages = [
  {
    dir: "packages/cli",
    name: "@browseragentprotocol/cli",
    homepage: "https://github.com/browseragentprotocol/bap/tree/main/packages/cli",
    requiredFiles: [
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
      "bin/bap.js",
      "dist/cli.js",
      "skills/bap-browser/SKILL.md",
    ],
  },
  {
    dir: "packages/client",
    name: "@browseragentprotocol/client",
    homepage: "https://github.com/browseragentprotocol/bap/tree/main/packages/client",
    requiredFiles: [
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
      "dist/index.js",
      "dist/index.cjs",
    ],
  },
  {
    dir: "packages/logger",
    name: "@browseragentprotocol/logger",
    homepage: "https://github.com/browseragentprotocol/bap/tree/main/packages/logger",
    requiredFiles: [
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
      "dist/index.js",
      "dist/index.cjs",
    ],
  },
  {
    dir: "packages/mcp",
    name: "@browseragentprotocol/mcp",
    homepage: "https://github.com/browseragentprotocol/bap/tree/main/packages/mcp",
    requiredFiles: [
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
      "dist/cli.js",
      "dist/index.js",
    ],
  },
  {
    dir: "packages/protocol",
    name: "@browseragentprotocol/protocol",
    homepage: "https://github.com/browseragentprotocol/bap/tree/main/packages/protocol",
    requiredFiles: [
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
      "dist/index.js",
      "dist/shared/index.js",
      "dist/types/index.js",
    ],
  },
  {
    dir: "packages/server-playwright",
    name: "@browseragentprotocol/server-playwright",
    homepage: "https://github.com/browseragentprotocol/bap/tree/main/packages/server-playwright",
    requiredFiles: [
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
      "dist/cli.js",
      "dist/server.js",
    ],
  },
];

const forbiddenTarballPrefixes = [".turbo/", "src/", "__tests__/", "tests/"];
const forbiddenTarballFiles = ["CLAUDE.md"];

let hasFailure = false;

function assert(condition, message) {
  if (condition) {
    console.log(`ok  ${message}`);
    return;
  }

  console.error(`ERR ${message}`);
  hasFailure = true;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function packPackage(relativeDir) {
  const stdout = execFileSync("npm", ["pack", "--json", "--dry-run"], {
    cwd: resolve(repoRoot, relativeDir),
    encoding: "utf8",
  });
  const [result] = JSON.parse(stdout);
  return result;
}

function getPackageVersion(relativePath) {
  return readJson(relativePath).version;
}

for (const pkg of npmPackages) {
  const packageJsonPath = `${pkg.dir}/package.json`;
  const packageJson = readJson(packageJsonPath);
  const packed = packPackage(pkg.dir);
  const tarballFiles = new Set(packed.files.map((file) => file.path));

  console.log(`\nChecking ${pkg.name}`);

  assert(packageJson.name === pkg.name, `${pkg.name} has the expected package name`);
  assert(packageJson.license === "Apache-2.0", `${pkg.name} declares Apache-2.0`);
  assert(
    packageJson.publishConfig?.access === "public",
    `${pkg.name} publishes with public access`,
  );
  assert(
    packageJson.repository?.directory === pkg.dir,
    `${pkg.name} repository.directory points at ${pkg.dir}`,
  );
  assert(packageJson.homepage === pkg.homepage, `${pkg.name} homepage points at its package docs`);
  assert(packageJson.bugs?.url === issuesUrl, `${pkg.name} bugs.url points at the issue tracker`);

  for (const requiredFile of pkg.requiredFiles) {
    assert(tarballFiles.has(requiredFile), `${pkg.name} tarball includes ${requiredFile}`);
  }

  for (const forbiddenPrefix of forbiddenTarballPrefixes) {
    assert(
      !packed.files.some((file) => file.path.startsWith(forbiddenPrefix)),
      `${pkg.name} tarball excludes ${forbiddenPrefix}`,
    );
  }

  for (const forbiddenFile of forbiddenTarballFiles) {
    assert(!tarballFiles.has(forbiddenFile), `${pkg.name} tarball excludes ${forbiddenFile}`);
  }
}

const pythonPackageJsonVersion = getPackageVersion("packages/python-sdk/package.json");
const canonicalReleaseVersion = getPackageVersion("packages/cli/package.json");
const pyprojectToml = readText("packages/python-sdk/pyproject.toml");
const pythonInit = readText("packages/python-sdk/src/browseragentprotocol/__init__.py");

const pyprojectVersion = pyprojectToml.match(/^version = "([^"]+)"$/m)?.[1];
const initVersion = pythonInit.match(/^__version__ = "([^"]+)"$/m)?.[1];

console.log("\nChecking browser-agent-protocol (PyPI)");
assert(existsSync(resolve(repoRoot, "packages/python-sdk/LICENSE")), "Python SDK includes a LICENSE file");
assert(existsSync(resolve(repoRoot, "packages/python-sdk/README.md")), "Python SDK includes a README");
assert(existsSync(resolve(repoRoot, "packages/python-sdk/CHANGELOG.md")), "Python SDK includes a CHANGELOG");
assert(pyprojectVersion === pythonPackageJsonVersion, "Python SDK pyproject version matches package.json");
assert(initVersion === pythonPackageJsonVersion, "Python SDK __version__ matches package.json");
assert(
  pythonPackageJsonVersion === canonicalReleaseVersion,
  "Python SDK version stays aligned with the npm release version",
);
assert(
  pyprojectToml.includes('license-files = ["LICENSE"]'),
  "Python SDK declares license-files in pyproject.toml",
);

if (hasFailure) {
  process.exit(1);
}
