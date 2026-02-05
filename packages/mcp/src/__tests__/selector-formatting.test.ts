import { describe, it, expect } from "vitest";
import { formatSelectorForDisplay, parseSelector } from "../index.js";
import type { BAPSelector } from "@browseragentprotocol/client";

describe("formatSelectorForDisplay()", () => {
  describe("role selector", () => {
    it("formats role selector with name", () => {
      const selector: BAPSelector = {
        type: "role",
        role: "button",
        name: "Submit",
      };
      expect(formatSelectorForDisplay(selector)).toBe("role:button:Submit");
    });

    it("formats role selector without name", () => {
      const selector: BAPSelector = {
        type: "role",
        role: "textbox",
      };
      expect(formatSelectorForDisplay(selector)).toBe("role:textbox");
    });

    it("formats role selector with undefined name", () => {
      const selector: BAPSelector = {
        type: "role",
        role: "link",
        name: undefined,
      };
      expect(formatSelectorForDisplay(selector)).toBe("role:link");
    });
  });

  describe("text selector", () => {
    it("formats text selector", () => {
      const selector: BAPSelector = {
        type: "text",
        value: "Click here",
      };
      expect(formatSelectorForDisplay(selector)).toBe("text:Click here");
    });

    it("formats text selector with special characters", () => {
      const selector: BAPSelector = {
        type: "text",
        value: "Submit & Continue",
      };
      expect(formatSelectorForDisplay(selector)).toBe("text:Submit & Continue");
    });
  });

  describe("label selector", () => {
    it("formats label selector", () => {
      const selector: BAPSelector = {
        type: "label",
        value: "Email Address",
      };
      expect(formatSelectorForDisplay(selector)).toBe("label:Email Address");
    });
  });

  describe("testId selector", () => {
    it("formats testId selector", () => {
      const selector: BAPSelector = {
        type: "testId",
        value: "submit-button",
      };
      expect(formatSelectorForDisplay(selector)).toBe("testId:submit-button");
    });
  });

  describe("css selector", () => {
    it("formats css ID selector as shorthand", () => {
      const selector: BAPSelector = {
        type: "css",
        value: "#submit-btn",
      };
      expect(formatSelectorForDisplay(selector)).toBe("#submit-btn");
    });

    it("formats css class selector as shorthand", () => {
      const selector: BAPSelector = {
        type: "css",
        value: ".btn-primary",
      };
      expect(formatSelectorForDisplay(selector)).toBe(".btn-primary");
    });

    it("formats complex css selector with prefix", () => {
      const selector: BAPSelector = {
        type: "css",
        value: "form > button[type='submit']",
      };
      expect(formatSelectorForDisplay(selector)).toBe("css:form > button[type='submit']");
    });

    it("formats css attribute selector with prefix", () => {
      const selector: BAPSelector = {
        type: "css",
        value: "[data-testid='login']",
      };
      expect(formatSelectorForDisplay(selector)).toBe("css:[data-testid='login']");
    });
  });

  describe("xpath selector", () => {
    it("formats xpath selector", () => {
      const selector: BAPSelector = {
        type: "xpath",
        value: "//button[@id='submit']",
      };
      expect(formatSelectorForDisplay(selector)).toBe("xpath://button[@id='submit']");
    });
  });

  describe("placeholder selector", () => {
    it("formats placeholder selector", () => {
      const selector: BAPSelector = {
        type: "placeholder",
        value: "Enter email",
      };
      expect(formatSelectorForDisplay(selector)).toBe("placeholder:Enter email");
    });
  });

  describe("ref selector", () => {
    it("formats ref selector (returns ref directly)", () => {
      const selector: BAPSelector = {
        type: "ref",
        ref: "@submitBtn",
      };
      expect(formatSelectorForDisplay(selector)).toBe("@submitBtn");
    });

    it("formats hash-based ref", () => {
      const selector: BAPSelector = {
        type: "ref",
        ref: "@e123456",
      };
      expect(formatSelectorForDisplay(selector)).toBe("@e123456");
    });
  });

  describe("coordinates selector", () => {
    it("formats coordinates selector", () => {
      const selector: BAPSelector = {
        type: "coordinates",
        x: 100,
        y: 200,
      };
      expect(formatSelectorForDisplay(selector)).toBe("coords:100,200");
    });

    it("formats coordinates at origin", () => {
      const selector: BAPSelector = {
        type: "coordinates",
        x: 0,
        y: 0,
      };
      expect(formatSelectorForDisplay(selector)).toBe("coords:0,0");
    });
  });

  describe("semantic selector", () => {
    it("formats semantic selector", () => {
      const selector: BAPSelector = {
        type: "semantic",
        description: "the login button",
      };
      expect(formatSelectorForDisplay(selector)).toBe("semantic:the login button");
    });
  });

  describe("unknown selector", () => {
    it("returns JSON for unknown selector types", () => {
      const selector = {
        type: "unknown",
        data: "test",
      } as unknown as BAPSelector;
      const result = formatSelectorForDisplay(selector);
      expect(result).toBe('{"type":"unknown","data":"test"}');
    });
  });

  describe("roundtrip (parse then format)", () => {
    it("role selector roundtrip", () => {
      const original = "role:button:Submit";
      const parsed = parseSelector(original);
      const formatted = formatSelectorForDisplay(parsed);
      expect(formatted).toBe(original);
    });

    it("text selector roundtrip", () => {
      const original = "text:Click here";
      const parsed = parseSelector(original);
      const formatted = formatSelectorForDisplay(parsed);
      expect(formatted).toBe(original);
    });

    it("css ID selector roundtrip (shorthand)", () => {
      const original = "#submit-btn";
      const parsed = parseSelector(original);
      const formatted = formatSelectorForDisplay(parsed);
      expect(formatted).toBe(original);
    });

    it("ref selector roundtrip", () => {
      const original = "@submitBtn";
      const parsed = parseSelector(original);
      const formatted = formatSelectorForDisplay(parsed);
      expect(formatted).toBe(original);
    });

    it("coords selector roundtrip", () => {
      const original = "coords:100,200";
      const parsed = parseSelector(original);
      const formatted = formatSelectorForDisplay(parsed);
      expect(formatted).toBe(original);
    });
  });
});
