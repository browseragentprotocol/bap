#!/usr/bin/env node
/**
 * Demo 2: Skill Scorer — Multi-Tab Workflow
 *
 * Story: BAP manages two tabs — GitHub (source) and skills.menu (tool) —
 * switching between them like a human would. Shows tab management for
 * complex cross-site workflows.
 *
 * Flow:
 *   1. Open skills.menu/try in Tab 1 (the scoring tool)
 *   2. Open GitHub SKILL.md in Tab 2 (the source)
 *   3. Read the SKILL.md on GitHub (scroll through it)
 *   4. Switch back to Tab 1 (skills.menu)
 *   5. Paste the SKILL.md content into the editor
 *   6. Click Score
 *   7. Hold on results
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordingContext } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../assets/demos");

async function fetchSkillContent() {
  const res = await fetch(
    "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md"
  );
  if (!res.ok) throw new Error(`Failed to fetch SKILL.md: ${res.status}`);
  return res.text();
}

async function main() {
  console.log("Recording: Skill Scorer (multi-tab)");

  console.log("  Fetching SKILL.md...");
  const skillContent = await fetchSkillContent();

  const ctx = await createRecordingContext({
    name: "skill-scorer",
    outputDir: OUTPUT_DIR,
    headless: !process.env.DEMO_HEADFUL,
  });

  const {
    page,
    navigateTo,
    clickOn,
    smoothScroll,
    fillField,
    hold,
    waitForStable,
    ensureCursor,
    finish,
  } = ctx;

  // 1. Open skills.menu/try in Tab 1
  console.log("  1/7 Tab 1: skills.menu/try");
  await navigateTo("https://www.skills.menu/try");
  await hold(2000);

  // 2. Open GitHub SKILL.md in Tab 2
  console.log("  2/7 Tab 2: GitHub SKILL.md");
  const tab2 = await page.context().newPage();
  await tab2.goto(
    "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
    { waitUntil: "networkidle" }
  );
  await tab2.bringToFront();

  // Inject cursor into tab2
  await tab2.evaluate(`(() => {
    if (document.getElementById('__dc')) return;
    const c = document.createElement('div');
    c.id = '__dc';
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.65);border:2.5px solid rgba(255,255,255,0.95);box-shadow:0 2px 12px rgba(0,0,0,0.35);transform:translate(-50%,-50%);top:-50px;left:-50px;';
    document.body.appendChild(c);
  })()`);
  ctx.events.log("tab-switch", 0, 0, { tab: 2, url: tab2.url() });
  await hold(2500);

  // 3. Scroll through the SKILL.md on GitHub
  console.log("  3/7 Reading SKILL.md on GitHub");
  await tab2.evaluate("window.scrollBy(0, 500)");
  await hold(2000);
  await tab2.evaluate("window.scrollBy(0, 400)");
  await hold(2000);

  // 4. Switch back to Tab 1 (skills.menu)
  console.log("  4/7 Switching to Tab 1: skills.menu");
  await page.bringToFront();
  await ensureCursor();
  ctx.events.log("tab-switch", 0, 0, { tab: 1, url: page.url() });
  await hold(1500);

  // 5. Paste the SKILL.md
  console.log("  5/7 Pasting SKILL.md");
  await fillField("#skill-input", skillContent);
  await hold(1200);

  // 6. Click Score
  console.log("  6/7 Scoring");
  await clickOn('button:has-text("score")', { hesitate: 300 });
  await waitForStable();
  await hold(1500);

  // 7. Hold on results
  console.log("  7/7 Results");
  await hold(4000);

  // Close tab2 before finishing
  await tab2.close();

  const videoPath = await finish();
  console.log(`  Done: ${videoPath}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
