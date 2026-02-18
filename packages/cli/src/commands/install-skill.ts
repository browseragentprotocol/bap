/**
 * bap install-skill — Install BAP skill to detected AI coding agents
 *
 * Flags:
 *   --project    Install to project-level skill directories only
 *   --global     Install to user-global skill directories only
 *   --dry-run    Show what would be installed without installing
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { BAPClient } from "@browseragentprotocol/client";
import type { GlobalFlags } from "../config/state.js";
import { register } from "./registry.js";

const SKILL_NAME = "bap-browser";

function resolveSkillSource(): string {
  // Try to find the skills directory relative to this package
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // In dist: packages/cli/dist/commands/ -> packages/cli/skills/
    const fromDist = path.resolve(__dirname, "../../skills", SKILL_NAME);
    if (fs.existsSync(path.join(fromDist, "SKILL.md"))) {
      return fromDist;
    }
    // In src: packages/cli/src/commands/ -> packages/cli/skills/
    const fromSrc = path.resolve(__dirname, "../../../skills", SKILL_NAME);
    if (fs.existsSync(path.join(fromSrc, "SKILL.md"))) {
      return fromSrc;
    }
  } catch {
    // Fall through
  }

  throw new Error(
    "Could not find BAP skill files. " +
    "Ensure @browseragentprotocol/cli is installed correctly."
  );
}

function copyRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

interface AgentTarget {
  name: string;
  dir: string;
  detect: () => boolean;
}

function getGlobalAgents(): AgentTarget[] {
  const home = os.homedir();
  return [
    {
      name: "Claude Code",
      dir: path.join(home, ".claude", "skills"),
      detect: () =>
        commandExists("claude") || fs.existsSync(path.join(home, ".claude")),
    },
    {
      name: "Codex CLI",
      dir: path.join(home, ".codex", "skills"),
      detect: () =>
        commandExists("codex") || fs.existsSync(path.join(home, ".codex")),
    },
    {
      name: "Gemini CLI",
      dir: path.join(home, ".gemini", "skills"),
      detect: () =>
        commandExists("gemini") || fs.existsSync(path.join(home, ".gemini")),
    },
    {
      name: "Amp",
      dir: path.join(home, ".amp", "skills"),
      detect: () => fs.existsSync(path.join(home, ".amp")),
    },
    {
      name: "Deep Agents",
      dir: path.join(home, ".deepagents", "agent", "skills"),
      detect: () =>
        commandExists("deepagents") ||
        fs.existsSync(path.join(home, ".deepagents")),
    },
    {
      name: "OpenCode",
      dir: path.join(home, ".config", "opencode", "skill"),
      detect: () =>
        fs.existsSync(path.join(home, ".config", "opencode")),
    },
  ];
}

function getProjectAgents(): AgentTarget[] {
  const cwd = process.cwd();
  return [
    {
      name: "Claude Code",
      dir: path.join(cwd, ".claude", "skills"),
      detect: () =>
        fs.existsSync(path.join(cwd, ".claude")) ||
        fs.existsSync(path.join(cwd, "CLAUDE.md")),
    },
    {
      name: "Codex",
      dir: path.join(cwd, ".agents", "skills"),
      detect: () =>
        fs.existsSync(path.join(cwd, ".agents")) ||
        fs.existsSync(path.join(cwd, ".codex")),
    },
    {
      name: "Gemini CLI",
      dir: path.join(cwd, ".gemini", "skills"),
      detect: () =>
        fs.existsSync(path.join(cwd, ".gemini")) ||
        fs.existsSync(path.join(cwd, "GEMINI.md")),
    },
    {
      name: "Cursor",
      dir: path.join(cwd, ".cursor", "skills"),
      detect: () => fs.existsSync(path.join(cwd, ".cursor")),
    },
    {
      name: "GitHub Copilot",
      dir: path.join(cwd, ".github", "skills"),
      detect: () => fs.existsSync(path.join(cwd, ".github")),
    },
    {
      name: "Windsurf",
      dir: path.join(cwd, ".windsurf", "skills"),
      detect: () => fs.existsSync(path.join(cwd, ".windsurf")),
    },
    {
      name: "Roo Code",
      dir: path.join(cwd, ".roo", "skills"),
      detect: () => fs.existsSync(path.join(cwd, ".roo")),
    },
  ];
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function installSkillCommand(
  _args: string[],
  flags: GlobalFlags,
  _client: BAPClient,
): Promise<void> {
  const skillSrc = resolveSkillSource();
  const dryRun = flags.dryRun ?? false;
  const projectOnly = flags.project ?? false;
  const globalOnly = flags.global ?? false;

  const installed: string[] = [];
  const skipped: string[] = [];

  console.log("");
  console.log("### BAP Browser Skill Installer");
  console.log("");

  // Global installations
  if (!projectOnly) {
    console.log("Global skills (available in all projects):");
    for (const agent of getGlobalAgents()) {
      if (agent.detect()) {
        if (dryRun) {
          console.log(`  [dry-run] Would install to ${agent.dir}/${SKILL_NAME}/`);
        } else {
          copyRecursive(skillSrc, path.join(agent.dir, SKILL_NAME));
          console.log(`  ✓ ${agent.name} (${agent.dir}/)`);
          installed.push(agent.name);
        }
      } else {
        skipped.push(agent.name);
      }
    }
    console.log("");
  }

  // Project-local installations
  if (!globalOnly) {
    console.log("Project skills (current directory):");
    for (const agent of getProjectAgents()) {
      if (agent.detect()) {
        if (dryRun) {
          console.log(`  [dry-run] Would install to ${agent.dir}/${SKILL_NAME}/`);
        } else {
          copyRecursive(skillSrc, path.join(agent.dir, SKILL_NAME));
          console.log(`  ✓ ${agent.name} (${agent.dir}/)`);
          installed.push(agent.name);
        }
      }
    }
    console.log("");
  }

  // Summary
  if (dryRun) {
    console.log("Dry run complete. No files were modified.");
  } else {
    console.log(`Installed to ${installed.length} location(s).`);
  }

  if (skipped.length > 0) {
    console.log(`Not detected: ${skipped.join(", ")}`);
  }
}

register("install-skill", installSkillCommand);

// Also register as "skill" with subcommand "init"
register("skill", async (args, flags, client) => {
  const subcommand = args[0];
  if (subcommand === "init") {
    flags.project = true;
    await installSkillCommand([], flags, client);
  } else {
    console.error("Usage: bap skill init");
    process.exit(1);
  }
});
