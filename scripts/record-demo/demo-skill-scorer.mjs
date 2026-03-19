#!/usr/bin/env node
/**
 * Demo 2: Skill Scorer — Real agent workflow
 *
 * An agent browses GitHub like a human would — clicking through directories,
 * then opens a second tab to score the file on skills.menu.
 *
 * Flow:
 *   1. Open github.com/anthropics/skills
 *   2. Click into skills/ directory
 *   3. Click into frontend-design/ directory
 *   4. Click SKILL.md to view the file
 *   5. Open skills.menu in a "new tab"
 *   6. Click "Try It"
 *   7. Clear the editor and paste the SKILL.md
 *   8. Click Score
 *   9. Hold on results
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordingContext } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../assets/demos");

// ---------------------------------------------------------------------------
// Tab bar overlay
// ---------------------------------------------------------------------------

function tabBarScript(tabs, activeIndex) {
  const html = tabs
    .map((label, i) => {
      const active = i === activeIndex;
      const bg = active ? "background:#313244;" : "background:transparent;";
      const fg = active ? "color:#cdd6f4;font-weight:500;" : "color:#6c7086;font-weight:400;";
      const dot = active ? "#a6e3a1" : "#585b70";
      return `<div style="display:flex;align-items:center;gap:8px;padding:0 18px;${bg}${fg}border-radius:8px 8px 0 0;margin-top:6px;white-space:nowrap;"><span style="width:8px;height:8px;border-radius:50%;background:${dot};"></span>${label}</div>`;
    })
    .join("");

  return `(() => {
    let b = document.getElementById('__tabbar');
    if (b) b.remove();
    b = document.createElement('div');
    b.id = '__tabbar';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483645;height:44px;background:#1e1e2e;display:flex;align-items:stretch;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;padding:0 8px;gap:2px;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    b.innerHTML = ${JSON.stringify(html)};
    document.body.appendChild(b);
    document.body.style.paddingTop = '44px';
  })()`;
}

// ---------------------------------------------------------------------------
// Pre-fetch SKILL.md content (for pasting later)
// ---------------------------------------------------------------------------

async function fetchSkillContent() {
  const res = await fetch(
    "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md"
  );
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Recording: Skill Scorer");

  console.log("  Pre-fetching SKILL.md...");
  const skillContent = await fetchSkillContent();

  const ctx = await createRecordingContext({
    name: "skill-scorer",
    outputDir: OUTPUT_DIR,
    headless: !process.env.DEMO_HEADFUL,
  });

  const { page, navigateTo, clickOn, smoothScroll, fillField, hold, waitForStable } = ctx;

  const TABS_GH_ONLY = ["GitHub — anthropics/skills"];
  const TABS_BOTH_GH = ["GitHub — anthropics/skills", "skills.menu"];
  const TABS_BOTH_SM = ["GitHub — anthropics/skills", "skills.menu — Try It"];

  async function showTabs(tabs, active) {
    try {
      await page.evaluate(tabBarScript(tabs, active));
    } catch {}
  }

  // =========================================================================
  // 1. Open github.com/anthropics/skills
  // =========================================================================
  console.log("  1/9  github.com/anthropics/skills");
  await navigateTo("https://github.com/anthropics/skills");
  await showTabs(TABS_GH_ONLY, 0);
  await hold(2000);

  // =========================================================================
  // 2. Click into skills/ directory
  // =========================================================================
  console.log("  2/9  Click skills/ directory");
  await clickOn('a[href="/anthropics/skills/tree/main/skills"] >> visible=true', { hesitate: 200 });
  await waitForStable();
  await showTabs(TABS_GH_ONLY, 0);
  await hold(1800);

  // =========================================================================
  // 3. Click into frontend-design/ directory
  // =========================================================================
  console.log("  3/9  Click frontend-design/");
  await clickOn('a[href*="frontend-design"] >> visible=true', { hesitate: 200 });
  await waitForStable();
  await showTabs(TABS_GH_ONLY, 0);
  await hold(1800);

  // =========================================================================
  // 4. Click SKILL.md to view the file
  // =========================================================================
  console.log("  4/9  Click SKILL.md");
  await clickOn('a[href*="SKILL.md"] >> visible=true', { hesitate: 200 });
  await waitForStable();
  await showTabs(TABS_GH_ONLY, 0);
  await hold(1500);

  // Scroll down to show file content
  await smoothScroll(400, { duration: 1200 });
  await hold(2000);

  // =========================================================================
  // 5. "Open new tab" — navigate to skills.menu
  // =========================================================================
  console.log("  5/9  Open skills.menu tab");
  await navigateTo("https://www.skills.menu");
  await showTabs(
    TABS_BOTH_GH.map((t, i) => (i === 1 ? "skills.menu" : t)),
    1
  );
  await hold(2000);

  // =========================================================================
  // 6. Click "Try It"
  // =========================================================================
  console.log("  6/9  Click Try It");
  await clickOn('a:has-text("Try It")', { hesitate: 200 });
  await waitForStable();
  await showTabs(TABS_BOTH_SM, 1);
  await hold(1500);

  // =========================================================================
  // 7. Clear editor and paste the SKILL.md
  // =========================================================================
  console.log("  7/9  Paste SKILL.md");
  await fillField("#skill-input", skillContent);
  await hold(1200);

  // =========================================================================
  // 8. Click Score
  // =========================================================================
  console.log("  8/9  Click Score");
  await clickOn('button:has-text("score")', { hesitate: 300 });
  await waitForStable();
  await hold(1500);

  // =========================================================================
  // 9. Hold on results
  // =========================================================================
  console.log("  9/9  Results");
  await hold(4000);

  const videoPath = await ctx.finish();
  console.log(`  Done: ${videoPath}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
