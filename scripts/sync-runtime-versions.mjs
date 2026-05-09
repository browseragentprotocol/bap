#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalVersion = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/cli/package.json"), "utf8"),
).version;

function updateFile(relativePath, replacer) {
  const filePath = resolve(repoRoot, relativePath);
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
  updateFile("packages/protocol/src/types/protocol.ts", (content) =>
    content.replace(
      /export const BAP_VERSION = "([^"]+)";/,
      `export const BAP_VERSION = "${canonicalVersion}";`,
    ),
  ) || updatedSomething;

updatedSomething =
  updateFile("packages/python-sdk/src/browseragentprotocol/types/protocol.py", (content) =>
    content.replace(/BAP_VERSION = "([^"]+)"/, `BAP_VERSION = "${canonicalVersion}"`),
  ) || updatedSomething;

updatedSomething =
  updateFile("docs/protocol-spec.md", (content) =>
    content
      .replace(
        /^# BAP Protocol Specification v[0-9]+\.[0-9]+\.[0-9]+$/m,
        `# BAP Protocol Specification v${canonicalVersion}`,
      )
      .replace(
        /`GET \/health` returns `\{"status":"ok","version":"[^"]+"\}`/,
        `\`GET /health\` returns \`{"status":"ok","version":"${canonicalVersion}"}\``,
      ),
  ) || updatedSomething;

if (updatedSomething) {
  console.log(`Synced runtime version surfaces to ${canonicalVersion}`);
} else {
  console.log(`Runtime version surfaces already synced at ${canonicalVersion}`);
}

process.exit(0);
