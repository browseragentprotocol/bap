/**
 * Shared recording harness for demo videos.
 *
 * Sets up Playwright with recordVideo, injects a visible cursor element,
 * provides human-like cursor movement, and logs events for FFmpeg post-processing.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { bezierPath, fittsDuration } from "./bezier.mjs";

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
      t: (Date.now() - this.startTime) / 1000, // seconds since recording start
      ...extra,
    });
  }

  save() {
    const filePath = path.join(this.outputDir, `${this.name}-events.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.events, null, 2));
    console.log(`  Events saved: ${filePath} (${this.events.length} events)`);
    return filePath;
  }
}

// ---------------------------------------------------------------------------
// Cursor overlay (injected into the page DOM)
// ---------------------------------------------------------------------------

const CURSOR_INJECT_SCRIPT = `
(() => {
  if (document.getElementById('__demo_cursor')) return;
  const cursor = document.createElement('div');
  cursor.id = '__demo_cursor';
  cursor.style.cssText = [
    'position: fixed',
    'z-index: 2147483647',
    'pointer-events: none',
    'width: 20px',
    'height: 20px',
    'border-radius: 50%',
    'background: rgba(0, 0, 0, 0.7)',
    'border: 2px solid rgba(255, 255, 255, 0.9)',
    'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3)',
    'top: -40px',
    'left: -40px',
    'transform: translate(-50%, -50%)',
  ].join(';');
  document.body.appendChild(cursor);

  // Click ripple element (hidden by default)
  const ripple = document.createElement('div');
  ripple.id = '__demo_ripple';
  ripple.style.cssText = [
    'position: fixed',
    'z-index: 2147483646',
    'pointer-events: none',
    'width: 40px',
    'height: 40px',
    'border-radius: 50%',
    'border: 3px solid rgba(59, 130, 246, 0.7)',
    'transform: translate(-50%, -50%) scale(0)',
    'opacity: 0',
    'top: -40px',
    'left: -40px',
  ].join(';');
  document.body.appendChild(ripple);
})()
`;

const CURSOR_MOVE_SCRIPT = (x, y) => `
  const c = document.getElementById('__demo_cursor');
  if (c) { c.style.left = '${x}px'; c.style.top = '${y}px'; }
`;

const CLICK_RIPPLE_SCRIPT = (x, y) => `
(() => {
  const r = document.getElementById('__demo_ripple');
  if (!r) return;
  r.style.left = '${x}px';
  r.style.top = '${y}px';
  r.style.opacity = '1';
  r.style.transform = 'translate(-50%, -50%) scale(0)';
  r.offsetHeight; // force reflow
  r.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
  r.style.transform = 'translate(-50%, -50%) scale(2)';
  r.style.opacity = '0';
  setTimeout(() => { r.style.transition = 'none'; }, 500);
})()
`;

// ---------------------------------------------------------------------------
// Recording context
// ---------------------------------------------------------------------------

/**
 * Create a recording context with Playwright video capture and cursor overlay.
 *
 * @param {Object} options
 * @param {string} options.name - Demo name (used for output filenames)
 * @param {string} options.outputDir - Directory for output files
 * @param {boolean} [options.headless=true] - Run headless (set false for local preview)
 * @param {number} [options.width=1920] - Viewport width
 * @param {number} [options.height=1080] - Viewport height
 */
