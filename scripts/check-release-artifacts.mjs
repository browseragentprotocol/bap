#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

function createPackEnv() {
  const env = { ...process.env };
  const cacheDir = mkdtempSync(resolve(tmpdir(), "bap-npm-cache-"));
  for (const key of [
    "npm_config_shamefully_hoist",
    "npm_config_auto_install_peers",
    "npm_config_store_dir",
    "NPM_CONFIG_SHAMEFULLY_HOIST",
    "NPM_CONFIG_AUTO_INSTALL_PEERS",
    "NPM_CONFIG_STORE_DIR",
  ]) {
    delete env[key];
  }
  env.npm_config_cache = cacheDir;
  env.NPM_CONFIG_CACHE = cacheDir;
  env.npm_config_update_notifier = "false";
  env.NPM_CONFIG_UPDATE_NOTIFIER = "false";
  env.NO_UPDATE_NOTIFIER = "1";
  return { env, cacheDir };
}

function packPackage(relativeDir) {
  const { env, cacheDir } = createPackEnv();
  try {
    const stdout = execFileSync("npm", ["pack", "--json", "--dry-run"], {
      cwd: resolve(repoRoot, relativeDir),
      encoding: "utf8",
      env,
    });
    const [result] = JSON.parse(stdout);
    return result;
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
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
const protocolVersionSource = readText("packages/protocol/src/types/protocol.ts");
const pythonProtocolSource = readText("packages/python-sdk/src/browseragentprotocol/types/protocol.py");
const serverLifecycleSource = readText("packages/server-playwright/src/handlers/lifecycle.ts");
const serverCliSource = readText("packages/server-playwright/src/cli.ts");
const cliSource = readText("packages/cli/src/cli.ts");
const mcpIndexSource = readText("packages/mcp/src/index.ts");
const mcpCliSource = readText("packages/mcp/src/cli.ts");
const clientSource = readText("packages/client/src/index.ts");
const pythonClientSource = readText("packages/python-sdk/src/browseragentprotocol/client.py");
const pythonSyncClientSource = readText("packages/python-sdk/src/browseragentprotocol/sync_client.py");
const pythonContextSource = readText("packages/python-sdk/src/browseragentprotocol/context.py");

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
assert(
  protocolVersionSource.includes(`export const BAP_VERSION = "${canonicalReleaseVersion}";`),
  "TypeScript protocol version matches the canonical release version",
);
assert(
  pythonProtocolSource.includes(`BAP_VERSION = "${canonicalReleaseVersion}"`),
  "Python protocol version matches the canonical release version",
);
assert(
  serverLifecycleSource.includes("version: BAP_VERSION"),
  "Server initialize surface reports the shared protocol version",
);
assert(
  serverCliSource.includes("version: BAP_VERSION")
    && serverCliSource.includes("pc.dim(`v${BAP_VERSION}`)"),
  "Server CLI prints the shared protocol version",
);
assert(cliSource.includes("bap-cli ${BAP_VERSION}"), "CLI prints the shared protocol version");
assert(
  mcpIndexSource.includes('version: options.version ?? BAP_VERSION'),
  "MCP server defaults to the shared protocol version",
);
assert(
  mcpCliSource.includes("pc.dim(`v${BAP_VERSION}`)"),
  "MCP CLI prints the shared protocol version",
);
assert(
  clientSource.includes("version: options.version ?? BAP_VERSION"),
  "TypeScript client defaults to the shared protocol version",
);
assert(
  pythonClientSource.includes("version: str = BAP_VERSION")
    && pythonSyncClientSource.includes("version: str = BAP_VERSION")
    && pythonContextSource.includes("version: str = BAP_VERSION"),
  "Python client surfaces default to the shared protocol version",
);

if (hasFailure) {
  process.exit(1);
}
