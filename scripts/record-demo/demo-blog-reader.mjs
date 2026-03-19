#!/usr/bin/env node
/**
 * Demo 1: Blog Reader
 *
 * Navigate piyushvyas.com → click Writing → click the BAP blog post →
 * scroll through the article → show extraction.
 *
 * Produces: assets/demos/blog-reader-raw.webm + blog-reader-events.json
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRecordingContext } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../../assets/demos");

async function main() {
  console.log("Recording: Blog Reader demo");

  const ctx = await createRecordingContext({
    name: "blog-reader",
    outputDir: OUTPUT_DIR,
    headless: !process.env.DEMO_HEADFUL,
  });

  const { navigateTo, clickOn, smoothScroll, pause, finish } = ctx;

  // Step 1: Open the homepage
  console.log("  1. Opening piyushvyas.com...");
  await navigateTo("https://piyushvyas.com");
  await pause(2000); // Let viewer see the landing page

  // Step 2: Click "Writing"
  console.log('  2. Clicking "Writing"...');
  await clickOn('text="Writing"', { hesitate: 200, postDelay: 1500 });

  // Step 3: Click the BAP blog post
  console.log('  3. Opening "Introducing Browser Agent Protocol"...');
  await clickOn('text="Introducing Browser Agent Protocol"', {
    hesitate: 300,
    postDelay: 1500,
  });

  // Step 4: Scroll through the article
  console.log("  4. Scrolling through article...");
  await smoothScroll(800, { steps: 25 });
  await pause(1000);
  await smoothScroll(800, { steps: 25 });
  await pause(1000);
  await smoothScroll(800, { steps: 25 });
  await pause(1000);
  await smoothScroll(800, { steps: 25 });
  await pause(2000); // Hold at end

  // Step 5: Scroll back up a bit to show the article title area
  console.log("  5. Scrolling back to show article header...");
  await smoothScroll(1500, { steps: 30, direction: "up" });
  await pause(2000);

  // Finish
  const videoPath = await finish();
  console.log(`  Done: ${videoPath}`);
}

main().catch((err) => {
  console.error("Blog reader demo failed:", err);
  process.exit(1);
});
