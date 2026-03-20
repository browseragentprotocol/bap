/**
 * @fileoverview Pattern-based data extraction helpers for agent/extract
 * @module @browseragentprotocol/server-playwright/handlers/extract
 */

import type { Page as PlaywrightPage } from "playwright";
import type { BAPSelector } from "@browseragentprotocol/protocol";

export async function extractDataFromContent(
  page: PlaywrightPage,
  _content: string,
  _instruction: string,
  schema: { type: string; properties?: Record<string, unknown>; items?: unknown },
  mode: string,
  includeSourceRefs: boolean
): Promise<{
  data: unknown;
  sources?: { ref: string; selector: BAPSelector; text?: string }[];
  confidence: number;
}> {
  const sources: { ref: string; selector: BAPSelector; text?: string }[] = [];

  const contentRoot = await findContentRoot(page);

  if (schema.type === "array" || mode === "list") {
    const items = await extractList(page, contentRoot, schema, includeSourceRefs, sources);
    return {
      data: items,
      sources: includeSourceRefs ? sources : undefined,
      confidence: items.length > 0 ? 0.8 : 0.3,
    };
  }

  if (mode === "table") {
    const rows = await extractTable(page, contentRoot, schema, includeSourceRefs, sources);
    return {
      data: rows,
      sources: includeSourceRefs ? sources : undefined,
      confidence: rows.length > 0 ? 0.8 : 0.3,
    };
  }

  if (schema.type === "object" && schema.properties) {
    const result = await extractObject(page, contentRoot, schema, includeSourceRefs, sources);
    return {
      data: result.data,
      sources: includeSourceRefs ? sources : undefined,
      confidence: result.confidence,
    };
  }

  const text = (await contentRoot.textContent()) ?? "";
  return {
    data: text.trim().slice(0, 5000),
    sources: includeSourceRefs ? sources : undefined,
    confidence: 0.5,
  };
}

async function findContentRoot(page: PlaywrightPage) {
  const candidates = [
    "main",
    '[role="main"]',
    "#content",
    ".content",
    "#main",
    ".page",
    ".container",
    '[role="document"]',
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        const text = (await loc.textContent()) ?? "";
        if (text.trim().length > 100) return loc;
      }
    } catch {
      /* continue */
    }
  }
  return page.locator("body");
}

