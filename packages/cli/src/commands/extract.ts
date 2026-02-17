/**
 * bap extract — Structured data extraction
 *
 * Flags:
 *   --fields="title,price,rating"   Quick field extraction
 *   --schema=schema.json            JSON Schema-based extraction
 *   --list="product"                Extract list of items
 */

import fs from "node:fs/promises";
import type { BAPClient } from "@browseragentprotocol/client";
import type { ExtractionSchema } from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { printExtractionResult } from "../output/formatter.js";
import { writeExtraction } from "../output/filesystem.js";
import { register } from "./registry.js";

async function extractCommand(
  _args: string[],
  flags: GlobalFlags,
  client: BAPClient,
): Promise<void> {
  let schema: ExtractionSchema;
  let mode: "single" | "list" = "single";
  let instruction: string;

  if (flags.fields) {
    // Auto-generate schema from field names
    const fields = flags.fields.split(",").map((f) => f.trim());
    const properties: Record<string, { type: string; description: string }> = {};
    for (const field of fields) {
      properties[field] = { type: "string", description: field };
    }
    schema = { type: "object", properties } as ExtractionSchema;
    instruction = `Extract the following fields: ${fields.join(", ")}`;
  } else if (flags.schema) {
    // Read schema from file
    const schemaContent = await fs.readFile(flags.schema, "utf-8");
    schema = JSON.parse(schemaContent) as ExtractionSchema;
    instruction = "Extract data matching the provided schema";
    if ((schema as Record<string, unknown>).type === "array") {
      mode = "list";
    }
  } else if (flags.list) {
    // Auto-generate list schema
    schema = {
      type: "array",
      items: { type: "object", properties: {} },
    } as unknown as ExtractionSchema;
    instruction = `Extract all ${flags.list} items from the page`;
    mode = "list";
  } else {
    console.error("Usage: bap extract --fields=... | --schema=... | --list=...");
    console.error("");
    console.error("Examples:");
    console.error('  bap extract --fields="title,price,rating"');
    console.error("  bap extract --schema=product.json");
    console.error('  bap extract --list="product"');
    process.exit(1);
  }

  const result = await client.extract({
    instruction,
    schema,
    mode,
  });

  const filepath = await writeExtraction(result.data);
  printExtractionResult(result, filepath);
}

register("extract", extractCommand);
