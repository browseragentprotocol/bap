/**
 * @fileoverview Shared helpers for CLI commands
 *
 * Extracted the common post-action pattern (ariaSnapshot → writeSnapshot → observe → print)
 * that every interaction command uses after performing its action.
 */

import type { BAPClient } from "@browseragentprotocol/client";
import { printPageSummary } from "../output/formatter.js";
import { writeSnapshot } from "../output/filesystem.js";

/**
 * Post-action summary: snapshot the page and print metadata.
 * Used by click, fill, type, press, select, check, uncheck, hover.
 * Makes 2 server calls: ariaSnapshot + observe(metadata only).
 */
export async function postActionSummary(client: BAPClient): Promise<void> {
  const snapshot = await client.ariaSnapshot();
  const snapshotPath = await writeSnapshot(snapshot.snapshot);

  const obs = await client.observe({
    includeMetadata: true,
    includeInteractiveElements: false,
    maxElements: 0,
  });
  printPageSummary(obs.metadata?.url, obs.metadata?.title, snapshotPath);
}