async function extractList(
  _page: PlaywrightPage,
  root: ReturnType<PlaywrightPage["locator"]>,
  schema: { items?: unknown },
  includeSourceRefs: boolean,
  sources: { ref: string; selector: BAPSelector; text?: string }[]
): Promise<unknown[]> {
  const itemSchema = schema.items as
    | { type?: string; properties?: Record<string, { type?: string }> }
    | undefined;
  const isObjectItems = itemSchema?.type === "object" && itemSchema.properties;

  const containerSelectors = [
    "article",
    '[role="listitem"]',
    ".product",
    ".card",
    ".item",
    ".listing",
    ".result",
    ".entry",
    ".post",
    '[class*="product"]',
    '[class*="card"]',
    '[class*="item"]',
    "table tbody tr",
    "ol li",
    "ul li",
  ];

  let bestSelector = "";
  let bestCount = 0;

  for (const sel of containerSelectors) {
    try {
      const count = await root.locator(sel).count();
      if (count >= 2) {
        bestSelector = sel;
        bestCount = count;
        break; // First semantic match wins
      }
    } catch {
      /* continue */
    }
  }

  if (!bestSelector || bestCount === 0) return [];

  const elements = await root.locator(bestSelector).all();
  const items: unknown[] = [];
  const limit = Math.min(elements.length, 100);

  for (let i = 0; i < limit; i++) {
    const el = elements[i]!;

    try {
      const box = await el.boundingBox();
      if (box && (box.width < 10 || box.height < 10)) continue;
    } catch {
      /* proceed anyway */
    }

    if (isObjectItems && itemSchema?.properties) {
      const obj = await extractPropertiesFromElement(el, itemSchema.properties);
      const hasValue = Object.values(obj).some((v) => v !== null && v !== undefined && v !== "");
      if (hasValue) {
        items.push(obj);
        if (includeSourceRefs) {
          sources.push({
            ref: `@s${items.length}`,
            selector: { type: "css", value: `${bestSelector}:nth-child(${i + 1})` },
            text: Object.values(obj).filter(Boolean).join(" | ").slice(0, 100),
          });
        }
      }
    } else {
      const text = await el.textContent();
      if (text?.trim()) {
        items.push(text.trim());
        if (includeSourceRefs) {
          sources.push({
            ref: `@s${items.length}`,
            selector: { type: "css", value: `${bestSelector}:nth-child(${i + 1})` },
            text: text.trim().slice(0, 100),
          });
        }
      }
    }
  }

  // Fallback: text-based extraction
  if (items.length === 0 && isObjectItems && itemSchema?.properties && elements.length > 0) {
    const propNames = Object.keys(itemSchema.properties);
    for (let i = 0; i < limit; i++) {
      const el = elements[i]!;
      try {
        const box = await el.boundingBox();
        if (box && (box.width < 10 || box.height < 10)) continue;
      } catch {
        /* proceed */
      }

      const fullText = (await el.textContent()) ?? "";
      if (!fullText.trim()) continue;

      const obj: Record<string, unknown> = {};
      for (const key of propNames) {
        const kl = key.toLowerCase();
        if (kl === "title" || kl === "name") {
          try {
            const heading = el.locator("h1, h2, h3, h4, h5, h6").first();
            if ((await heading.count()) > 0) {
              const link = heading.locator("a").first();
              if ((await link.count()) > 0) {
                obj[key] = (await link.getAttribute("title")) ?? (await link.textContent()) ?? null;
              } else {
                obj[key] = (await heading.textContent()) ?? null;
              }
            }
          } catch {
            /* skip */
          }
        } else if (kl === "price" || kl === "cost" || kl === "amount") {
          const priceMatch = fullText.match(/[$€£¥]\s*[\d,.]+|[\d,.]+\s*[$€£¥]/);
          if (priceMatch) obj[key] = priceMatch[0].trim();
        } else if (kl === "url" || kl === "link" || kl === "href") {
          try {
            const link = el.locator("a").first();
            if ((await link.count()) > 0) obj[key] = await link.getAttribute("href");
          } catch {
            /* skip */
          }
        } else if (kl === "rating") {
          try {
            const ratingEl = el.locator('[class*="rating"], [class*="star"]').first();
            if ((await ratingEl.count()) > 0) {
              const cls = (await ratingEl.getAttribute("class")) ?? "";
              const parts = cls
                .split(/\s+/)
                .filter(
                  (c) =>
                    !c.toLowerCase().includes("rating") &&
                    !c.toLowerCase().includes("star") &&
                    c.length > 0
                );
              if (parts.length > 0) obj[key] = parts[parts.length - 1];
            }
          } catch {
            /* skip */
          }
        } else if (kl === "availability" || kl === "stock" || kl === "status") {
          try {
            const stockEl = el
              .locator('[class*="avail"], [class*="stock"], .availability, .stock')
              .first();
            if ((await stockEl.count()) > 0) {
              obj[key] = ((await stockEl.textContent()) ?? "").trim() || null;
            }
          } catch {
            /* skip */
          }
        }
      }

      const hasValue = Object.values(obj).some((v) => v !== null && v !== undefined && v !== "");
      if (hasValue) {
        items.push(obj);
        if (includeSourceRefs) {
          sources.push({
            ref: `@s${items.length}`,
            selector: { type: "css", value: `${bestSelector}:nth-child(${i + 1})` },
            text: Object.values(obj).filter(Boolean).join(" | ").slice(0, 100),
          });
        }
      }
    }
  }

  return items;
}

async function extractPropertiesFromElement(
  el: ReturnType<PlaywrightPage["locator"]>,
  properties: Record<string, { type?: string }>
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    const keyLower = key.toLowerCase();
    let value: string | null = null;

    const classSelectors = [`[class*="${keyLower}"]`, `[data-${keyLower}]`, `.${keyLower}`];

    for (const sel of classSelectors) {
      try {
        const child = el.locator(sel).first();
        if ((await child.count()) > 0) {
          if (keyLower === "title" || keyLower === "name") {
            value = (await child.getAttribute("title")) ?? (await child.textContent());
          } else {
            value = await child.textContent();
          }
          if (!value?.trim()) {
            const cls = (await child.getAttribute("class")) ?? "";
            const clsParts = cls.split(/\s+/).filter((c) => !c.includes(keyLower) && c.length > 0);
            if (clsParts.length > 0) value = clsParts[clsParts.length - 1] ?? null;
          }
          if (value?.trim()) break;
        }
      } catch {
        /* continue */
      }
    }

    if (!value?.trim()) {
      try {
        if (keyLower === "title" || keyLower === "name") {
          for (const sel of ["h1 a", "h2 a", "h3 a", "h4 a", "h1", "h2", "h3", "h4", "a[title]"]) {
            const child = el.locator(sel).first();
            if ((await child.count()) > 0) {
              value = (await child.getAttribute("title")) ?? (await child.textContent());
              if (value?.trim()) break;
            }
          }
        } else if (keyLower === "price" || keyLower === "cost" || keyLower === "amount") {
          const text = (await el.textContent()) ?? "";
          const priceMatch = text.match(/[$€£¥]\s*[\d,.]+|[\d,.]+\s*[$€£¥]/);
          if (priceMatch) value = priceMatch[0].trim();
        } else if (keyLower === "url" || keyLower === "link" || keyLower === "href") {
          const link = el.locator("a").first();
          if ((await link.count()) > 0) {
            value = await link.getAttribute("href");
          }
        } else if (keyLower === "image" || keyLower === "img" || keyLower === "thumbnail") {
          const img = el.locator("img").first();
          if ((await img.count()) > 0) {
            value = await img.getAttribute("src");
          }
        }
      } catch {
        /* continue */
      }
    }

    const trimmed = value?.trim() ?? null;
    if (trimmed === null) {
      result[key] = null;
    } else if (propSchema.type === "number") {
      const num = parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
      result[key] = isNaN(num) ? trimmed : num;
    } else if (propSchema.type === "boolean") {
      result[key] = ["true", "yes", "1", "in stock", "available"].includes(trimmed.toLowerCase());
    } else {
      result[key] = trimmed;
    }
  }

  return result;
}

