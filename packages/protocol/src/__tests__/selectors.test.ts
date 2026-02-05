import { describe, it, expect } from "vitest";
import {
  css,
  xpath,
  role,
  text,
  label,
  placeholder,
  testId,
  semantic,
  coords,
  ref,
  BAPSelectorSchema,
} from "../types/selectors.js";

describe("Selector Factory Functions", () => {
  describe("css()", () => {
    it("creates a CSS selector", () => {
      const selector = css(".my-class");
      expect(selector).toEqual({ type: "css", value: ".my-class" });
    });

    it("handles complex CSS selectors", () => {
      const selector = css("div.container > button[data-id='submit']");
      expect(selector.type).toBe("css");
      expect(selector.value).toBe("div.container > button[data-id='submit']");
    });
  });

  describe("xpath()", () => {
    it("creates an XPath selector", () => {
      const selector = xpath("//button[@type='submit']");
      expect(selector).toEqual({ type: "xpath", value: "//button[@type='submit']" });
    });
  });

  describe("role()", () => {
    it("creates a role selector without name", () => {
      const selector = role("button");
      expect(selector).toEqual({ type: "role", role: "button", name: undefined, exact: undefined });
    });

    it("creates a role selector with name", () => {
      const selector = role("button", "Submit");
      expect(selector).toEqual({ type: "role", role: "button", name: "Submit", exact: undefined });
    });

    it("creates a role selector with exact matching", () => {
      const selector = role("button", "Submit", true);
      expect(selector).toEqual({ type: "role", role: "button", name: "Submit", exact: true });
    });

    it("supports all ARIA roles", () => {
      const roles = ["button", "textbox", "link", "checkbox", "menuitem", "dialog"];
      roles.forEach((r) => {
        const selector = role(r as any);
        expect(selector.role).toBe(r);
      });
    });
  });

  describe("text()", () => {
    it("creates a text selector", () => {
      const selector = text("Click me");
      expect(selector).toEqual({ type: "text", value: "Click me", exact: undefined });
    });

    it("creates a text selector with exact matching", () => {
      const selector = text("Click me", true);
      expect(selector).toEqual({ type: "text", value: "Click me", exact: true });
    });
  });

  describe("label()", () => {
    it("creates a label selector", () => {
      const selector = label("Email");
      expect(selector).toEqual({ type: "label", value: "Email", exact: undefined });
    });

    it("creates a label selector with exact matching", () => {
      const selector = label("Email address", false);
      expect(selector).toEqual({ type: "label", value: "Email address", exact: false });
    });
  });

  describe("placeholder()", () => {
    it("creates a placeholder selector", () => {
      const selector = placeholder("Enter your email");
      expect(selector).toEqual({ type: "placeholder", value: "Enter your email", exact: undefined });
    });
  });

  describe("testId()", () => {
    it("creates a testId selector", () => {
      const selector = testId("submit-button");
      expect(selector).toEqual({ type: "testId", value: "submit-button" });
    });
  });

  describe("semantic()", () => {
    it("creates a semantic selector", () => {
      const selector = semantic("the main submit button at the bottom of the form");
      expect(selector).toEqual({
        type: "semantic",
        description: "the main submit button at the bottom of the form",
      });
    });
  });

  describe("coords()", () => {
    it("creates a coordinates selector", () => {
      const selector = coords(100, 200);
      expect(selector).toEqual({ type: "coordinates", x: 100, y: 200 });
    });

    it("handles zero coordinates", () => {
      const selector = coords(0, 0);
      expect(selector).toEqual({ type: "coordinates", x: 0, y: 0 });
    });

    it("handles negative coordinates", () => {
      const selector = coords(-10, -20);
      expect(selector).toEqual({ type: "coordinates", x: -10, y: -20 });
    });
  });

  describe("ref()", () => {
    it("creates a ref selector", () => {
      const selector = ref("@submitBtn");
      expect(selector).toEqual({ type: "ref", ref: "@submitBtn" });
    });

    it("handles hash-based refs", () => {
      const selector = ref("@e7f3a2");
      expect(selector).toEqual({ type: "ref", ref: "@e7f3a2" });
    });
  });
});

describe("BAPSelectorSchema Validation", () => {
  it("validates CSS selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "css", value: ".btn" });
    expect(result.success).toBe(true);
  });

  it("validates XPath selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "xpath", value: "//button" });
    expect(result.success).toBe(true);
  });

  it("validates role selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "role", role: "button", name: "Submit" });
    expect(result.success).toBe(true);
  });

  it("validates text selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "text", value: "Hello" });
    expect(result.success).toBe(true);
  });

  it("validates label selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "label", value: "Email" });
    expect(result.success).toBe(true);
  });

  it("validates placeholder selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "placeholder", value: "Enter text" });
    expect(result.success).toBe(true);
  });

  it("validates testId selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "testId", value: "my-id" });
    expect(result.success).toBe(true);
  });

  it("validates semantic selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "semantic", description: "the button" });
    expect(result.success).toBe(true);
  });

  it("validates coordinates selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "coordinates", x: 100, y: 200 });
    expect(result.success).toBe(true);
  });

  it("validates ref selector", () => {
    const result = BAPSelectorSchema.safeParse({ type: "ref", ref: "@submitBtn" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid selector type", () => {
    const result = BAPSelectorSchema.safeParse({ type: "invalid", value: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = BAPSelectorSchema.safeParse({ type: "css" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role name", () => {
    const result = BAPSelectorSchema.safeParse({ type: "role", role: "invalid-role" });
    expect(result.success).toBe(false);
  });
});
