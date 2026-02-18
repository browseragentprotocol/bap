/**
 * @fileoverview .bap/ directory management for CLI output files
 */

import fs from "node:fs/promises";
import path from "node:path";

const BAP_DIR = ".bap";

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Ensure the .bap/ directory exists in the current working directory.
 */
export async function ensureBapDir(): Promise<string> {
  const dir = path.resolve(process.cwd(), BAP_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Write a YAML snapshot to .bap/snapshot-<timestamp>.yml
 * @returns Relative path to the snapshot file (e.g., ".bap/snapshot-2026-02-16T19-30-42.yml")
 */
export async function writeSnapshot(data: string): Promise<string> {
  const dir = await ensureBapDir();
  const filename = `snapshot-${timestamp()}.yml`;
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, data, "utf-8");
  return path.join(BAP_DIR, filename);
}

/**
 * Write a PNG screenshot to .bap/screenshot-<timestamp>.png
 * @returns Relative path to the screenshot file
 */
export async function writeScreenshot(base64Data: string, customPath?: string): Promise<string> {
  if (customPath) {
    const dir = path.dirname(customPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(customPath, Buffer.from(base64Data, "base64"));
    return customPath;
  }

  const dir = await ensureBapDir();
  const filename = `screenshot-${timestamp()}.png`;
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, Buffer.from(base64Data, "base64"));
  return path.join(BAP_DIR, filename);
}

/**
 * Write extraction result to .bap/extraction-<timestamp>.json
 * @returns Relative path to the extraction file
 */
export async function writeExtraction(data: unknown): Promise<string> {
  const dir = await ensureBapDir();
  const filename = `extraction-${timestamp()}.json`;
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
  return path.join(BAP_DIR, filename);
}
