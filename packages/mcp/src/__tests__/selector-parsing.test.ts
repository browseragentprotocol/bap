import { describe, it, expect } from "vitest";
import { parseSelector } from "../index.js";

describe("parseSelector()", () => {
  describe("role selector", () => {
    it("parses role:button:Submit", () => {
      const result = parseSelector("role:button:Submit");
      expect(result).toEqual({
        type: "role",
        role: "button",
        name: "Submit",
      });
    });

    it("parses role:link:Click here", () => {
      const result = parseSelector("role:link:Click here");
      expect(result).toEqual({
        type: "role",
        role: "link",
        name: "Click here",
      });
    });

    it("parses role:textbox without name", () => {
      const result = parseSelector("role:textbox");
      expect(result).toEqual({
        type: "role",
        role: "textbox",
        name: undefined,
      });
    });

    it("handles name with colons", () => {
      const result = parseSelector("role:button:Time: 10:30 AM");
      expect(result).toEqual({
        type: "role",
        role: "button",
        name: "Time: 10:30 AM",
      });
    });
  });

  describe("text selector", () => {
    it("parses text:Click here", () => {
      const result = parseSelector("text:Click here");
      expect(result).toEqual({
        type: "text",
        value: "Click here",
      });
    });

    it("parses text with special characters", () => {
      const result = parseSelector("text:Submit & Continue");
      expect(result).toEqual({
        type: "text",
        value: "Submit & Continue",
      });
    });
  });

  describe("label selector", () => {
    it("parses label:Email", () => {
      const result = parseSelector("label:Email");
      expect(result).toEqual({
        type: "label",
        value: "Email",
      });
    });

    it("parses label:Email Address", () => {
      const result = parseSelector("label:Email Address");
      expect(result).toEqual({
        type: "label",
        value: "Email Address",
      });
    });
  });

  describe("css selector", () => {
    it("parses css:.btn-primary", () => {
      const result = parseSelector("css:.btn-primary");
      expect(result).toEqual({
        type: "css",
        value: ".btn-primary",
      });
    });

    it("parses css:#submit-btn", () => {
      const result = parseSelector("css:#submit-btn");
      expect(result).toEqual({
        type: "css",
        value: "#submit-btn",
      });
    });

    it("parses complex CSS selector", () => {
      const result = parseSelector("css:form > button[type='submit']");
      expect(result).toEqual({
        type: "css",
        value: "form > button[type='submit']",
      });
    });
  });

  describe("xpath selector", () => {
    it("parses xpath://button[@id='submit']", () => {
      const result = parseSelector("xpath://button[@id='submit']");
      expect(result).toEqual({
        type: "xpath",
        value: "//button[@id='submit']",
      });
    });

    it("parses complex XPath", () => {
      const result = parseSelector("xpath://div[@class='form']//input");
      expect(result).toEqual({
        type: "xpath",
        value: "//div[@class='form']//input",
      });
    });
  });

  describe("placeholder selector", () => {
    it("parses placeholder:Enter email", () => {
      const result = parseSelector("placeholder:Enter email");
      expect(result).toEqual({
        type: "placeholder",
        value: "Enter email",
      });
    });

    it("parses placeholder:Search...", () => {
      const result = parseSelector("placeholder:Search...");
      expect(result).toEqual({
        type: "placeholder",
        value: "Search...",
      });
    });
  });

  describe("testId selector", () => {
    it("parses testId:submit-button", () => {
      const result = parseSelector("testId:submit-button");
      expect(result).toEqual({
        type: "testId",
        value: "submit-button",
      });
    });

    it("parses testId:login-form", () => {
      const result = parseSelector("testId:login-form");
      expect(result).toEqual({
        type: "testId",
        value: "login-form",
      });
    });
  });

  describe("ref selector", () => {
    it("parses ref:@submitBtn", () => {
      const result = parseSelector("ref:@submitBtn");
      expect(result).toEqual({
        type: "ref",
        ref: "@submitBtn",
      });
    });

    it("parses @submitBtn directly (shorthand)", () => {
      const result = parseSelector("@submitBtn");
      expect(result).toEqual({
        type: "ref",
        ref: "@submitBtn",
      });
    });

    it("parses @e123456 (hash-based ref)", () => {
      const result = parseSelector("@e123456");
      expect(result).toEqual({
        type: "ref",
        ref: "@e123456",
      });
    });
  });

  describe("coordinates selector", () => {
    it("parses coords:100,200", () => {
      const result = parseSelector("coords:100,200");
      expect(result).toEqual({
        type: "coordinates",
        x: 100,
        y: 200,
      });
    });

    it("parses coords:0,0", () => {
      const result = parseSelector("coords:0,0");
      expect(result).toEqual({
        type: "coordinates",
        x: 0,
        y: 0,
      });
    });

    it("parses coords:1920,1080", () => {
      const result = parseSelector("coords:1920,1080");
      expect(result).toEqual({
        type: "coordinates",
        x: 1920,
        y: 1080,
      });
    });

    it("falls back to text for invalid coords", () => {
      const result = parseSelector("coords:abc,def");
      expect(result).toEqual({
        type: "text",
        value: "coords:abc,def",
      });
    });

    it("falls back to text for incomplete coords", () => {
      const result = parseSelector("coords:100");
      expect(result).toEqual({
        type: "text",
        value: "coords:100",
      });
    });
  });

  describe("CSS shorthand", () => {
    it("parses #submit-btn as CSS", () => {
      const result = parseSelector("#submit-btn");
      expect(result).toEqual({
        type: "css",
        value: "#submit-btn",
      });
    });

    it("parses .btn-primary as CSS", () => {
      const result = parseSelector(".btn-primary");
      expect(result).toEqual({
        type: "css",
        value: ".btn-primary",
      });
    });

    it("parses #id.class as CSS", () => {
      const result = parseSelector("#id.class");
      expect(result).toEqual({
        type: "css",
        value: "#id.class",
      });
    });
  });

  describe("default (text) selector", () => {
    it("parses plain string as text", () => {
      const result = parseSelector("Click here to continue");
      expect(result).toEqual({
        type: "text",
        value: "Click here to continue",
      });
    });

    it("parses unrecognized prefix as text", () => {
      const result = parseSelector("unknown:something");
      expect(result).toEqual({
        type: "text",
        value: "unknown:something",
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty role name", () => {
      const result = parseSelector("role:button:");
      expect(result).toEqual({
        type: "role",
        role: "button",
        name: undefined,
      });
    });

    it("handles selector with leading/trailing spaces in value", () => {
      const result = parseSelector("text:  spaced text  ");
      expect(result).toEqual({
        type: "text",
        value: "  spaced text  ",
      });
    });
  });
});
