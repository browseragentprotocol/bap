#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";

const candidateRefs = ["origin/main", "main"];
const repoRoot = process.cwd();

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

function hasRef(ref) {
  const result = run("git", ["rev-parse", "--verify", ref], { stdio: "ignore", cwd: repoRoot });
  return result.status === 0;
}

function getDirtyPaths() {
  const tracked = run("git", ["diff", "--name-only", "HEAD", "--"], { cwd: repoRoot });
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard"], { cwd: repoRoot });

  const paths = new Set();

  for (const output of [tracked.stdout, untracked.stdout]) {
    for (const line of output.split("\n").map((value) => value.trim()).filter(Boolean)) {
      paths.add(line);
    }
  }

  return Array.from(paths);
}

function materializeSnapshot(paths) {
  const snapshotDir = mkdtempSync(resolve(tmpdir(), "bap-changeset-status-"));

  run("git", ["clone", "--quiet", repoRoot, snapshotDir], { cwd: repoRoot, stdio: "ignore" });

  for (const relativePath of paths) {
    const sourcePath = resolve(repoRoot, relativePath);
    const destinationPath = resolve(snapshotDir, relativePath);

    if (existsSync(sourcePath)) {
      mkdirSync(dirname(destinationPath), { recursive: true });
      cpSync(sourcePath, destinationPath, { recursive: true });
    } else {
      rmSync(destinationPath, { recursive: true, force: true });
    }
  }

  const sourceNodeModules = resolve(repoRoot, "node_modules");
  const targetNodeModules = resolve(snapshotDir, "node_modules");
  if (!existsSync(targetNodeModules) && existsSync(sourceNodeModules)) {
    symlinkSync(sourceNodeModules, targetNodeModules);
  }

  const addResult = run("git", ["add", "-A"], { cwd: snapshotDir });
  if (addResult.status !== 0) {
    rmSync(snapshotDir, { recursive: true, force: true });
    console.error(addResult.stderr || addResult.stdout);
    process.exit(addResult.status ?? 1);
  }

  return snapshotDir;
}

const availableRefs = candidateRefs.filter(hasRef);

if (availableRefs.length === 0) {
  console.error(
    'Unable to find a Changesets base ref. Expected one of: main, origin/main. Fetch the default branch and retry.',
  );
  process.exit(1);
}

const dirtyPaths = getDirtyPaths();
const targetCwd = dirtyPaths.length > 0 ? materializeSnapshot(dirtyPaths) : repoRoot;

try {
  let lastStatus = 1;

  for (const baseRef of availableRefs) {
    const result = spawnSync("pnpm", ["exec", "changeset", "status", "--since", baseRef], {
      stdio: "inherit",
      env: process.env,
      cwd: targetCwd,
    });

    if (result.status === 0) {
      process.exit(0);
    }

    lastStatus = result.status ?? 1;
  }

  process.exit(lastStatus);
} finally {
  if (targetCwd !== repoRoot) {
    rmSync(targetCwd, { recursive: true, force: true });
  }
}
