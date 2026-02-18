import { describe, it, expect } from "vitest";
import { parseSelector, stripQuotes, formatSelectorForDisplay } from "../src/selectors/parser.js";

describe("stripQuotes", () => {
  it("strips double quotes", () => {
    expect(stripQuotes('"Submit"')).toBe("Submit");
  });
  it("strips single quotes", () => {
    expect(stripQuotes("'Submit'")).toBe("Submit");
  });
  it("leaves unquoted strings", () => {
    expect(stripQuotes("Submit")).toBe("Submit");
  });
  it("leaves mismatched quotes", () => {
    expect(stripQuotes("\"Submit'")).toBe("\"Submit'");
  });
  it("handles empty string", () => {
    expect(stripQuotes("")).toBe("");
  });
  it("handles single char", () => {
    expect(stripQuotes("a")).toBe("a");
  });
});

describe("parseSelector", () => {
  // Playwright-CLI compat: e<N> positional refs
  describe("positional refs (e<N>)", () => {
    it("parses e15", () => {
      expect(parseSelector("e15")).toEqual({ type: "ref", ref: "e15" });
    });
    it("parses e0", () => {
      expect(parseSelector("e0")).toEqual({ type: "ref", ref: "e0" });
    });
    it("parses e123", () => {
      expect(parseSelector("e123")).toEqual({ type: "ref", ref: "e123" });
    });
    it("does not match 'email' as ref", () => {
      expect(parseSelector("email")).not.toEqual(expect.objectContaining({ type: "ref" }));
    });
  });

  // BAP stable refs
  describe("stable refs (@)", () => {
    it("parses @e1", () => {
      expect(parseSelector("@e1")).toEqual({ type: "ref", ref: "@e1" });
    });
    it("parses @submitBtn", () => {
      expect(parseSelector("@submitBtn")).toEqual({ type: "ref", ref: "@submitBtn" });
    });
    it("parses ref:@submitBtn", () => {
      expect(parseSelector("ref:@submitBtn")).toEqual({ type: "ref", ref: "@submitBtn" });
    });
  });

  // Role selectors
  describe("role selectors", () => {
    it('parses role:button:"Submit"', () => {
      expect(parseSelector('role:button:"Submit"')).toEqual({
        type: "role",
        role: "button",
        name: "Submit",
      });
    });
    it("parses role:button:Submit (without quotes)", () => {
      expect(parseSelector("role:button:Submit")).toEqual({
        type: "role",
        role: "button",
        name: "Submit",
      });
    });
    it('parses role:textbox:"Email"', () => {
      expect(parseSelector('role:textbox:"Email"')).toEqual({
        type: "role",
        role: "textbox",
        name: "Email",
      });
    });
    it("parses role:button (no name)", () => {
      expect(parseSelector("role:button")).toEqual({
        type: "role",
        role: "button",
        name: undefined,
      });
    });
    it("parses role:link:Home", () => {
      expect(parseSelector("role:link:Home")).toEqual({
        type: "role",
        role: "link",
        name: "Home",
      });
    });
    it('parses role with name containing colon: role:button:"Sign in: Now"', () => {
      expect(parseSelector('role:button:"Sign in: Now"')).toEqual({
        type: "role",
        role: "button",
        name: "Sign in: Now",
      });
    });
  });

  // Text selectors
  describe("text selectors", () => {
    it('parses text:"Sign in"', () => {
      expect(parseSelector('text:"Sign in"')).toEqual({
        type: "text",
        value: "Sign in",
      });
    });
    it("parses text:Sign in (without quotes)", () => {
      expect(parseSelector("text:Sign in")).toEqual({
        type: "text",
        value: "Sign in",
      });
    });
  });

  // Label selectors
  describe("label selectors", () => {
    it('parses label:"Email"', () => {
      expect(parseSelector('label:"Email"')).toEqual({
        type: "label",
        value: "Email",
      });
    });
    it("parses label:Email", () => {
      expect(parseSelector("label:Email")).toEqual({
        type: "label",
        value: "Email",
      });
    });
  });

  // Placeholder selectors
  describe("placeholder selectors", () => {
    it('parses placeholder:"Search..."', () => {
      expect(parseSelector('placeholder:"Search..."')).toEqual({
        type: "placeholder",
        value: "Search...",
      });
    });
  });

  // TestId selectors
  describe("testid selectors", () => {
    it("parses testid:submit-btn", () => {
      expect(parseSelector("testid:submit-btn")).toEqual({
        type: "testId",
        value: "submit-btn",
      });
    });
  });

  // CSS selectors
  describe("css selectors", () => {
    it("parses css:.btn-primary", () => {
      expect(parseSelector("css:.btn-primary")).toEqual({
        type: "css",
        value: ".btn-primary",
      });
    });
    it("parses #submit-btn shorthand", () => {
      expect(parseSelector("#submit-btn")).toEqual({
        type: "css",
        value: "#submit-btn",
      });
    });
    it("parses .class shorthand", () => {
      expect(parseSelector(".btn")).toEqual({
        type: "css",
        value: ".btn",
      });
    });
  });

  // XPath selectors
  describe("xpath selectors", () => {
    it("parses xpath://button[@id='submit']", () => {
      expect(parseSelector("xpath://button[@id='submit']")).toEqual({
        type: "xpath",
        value: "//button[@id='submit']",
      });
    });
  });

  // Coordinates selectors
  describe("coordinate selectors", () => {
    it("parses coords:100,200", () => {
      expect(parseSelector("coords:100,200")).toEqual({
        type: "coordinates",
        x: 100,
        y: 200,
      });
    });
  });

  // Default (text fallback)
  describe("default fallback", () => {
    it("treats plain strings as text selectors", () => {
      expect(parseSelector("Sign in")).toEqual({
        type: "text",
        value: "Sign in",
      });
    });
  });
});

describe("formatSelectorForDisplay", () => {
  it("formats role selector", () => {
    expect(
      formatSelectorForDisplay({ type: "role", role: "button", name: "Submit" })
    ).toBe('role:button:"Submit"');
  });
  it("formats role selector without name", () => {
    expect(
      formatSelectorForDisplay({ type: "role", role: "button" })
    ).toBe("role:button");
  });
  it("formats text selector", () => {
    expect(
      formatSelectorForDisplay({ type: "text", value: "Sign in" })
    ).toBe('text:"Sign in"');
  });
  it("formats ref selector", () => {
    expect(
      formatSelectorForDisplay({ type: "ref", ref: "@e1" })
    ).toBe("@e1");
  });
  it("formats ref selector (e15)", () => {
    expect(
      formatSelectorForDisplay({ type: "ref", ref: "e15" })
    ).toBe("e15");
  });
  it("formats css shorthand", () => {
    expect(
      formatSelectorForDisplay({ type: "css", value: "#submit" })
    ).toBe("#submit");
  });
  it("formats coordinates", () => {
    expect(
      formatSelectorForDisplay({ type: "coordinates", x: 100, y: 200 })
    ).toBe("coords:100,200");
  });
});