async function extractTable(
  _page: PlaywrightPage,
  root: ReturnType<PlaywrightPage["locator"]>,
  schema: { items?: unknown },
  includeSourceRefs: boolean,
  sources: { ref: string; selector: BAPSelector; text?: string }[]
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const itemSchema = schema.items as { properties?: Record<string, { type?: string }> } | undefined;

  try {
    const headers: string[] = [];
    const thElements = await root.locator("table th").all();
    for (const th of thElements) {
      headers.push(((await th.textContent()) ?? "").trim().toLowerCase());
    }

    const trElements = await root.locator("table tbody tr").all();
    const limit = Math.min(trElements.length, 100);

    for (let i = 0; i < limit; i++) {
      const tr = trElements[i]!;
      const cells = await tr.locator("td").all();
      const obj: Record<string, unknown> = {};

      if (itemSchema?.properties) {
        for (const [key, propSchema] of Object.entries(itemSchema.properties)) {
          const colIdx = headers.findIndex((h) => h.includes(key.toLowerCase()));
          if (colIdx >= 0 && colIdx < cells.length) {
            const text = ((await cells[colIdx]!.textContent()) ?? "").trim();
            obj[key] =
              propSchema.type === "number"
                ? parseFloat(text.replace(/[^0-9.-]/g, "")) || text
                : text;
          }
        }
      } else {
        for (let c = 0; c < cells.length; c++) {
          const key = c < headers.length ? headers[c]! : `col${c}`;
          obj[key] = ((await cells[c]!.textContent()) ?? "").trim();
        }
      }

      if (Object.values(obj).some((v) => v !== null && v !== undefined && v !== "")) {
        rows.push(obj);
        if (includeSourceRefs) {
          sources.push({
            ref: `@s${rows.length}`,
            selector: { type: "css", value: `table tbody tr:nth-child(${i + 1})` },
          });
        }
      }
    }
  } catch {
    /* table extraction failed */
  }

  return rows;
}

async function extractObject(
  page: PlaywrightPage,
  root: ReturnType<PlaywrightPage["locator"]>,
  schema: { properties?: Record<string, unknown> },
  includeSourceRefs: boolean,
  sources: { ref: string; selector: BAPSelector; text?: string }[]
): Promise<{ data: Record<string, unknown>; confidence: number }> {
  const result: Record<string, unknown> = {};
  const properties = schema.properties as Record<string, { type?: string; description?: string }>;

  for (const [key, propSchema] of Object.entries(properties)) {
    const searchTerms = [key, propSchema.description].filter(Boolean);

    for (const term of searchTerms) {
      if (!term) continue;

      const labelSelectors = [
        `label:has-text("${term}")`,
        `th:has-text("${term}")`,
        `dt:has-text("${term}")`,
        `[class*="${term.toLowerCase()}"]`,
      ];

      for (const selector of labelSelectors) {
        try {
          const label = root.locator(selector).first();
          if ((await label.count()) > 0) {
            const parent = label.locator("..");
            const siblingText = await parent.textContent();
            if (siblingText) {
              const value = siblingText.replace(new RegExp(term, "gi"), "").trim();
              if (value) {
                result[key] = propSchema.type === "number" ? parseFloat(value) || value : value;
                if (includeSourceRefs) {
                  sources.push({
                    ref: `@s${Object.keys(result).length}`,
                    selector: { type: "css", value: selector },
                    text: value.slice(0, 100),
                  });
                }
                break;
              }
            }
          }
        } catch {
          /* continue */
        }
      }
    }
  }

  // Fallback for meta-based extraction
  if (Object.keys(result).length === 0) {
    try {
      for (const key of Object.keys(properties)) {
        if (key === "title" || key === "name") {
          result[key] = await page.title();
        } else if (key === "description") {
          const desc = await page.locator('meta[name="description"]').getAttribute("content");
          if (desc) result[key] = desc;
        } else if (key === "url") {
          result[key] = page.url();
        }
      }
    } catch {
      /* continue */
    }
  }

  return {
    data:
      Object.keys(result).length > 0
        ? result
        : { raw: ((await root.textContent()) ?? "").slice(0, 1000) },
    confidence: Object.keys(result).length > 0 ? 0.7 : 0.2,
  };
}
