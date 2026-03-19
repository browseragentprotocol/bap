#!/usr/bin/env node
/**
 * Demo 1: Blog Reader
 *
 * Story: BAP navigates a personal website, finds a blog post, reads it.
 * Shows: navigate → click → scroll — the core BAP workflow.
 *
 * Flow:
 *   1. Land on piyushvyas.com (hold — let viewer absorb the site)
 *   2. Click "Writing" (wait for blog listing to render)
 *   3. Click "Introducing Browser Agent Protocol" (wait for article)
 *   4. Scroll through the article at a readable pace
 *   5. Hold at a visually interesting section
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordingContext } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../assets/demos");

async function main() {
  console.log("Recording: Blog Reader");

  const ctx = await createRecordingContext({
    name: "blog-reader",
    outputDir: OUTPUT_DIR,
    headless: !process.env.DEMO_HEADFUL,
  });

  const { navigateTo, clickOn, smoothScroll, hold, finish } = ctx;

  // 1. Landing page — give viewer time to see the site
  console.log("  1/5 Landing page");
  await navigateTo("https://piyushvyas.com");
  await hold(2500);

  // 2. Click "Writing" — navigate to blog listing
  console.log("  2/5 Writing page");
  await clickOn('a:has-text("Writing")', { hesitate: 200 });
  await ctx.waitForStable();
  await hold(2000);

  // 3. Click the BAP blog post
  console.log("  3/5 Opening article");
  await clickOn('a:has-text("Introducing Browser Agent Protocol")', { hesitate: 250 });
  await ctx.waitForStable();
  await hold(1500);

  // 4. Read through the article — smooth, natural pace
  console.log("  4/5 Reading article");
  await smoothScroll(600, { duration: 1800 });
  await hold(1200);
  await smoothScroll(700, { duration: 2000 });
  await hold(1200);
  await smoothScroll(600, { duration: 1800 });
  await hold(1500);
  await smoothScroll(500, { duration: 1500 });
  await hold(2000);

  // 5. Scroll back to show the article header — end on a strong frame
  console.log("  5/5 Final hold");
  await smoothScroll(1200, { duration: 2500, direction: "up" });
  await hold(3000);

  const videoPath = await finish();
  console.log(`  Done: ${videoPath}`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
