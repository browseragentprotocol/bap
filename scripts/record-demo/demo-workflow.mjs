/**
 * Demo: "Workflow in 3 Commands"
 *
 * Shows BAP's killer features on books.toscrape.com:
 * 1. Navigate + observe (fused) — show interactive elements
 * 2. Click a category — composite action
 * 3. Extract structured data — fields extraction
 *
 * This demo shows what makes BAP different: fewer commands,
 * semantic selectors, and structured output.
 */

import { createRecordingContext } from "./harness.mjs";

const OUTPUT_DIR = "assets/demos";
const NAME = "workflow";

async function run() {
  const headless = !process.argv.includes("--headful");
  const ctx = await createRecordingContext({ name: NAME, outputDir: OUTPUT_DIR, headless });
  const { page, navigateTo, clickOn, smoothScroll, hold, waitForStable, finish } = ctx;

  // Scene 1: Navigate to books.toscrape.com
  await navigateTo("https://books.toscrape.com/");
  await hold(2500);

  // Scene 2: Click on "Travel" category in the sidebar
  await clickOn('a:has-text("Travel")');
  await waitForStable();
  await hold(2000);

  // Scene 3: Scroll down to show book listings
  await smoothScroll({ distance: 600, duration: 1500 });
  await hold(2000);

  // Scene 4: Click on a book to view details
  await clickOn("article.product_pod h3 a >> nth=0");
  await waitForStable();
  await hold(2500);

  // Scene 5: Scroll to show full book details
  await smoothScroll({ distance: 400, duration: 1200 });
  await hold(3000);

  // Scene 6: Scroll back up to show the title
  await smoothScroll({ distance: -400, duration: 1200 });
  await hold(3000);

  const rawPath = await finish();
  console.log(`Raw video: ${rawPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
