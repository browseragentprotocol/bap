import { describe, it, expect } from "vitest";
import {
  normalizeAccessibleName,
  normalizeTag,
  normalizeRole,
  tokenize,
  jaccardSimilarity,
  nameSimilarity,
} from "../canonicalizer.js";

describe("normalizeAccessibleName", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeAccessibleName("  Add   to   cart  ")).toBe("add to cart");
  });

  it("handles newlines and tabs", () => {
    expect(normalizeAccessibleName("Submit\n\tForm")).toBe("submit form");
  });

  it("lowercases", () => {
    expect(normalizeAccessibleName("Add To Cart")).toBe("add to cart");
  });

  it("normalizes unicode to NFC", () => {
    // é as combining sequence vs precomposed
    const combining = "caf\u0065\u0301"; // e + combining acute
    const precomposed = "caf\u00e9"; // precomposed é
    expect(normalizeAccessibleName(combining)).toBe(normalizeAccessibleName(precomposed));
  });

  it("returns empty string for empty input", () => {
    expect(normalizeAccessibleName("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeAccessibleName("   \n\t  ")).toBe("");
  });
});

describe("normalizeTag", () => {
  it("lowercases tag names", () => {
    expect(normalizeTag("BUTTON")).toBe("button");
    expect(normalizeTag("Div")).toBe("div");
  });

  it("handles empty string", () => {
    expect(normalizeTag("")).toBe("");
  });
});

describe("normalizeRole", () => {
  it("lowercases role names", () => {
    expect(normalizeRole("Button")).toBe("button");
    expect(normalizeRole("NAVIGATION")).toBe("navigation");
  });

  it("handles empty string", () => {
    expect(normalizeRole("")).toBe("");
  });
});

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("add to cart")).toEqual(["add", "to", "cart"]);
  });

  it("splits on punctuation", () => {
    expect(tokenize("item-count: 5")).toEqual(["item", "count", "5"]);
  });

  it("handles camelCase boundaries", () => {
    expect(tokenize("addToCart")).toEqual(["add", "to", "cart"]);
  });

  it("lowercases all tokens", () => {
    expect(tokenize("Add To CART")).toEqual(["add", "to", "cart"]);
  });

  it("filters empty tokens", () => {
    expect(tokenize("  --hello--  ")).toEqual(["hello"]);
  });

  it("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles special characters", () => {
    expect(tokenize("$19.99")).toEqual(["19", "99"]);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical arrays", () => {
    expect(jaccardSimilarity(["a", "b"], ["a", "b"])).toBe(1);
  });

  it("returns 0 for disjoint arrays", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 1 for two empty arrays", () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it("returns 0 when one array is empty", () => {
    expect(jaccardSimilarity(["a"], [])).toBe(0);
  });

  it("computes partial overlap correctly", () => {
    // intersection=1 (a), union=3 (a,b,c)
    expect(jaccardSimilarity(["a", "b"], ["a", "c"])).toBeCloseTo(1 / 3);
  });
});

describe("nameSimilarity", () => {
  it("returns 1.0 for exact match", () => {
    expect(nameSimilarity("Add to cart", "Add to cart")).toBe(1.0);
  });

  it("returns 0.8 for normalized match (case/whitespace)", () => {
    expect(nameSimilarity("Add to cart", "add  to  cart")).toBe(0.8);
  });

  it("returns 0.5 for fuzzy match (token overlap >= 0.5)", () => {
    // tokens: [add, to, cart] vs [add, item, to, cart]
    // intersection=3, union=4, jaccard=0.75 >= 0.5
    expect(nameSimilarity("Add to cart", "Add item to cart")).toBe(0.5);
  });

  it("returns 0 for no match", () => {
    expect(nameSimilarity("Submit", "Cancel")).toBe(0);
  });

  it("returns 0.8 for unicode normalization difference", () => {
    const a = "caf\u0065\u0301";
    const b = "caf\u00e9";
    expect(nameSimilarity(a, b)).toBe(0.8);
  });
});