export async function createRecordingContext(options) {
  const { name, outputDir, headless = true, width = 1920, height = 1080 } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const rawDir = path.join(outputDir, `${name}-raw`);
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: {
      dir: rawDir,
      size: { width, height },
    },
  });

  const page = await context.newPage();
  const events = new EventLog(name, outputDir);

  // Track cursor position
  let cursorX = width / 2;
  let cursorY = height / 2;

  // Inject cursor on every navigation
  const injectCursor = async () => {
    try {
      await page.evaluate(CURSOR_INJECT_SCRIPT);
    } catch {
      // Page might be mid-navigation
    }
  };

  page.on("load", () => injectCursor());
  page.on("domcontentloaded", () => injectCursor());

  // ---------------------------------------------------------------------------
  // Cursor movement helpers
  // ---------------------------------------------------------------------------

  /**
   * Move the cursor from current position to (x, y) with bezier animation.
   */
  async function moveTo(x, y) {
    const from = { x: cursorX, y: cursorY };
    const to = { x, y };
    const dist = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2);
    const duration = fittsDuration(dist);
    const steps = Math.max(20, Math.round(duration / 16)); // ~60fps
    const points = bezierPath(from, to, steps);
    const delayPerStep = duration / steps;

    for (const p of points) {
      await page.evaluate(CURSOR_MOVE_SCRIPT(p.x, p.y));
      await page.mouse.move(p.x, p.y);
      events.log("move", p.x, p.y);
      await sleep(delayPerStep);
    }

    cursorX = x;
    cursorY = y;
  }

  /**
   * Move cursor to the center of a selector and click it.
   */
  async function clickOn(selector, options = {}) {
    const { hesitate = 100, postDelay = 300 } = options;

    // Get element bounding box
    const el = page.locator(selector).first();
    const box = await el.boundingBox();
    if (!box) throw new Error(`Element not found: ${selector}`);

    // Target: center of element with slight randomness
    const tx = box.x + box.width / 2 + (Math.random() - 0.5) * Math.min(box.width * 0.3, 10);
    const ty = box.y + box.height / 2 + (Math.random() - 0.5) * Math.min(box.height * 0.3, 6);

    await moveTo(tx, ty);
    await sleep(hesitate);

    // Click ripple
    await page.evaluate(CLICK_RIPPLE_SCRIPT(tx, ty));
    events.log("click", tx, ty, { selector });
    await el.click();

    await sleep(postDelay);
  }

  /**
   * Type text character by character with human-like delays.
   */
  async function typeText(text, options = {}) {
    const { minDelay = 40, maxDelay = 120 } = options;
    for (const char of text) {
      await page.keyboard.type(char);
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      // Occasional "thinking" pause
      const pause = Math.random() < 0.05 ? 200 + Math.random() * 300 : 0;
      await sleep(delay + pause);
    }
  }

  /**
   * Smooth scroll with visible motion.
   */
  async function smoothScroll(pixels, options = {}) {
    const { steps = 20, direction = "down" } = options;
    const perStep = pixels / steps;
    const sign = direction === "up" ? -1 : 1;

    for (let i = 0; i < steps; i++) {
      await page.evaluate(`window.scrollBy(0, ${sign * perStep})`);
      events.log("scroll", cursorX, cursorY, { direction, delta: sign * perStep });
      await sleep(30 + Math.random() * 20);
    }
  }

  /**
   * Navigate and wait for load, re-inject cursor.
   */
  async function navigateTo(url, options = {}) {
    const { waitUntil = "domcontentloaded" } = options;
    await page.goto(url, { waitUntil });
    await injectCursor();
    events.log("navigate", 0, 0, { url });
    await sleep(500);
  }

  /**
   * Pause for visibility.
   */
  async function pause(ms) {
    await sleep(ms);
  }

  // ---------------------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------------------

  async function finish() {
    // Playwright finalizes the video file when the page/context closes.
    // Use saveAs() to ensure the file is fully written before we move it.
    const outputVideo = path.join(outputDir, `${name}-raw.webm`);
    await page.close(); // Triggers video finalization
    await page.video()?.saveAs(outputVideo);
    await context.close();
    await browser.close();

    // Verify the output
    if (!fs.existsSync(outputVideo) || fs.statSync(outputVideo).size === 0) {
      throw new Error("Video file is empty — recording may have failed");
    }

    // Clean up temp dir
    fs.rmSync(rawDir, { recursive: true, force: true });

    console.log(`  Raw video: ${outputVideo}`);
    events.save();

    return outputVideo;
  }

  return {
    browser,
    context,
    page,
    events,
    moveTo,
    clickOn,
    typeText,
    smoothScroll,
    navigateTo,
    pause,
    finish,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
