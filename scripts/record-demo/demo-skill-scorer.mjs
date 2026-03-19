#!/usr/bin/env node
/**
 * Demo 2: Skill Scorer
 *
 * Navigate to GitHub anthropics/skills → browse to frontend-design SKILL.md →
 * copy the raw content → navigate to skills.menu/try → paste → click Score →
 * show the results.
 *
 * Produces: assets/demos/skill-scorer-raw.webm + skill-scorer-events.json
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordingContext } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../assets/demos");

// Pre-fetched via `gh api` to avoid complex in-browser copy flow.
// This is the raw SKILL.md from anthropics/skills/skills/frontend-design.
async function fetchSkillContent() {
  const url =
    "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch SKILL.md: ${res.status}`);
  return res.text();
}

async function main() {
  console.log("Recording: Skill Scorer demo");

  // Pre-fetch the SKILL.md content so we can paste it directly
  console.log("  Fetching frontend-design SKILL.md from GitHub...");
  const skillContent = await fetchSkillContent();

  const ctx = await createRecordingContext({
    name: "skill-scorer",
    outputDir: OUTPUT_DIR,
    headless: !process.env.DEMO_HEADFUL,
  });

  const { navigateTo, clickOn, smoothScroll, pause, page, finish } = ctx;

  // Step 1: Show the GitHub repo
  console.log("  1. Opening anthropics/skills on GitHub...");
  await navigateTo("https://github.com/anthropics/skills");
  await pause(2000);

  // Step 2: Navigate directly to the SKILL.md file (avoids fragile tree navigation)
  console.log("  2. Browsing to skills/frontend-design/SKILL.md...");
  await navigateTo(
    "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md"
  );
  await pause(2000);

  // Step 3: Scroll to show the file content
  console.log("  3. Showing SKILL.md content...");
  await smoothScroll(400, { steps: 15 });
  await pause(1500);

  // Step 6: Navigate to skills.menu/try
  console.log("  4. Navigating to skills.menu/try...");
  await navigateTo("https://www.skills.menu/try");
  await pause(1500);

  // Step 7: Click the textarea and paste the SKILL.md content
  console.log("  5. Pasting SKILL.md into the editor...");
  await clickOn("#skill-input", { hesitate: 200, postDelay: 300 });

  // Select all existing content and replace with our SKILL.md
  await page.keyboard.press("Meta+a");
  await page.keyboard.insertText(skillContent);
  await pause(1000);

  // Step 8: Click Score button
  console.log("  6. Clicking Score...");
  await clickOn('button:has-text("score")', { hesitate: 300, postDelay: 2500 });

  // Step 9: Scroll down to see full results
  console.log("  7. Showing results...");
  await smoothScroll(300, { steps: 15 });
  await pause(3000); // Hold on results

  // Finish
  const videoPath = await finish();
  console.log(`  Done: ${videoPath}`);
}

main().catch((err) => {
  console.error("Skill scorer demo failed:", err);
  process.exit(1);
});
