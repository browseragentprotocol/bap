#!/usr/bin/env node
/**
 * Demo 2: Skill Scorer — Multi-Tab Workflow
 *
 * Story: BAP works across two sites — skills.menu and GitHub — managing
 * them like browser tabs. Shows tab switching for cross-site workflows.
 *
 * Technical note: Playwright's recordVideo captures a single page. We use
 * one page and navigate between URLs, with an injected tab bar overlay to
 * give the visual effect of tab switching.
 *
 * Flow:
 *   1. Open skills.menu (landing page) — [Tab 1 active]
 *   2. Click "Try It"
 *   3. "Switch" to GitHub tab — navigate to SKILL.md — [Tab 2 active]
 *   4. Read the SKILL.md (scroll)
 *   5. "Switch" back to skills.menu tab — [Tab 1 active]
 *   6. Paste the SKILL.md content
 *   7. Click Score → show results
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordingContext } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../assets/demos");

// ---------------------------------------------------------------------------
// Tab bar overlay — injected to visualize multi-tab state
// ---------------------------------------------------------------------------

function tabBarScript(tabs, activeIndex) {
  const tabsHtml = tabs
    .map((tab, i) => {
      const isActive = i === activeIndex;
      const bg = isActive ? "background:#313244;" : "background:transparent;";
      const color = isActive ? "color:#cdd6f4;font-weight:500;" : "color:#6c7086;font-weight:400;";
      const dot = isActive ? "#a6e3a1" : "#585b70";
      return `<div style="display:flex;align-items:center;gap:8px;padding:0 18px;${bg}${color}border-radius:8px 8px 0 0;margin-top:6px;white-space:nowrap;"><span style="width:8px;height:8px;border-radius:50%;background:${dot};"></span>${tab}</div>`;
    })
    .join("");

  return `(() => {
    let bar = document.getElementById('__tabbar');
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.id = '__tabbar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483645;height:44px;background:#1e1e2e;display:flex;align-items:stretch;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;padding:0 8px;gap:2px;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    bar.innerHTML = ${JSON.stringify(tabsHtml)};
    document.body.appendChild(bar);
    document.body.style.paddingTop = '44px';
  })()`;
}

const TABS = ["skills.menu — Try It", "GitHub — frontend-design/SKILL.md"];

// ---------------------------------------------------------------------------
// Fetch SKILL.md content
// ---------------------------------------------------------------------------

async function fetchSkillContent() {
  const res = await fetch(
    "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md"
  );
  if (!res.ok) throw new Error(`Failed to fetch SKILL.md: ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Recording: Skill Scorer (multi-tab)");

  console.log("  Fetching SKILL.md...");
  const skillContent = await fetchSkillContent();

  const ctx = await createRecordingContext({
    name: "skill-scorer",
    outputDir: OUTPUT_DIR,
    headless: !process.env.DEMO_HEADFUL,
  });

  const { page, navigateTo, clickOn, smoothScroll, fillField, hold, waitForStable, ensureCursor } =
    ctx;

  // Helper
  async function showTabs(activeIdx) {
    try {
      await page.evaluate(tabBarScript(TABS, activeIdx));
    } catch {}
  }

  // =========================================================================
  // 1. Open skills.menu landing page — [Tab 1]
  // =========================================================================
  console.log("  1/8 skills.menu landing");
  await navigateTo("https://www.skills.menu");
  await showTabs(0);
  await hold(2500);

  // =========================================================================
  // 2. Click "Try It"
  // =========================================================================
  console.log("  2/8 Click Try It");
  await clickOn('a:has-text("Try It")', { hesitate: 200 });
  await waitForStable();
  await showTabs(0);
  await hold(2000);

  // =========================================================================
  // 3. "Switch to Tab 2" — navigate to GitHub SKILL.md
  // =========================================================================
  console.log("  3/8 Switch to GitHub tab");
  await navigateTo(
    "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md"
  );
  await showTabs(1);
  await hold(2500);

  // =========================================================================
  // 4. Read the SKILL.md on GitHub
  // =========================================================================
  console.log("  4/8 Reading SKILL.md");
  await smoothScroll(500, { duration: 1500 });
  await hold(2000);
  await smoothScroll(400, { duration: 1200 });
  await hold(2000);

  // =========================================================================
  // 5. "Switch back to Tab 1" — navigate to skills.menu/try
  // =========================================================================
  console.log("  5/8 Switch to skills.menu");
  await navigateTo("https://www.skills.menu/try");
  await showTabs(0);
  ctx.events.log("tab-switch", 0, 0, { tab: 1 });
  await hold(1500);

  // =========================================================================
  // 6. Paste the SKILL.md
  // =========================================================================
  console.log("  6/8 Pasting SKILL.md");
  await fillField("#skill-input", skillContent);
  await hold(1200);

  // =========================================================================
  // 7. Click Score
  // =========================================================================
  console.log("  7/8 Scoring");
  await clickOn('button:has-text("score")', { hesitate: 300 });
  await waitForStable();
  await hold(1500);

  // =========================================================================
  // 8. Hold on results
  // =========================================================================
  console.log("  8/8 Results");
  await hold(4000);

  const videoPath = await ctx.finish();
  console.log(`  Done: ${videoPath}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
