#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const scriptArgs = process.argv.slice(2);
const candidates =
  process.platform === "win32"
    ? [
        ["python"],
        ["py", "-3"],
      ]
    : [
        ["python3"],
        ["python"],
      ];

for (const [command, ...prefixArgs] of candidates) {
  const result = spawnSync(command, [...prefixArgs, ...scriptArgs], {
    stdio: "inherit",
  });

  if (result.error && result.error.code === "ENOENT") {
    continue;
  }

  if (result.error) {
    console.error(`Failed to launch ${command}: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

console.warn("No Python interpreter was found on PATH; skipping Python helper command.");
process.exit(0);
