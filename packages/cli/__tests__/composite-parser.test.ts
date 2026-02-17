import { describe, it, expect } from "vitest";
import {
  parseCompositeStep,
  parseCompositeSteps,
  toExecutionSteps,
} from "../src/selectors/composite-parser.js";

describe("parseCompositeStep", () => {
  // Parameterless actions
  describe("parameterless actions", () => {
    it("parses snapshot", () => {
      expect(parseCompositeStep("snapshot")).toEqual({
        action: "observe/ariaSnapshot",
      });
    });
    it("parses screenshot", () => {
      expect(parseCompositeStep("screenshot")).toEqual({
        action: "observe/screenshot",
      });
    });
    it("parses back", () => {
      expect(parseCompositeStep("back")).toEqual({
        action: "page/goBack",
      });
    });
    it("parses forward", () => {
      expect(parseCompositeStep("forward")).toEqual({
        action: "page/goForward",
      });
    });
    it("parses reload", () => {
      expect(parseCompositeStep("reload")).toEqual({
        action: "page/reload",
      });
    });
  });

  // Click actions
  describe("click actions", () => {
    it("parses click:e15", () => {
      const step = parseCompositeStep("click:e15");
      expect(step.action).toBe("action/click");
      expect(step.selector).toEqual({ type: "ref", ref: "e15" });
      expect(step.value).toBeUndefined();
    });
    it('parses click:role:button:"Submit"', () => {
      const step = parseCompositeStep('click:role:button:"Submit"');
      expect(step.action).toBe("action/click");
      expect(step.selector).toEqual({
        type: "role",
        role: "button",
        name: "Submit",
      });
    });
    it('parses click:text:"Sign in"', () => {
      const step = parseCompositeStep('click:text:"Sign in"');
      expect(step.action).toBe("action/click");
      expect(step.selector).toEqual({
        type: "text",
        value: "Sign in",
      });
    });
  });

  // Fill actions with values
  describe("fill actions", () => {
    it('parses fill:e5="user@example.com"', () => {
      const step = parseCompositeStep('fill:e5="user@example.com"');
      expect(step.action).toBe("action/fill");
      expect(step.selector).toEqual({ type: "ref", ref: "e5" });
      expect(step.value).toBe("user@example.com");
    });
    it("parses fill:e5=password (unquoted value)", () => {
      const step = parseCompositeStep("fill:e5=password");
      expect(step.action).toBe("action/fill");
      expect(step.selector).toEqual({ type: "ref", ref: "e5" });
      expect(step.value).toBe("password");
    });
    it('parses fill:role:textbox:"Email"="user@example.com"', () => {
      const step = parseCompositeStep('fill:role:textbox:"Email"="user@example.com"');
      expect(step.action).toBe("action/fill");
      expect(step.selector).toEqual({
        type: "role",
        role: "textbox",
        name: "Email",
      });
      expect(step.value).toBe("user@example.com");
    });
    it('parses fill:label:"Email"="user@example.com"', () => {
      const step = parseCompositeStep('fill:label:"Email"="user@example.com"');
      expect(step.action).toBe("action/fill");
      expect(step.selector).toEqual({
        type: "label",
        value: "Email",
      });
      expect(step.value).toBe("user@example.com");
    });
  });

  // Goto actions
  describe("goto actions", () => {
    it("parses goto:https://example.com", () => {
      const step = parseCompositeStep("goto:https://example.com");
      expect(step.action).toBe("page/navigate");
      expect(step.url).toBe("https://example.com");
    });
    it("parses goto:https://example.com/path?query=1", () => {
      const step = parseCompositeStep("goto:https://example.com/path?query=1");
      expect(step.action).toBe("page/navigate");
      expect(step.url).toBe("https://example.com/path?query=1");
    });
  });

  // Press actions
  describe("press actions", () => {
    it("parses press:Enter", () => {
      const step = parseCompositeStep("press:Enter");
      expect(step.action).toBe("action/press");
      expect(step.key).toBe("Enter");
    });
    it("parses press:Tab", () => {
      const step = parseCompositeStep("press:Tab");
      expect(step.action).toBe("action/press");
      expect(step.key).toBe("Tab");
    });
  });

  // Error cases
  describe("error cases", () => {
    it("throws on invalid step without colon", () => {
      expect(() => parseCompositeStep("invalid")).toThrow();
    });
  });
});

describe("parseCompositeSteps", () => {
  it("parses multiple steps", () => {
    const steps = parseCompositeSteps([
      'fill:e5="user@example.com"',
      'fill:e8="password"',
      "click:e12",
    ]);
    expect(steps).toHaveLength(3);
    expect(steps[0]!.action).toBe("action/fill");
    expect(steps[1]!.action).toBe("action/fill");
    expect(steps[2]!.action).toBe("action/click");
  });
});

describe("toExecutionSteps", () => {
  it("converts parsed steps to execution steps", () => {
    const parsed = parseCompositeSteps([
      'fill:e5="user@example.com"',
      "click:e12",
      "press:Enter",
    ]);
    const steps = toExecutionSteps(parsed);
    expect(steps).toHaveLength(3);

    expect(steps[0]!.action).toBe("action/fill");
    expect(steps[0]!.params!.selector).toEqual({ type: "ref", ref: "e5" });
    expect(steps[0]!.params!.value).toBe("user@example.com");

    expect(steps[1]!.action).toBe("action/click");
    expect(steps[1]!.params!.selector).toEqual({ type: "ref", ref: "e12" });

    expect(steps[2]!.action).toBe("action/press");
    expect(steps[2]!.params!.key).toBe("Enter");
  });

  it("handles goto with URL", () => {
    const parsed = parseCompositeSteps(["goto:https://example.com"]);
    const steps = toExecutionSteps(parsed);
    expect(steps[0]!.action).toBe("page/navigate");
    expect(steps[0]!.params!.url).toBe("https://example.com");
  });
});
