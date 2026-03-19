/**
 * Recording harness for professional demo videos.
 *
 * Design principles:
 * - Never show an empty/white screen — wait for visual stability before proceeding
 * - 2K resolution (2560x1440) for crisp output
 * - Human-like cursor movement with bezier curves
 * - Generous pauses on meaningful content, tight transitions on loading
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { bezierPath, fittsDuration } from "./bezier.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIDTH = 2560;
const HEIGHT = 1440;

// ---------------------------------------------------------------------------
// Event logger
// ---------------------------------------------------------------------------

export class EventLog {
  constructor(name, outputDir) {
    this.name = name;
    this.outputDir = outputDir;
    this.events = [];
    this.startTime = Date.now();
  }

  log(type, x, y, extra = {}) {
    this.events.push({
      type,
      x: Math.round(x),
      y: Math.round(y),
      t: (Date.now() - this.startTime) / 1000,
      ...extra,
    });
  }

  save() {
    const filePath = path.join(this.outputDir, `${this.name}-events.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.events, null, 2));
    return filePath;
  }
}

// ---------------------------------------------------------------------------
// Cursor overlay
// ---------------------------------------------------------------------------

const CURSOR_STYLE = `
  position: fixed; z-index: 2147483647; pointer-events: none;
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  border: 2.5px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  top: -50px; left: -50px;
`;

const RIPPLE_STYLE = `
  position: fixed; z-index: 2147483646; pointer-events: none;
  width: 48px; height: 48px; border-radius: 50%;
  border: 3px solid rgba(59, 130, 246, 0.6);
  transform: translate(-50%, -50%) scale(0); opacity: 0;
  top: -50px; left: -50px;
`;

function injectCursorScript() {
  return `(() => {
    if (document.getElementById('__dc')) return;
    const c = document.createElement('div');
    c.id = '__dc';
    c.style.cssText = ${JSON.stringify(CURSOR_STYLE)};
    document.body.appendChild(c);
    const r = document.createElement('div');
    r.id = '__dr';
    r.style.cssText = ${JSON.stringify(RIPPLE_STYLE)};
    document.body.appendChild(r);
  })()`;
}

// ---------------------------------------------------------------------------
// Recording context
// ---------------------------------------------------------------------------

export async function createRecordingContext(options) {
  const { name, outputDir, headless = true } = options;

  fs.mkdirSync(outputDir, { recursive: true });
  const rawDir = path.join(outputDir, `${name}-raw`);
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: { dir: rawDir, size: { width: WIDTH, height: HEIGHT } },
  });

  const page = await context.newPage();
  const events = new EventLog(name, outputDir);
  let cursorX = WIDTH / 2;
  let cursorY = HEIGHT / 2;

  // Re-inject cursor after every navigation
  async function ensureCursor() {
    try {
      await page.evaluate(injectCursorScript());
    } catch {
      // mid-navigation, ignore
    }
  }
  page.on("load", () => ensureCursor());

  // ---------------------------------------------------------------------------
  // Wait helpers — the key to eliminating empty screens
  // ---------------------------------------------------------------------------

  /**
   * Wait until the page is visually stable:
   * network idle + no layout shifts for a short window.
   */
  async function waitForStable(timeoutMs = 15000) {
    try {
      await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    } catch {
      // Some pages never reach networkidle (analytics, websockets).
      // Fall back to a shorter domcontentloaded + delay.
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    }
    // Extra settle time for fonts, images, lazy renders
    await sleep(400);
  }

  // ---------------------------------------------------------------------------
  // Cursor movement
  // ---------------------------------------------------------------------------

  async function moveTo(x, y) {
    const from = { x: cursorX, y: cursorY };
    const to = { x, y };
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    const duration = fittsDuration(dist);
    const steps = Math.max(25, Math.round(duration / 16));
    const points = bezierPath(from, to, steps);
    const delay = duration / steps;

    for (const p of points) {
      await page.evaluate(
        `(() => { const c = document.getElementById('__dc'); if(c){ c.style.left='${p.x}px'; c.style.top='${p.y}px'; }})()`
      );
      await page.mouse.move(p.x, p.y);
      events.log("move", p.x, p.y);
      await sleep(delay);
    }
    cursorX = x;
    cursorY = y;
  }

  /**
   * Click on a selector with human-like cursor motion and visual feedback.
   *
   * @param {string} selector - Playwright selector
   * @param {Object} opts
   * @param {number} opts.hesitate - ms to pause before clicking (default 120)
   * @param {number} opts.settle - ms to wait after click for page to react (default 200)
   */
  async function clickOn(selector, opts = {}) {
    const { hesitate = 120, settle = 200 } = opts;

    // Wait for the element to be visible and stable
    const el = page.locator(selector).first();
    await el.waitFor({ state: "visible", timeout: 10000 });
    const box = await el.boundingBox();
    if (!box) throw new Error(`No bounding box for: ${selector}`);

    // Target center with slight human randomness
    const tx = box.x + box.width / 2 + (Math.random() - 0.5) * Math.min(box.width * 0.2, 8);
    const ty = box.y + box.height / 2 + (Math.random() - 0.5) * Math.min(box.height * 0.2, 4);

    await moveTo(tx, ty);
    await sleep(hesitate);

    // Click ripple
    await page.evaluate(`(() => {
      const r = document.getElementById('__dr');
      if(!r) return;
      r.style.left='${tx}px'; r.style.top='${ty}px';
      r.style.opacity='1'; r.style.transition='none';
      r.style.transform='translate(-50%,-50%) scale(0)';
      r.offsetHeight;
      r.style.transition='transform 0.35s ease-out, opacity 0.35s ease-out';
      r.style.transform='translate(-50%,-50%) scale(2.5)';
      r.style.opacity='0';
    })()`);

    events.log("click", tx, ty, { selector });
    await el.click();
    await sleep(settle);
  }

  /**
   * Navigate to a URL and wait for visual stability. No empty screens.
   */
  async function navigateTo(url) {
    await page.goto(url, { waitUntil: "commit" });
    // Don't wait — let the page start rendering. We wait for stable next.
    await waitForStable();
    await ensureCursor();
    events.log("navigate", 0, 0, { url });
  }

  /**
   * Smooth scroll that looks natural.
   */
  async function smoothScroll(pixels, opts = {}) {
    const { duration = 1200, direction = "down" } = opts;
    const sign = direction === "up" ? -1 : 1;
    const steps = Math.round(duration / 20);
    const perStep = (pixels * sign) / steps;

    for (let i = 0; i < steps; i++) {
      // Ease-in-out scroll speed
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const delta = perStep * (0.5 + ease);
      await page.evaluate(`window.scrollBy(0, ${delta})`);
      events.log("scroll", cursorX, cursorY);
      await sleep(20);
    }
  }

  /**
   * Fill a text field by clicking it, selecting all, and inserting text.
   * Uses insertText for compatibility with React/Astro controlled inputs.
   */
  async function fillField(selector, text) {
    await clickOn(selector, { hesitate: 150, settle: 100 });
    await page.keyboard.press("Meta+a");
    await sleep(100);
    await page.keyboard.insertText(text);
    await sleep(200);
  }

  /**
   * Pause for the viewer — use for breathing room on meaningful content.
   */
  async function hold(ms) {
    await sleep(ms);
  }

  // ---------------------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------------------

  async function finish() {
    const outputVideo = path.join(outputDir, `${name}-raw.webm`);
    await page.close();
    await page.video()?.saveAs(outputVideo);
    await context.close();
    await browser.close();

    if (!fs.existsSync(outputVideo) || fs.statSync(outputVideo).size === 0) {
      throw new Error("Recording produced empty video file");
    }

    fs.rmSync(rawDir, { recursive: true, force: true });
    events.save();

    const sizeMB = (fs.statSync(outputVideo).size / 1024 / 1024).toFixed(1);
    console.log(`  Raw video: ${outputVideo} (${sizeMB} MB)`);
    return outputVideo;
  }

  return {
    page,
    events,
    navigateTo,
    clickOn,
    moveTo,
    smoothScroll,
    fillField,
    hold,
    waitForStable,
    ensureCursor,
    finish,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
