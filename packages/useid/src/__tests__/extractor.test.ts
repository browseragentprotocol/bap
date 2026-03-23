import { describe, it, expect } from "vitest";
import { extractElements } from "../extractor.js";
import type { DOMSnapshotResult, AccessibilitySnapshotResult } from "@browseragentprotocol/dbar";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAXSnapshot(tree: unknown): AccessibilitySnapshotResult {
  return { tree, hash: "test", serialized: "{}" };
}

function makeDOMSnapshot(snapshot: unknown): DOMSnapshotResult {
  return { snapshot, hash: "test", serialized: "{}" };
}

function makeMinimalDOMSnapshot(): DOMSnapshotResult {
  return makeDOMSnapshot({
    documents: [
      {
        nodes: {
          parentIndex: [-1, 0, 1],
          nodeType: [1, 1, 1],
          nodeName: [0, 1, 2],
          nodeValue: [3, 3, 3],
          backendNodeId: [1, 2, 3],
        },
        layout: {
          nodeIndex: [0, 1, 2],
          bounds: [
            [0, 0, 1024, 768],
            [10, 10, 200, 50],
            [10, 70, 100, 40],
          ],
        },
      },
    ],
    strings: ["html", "div", "button", ""],
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("extractElements", () => {
  it("extracts interactive elements from a11y tree", () => {
    const axTree = {
      role: "WebArea",
      name: "Test Page",
      children: [
        {
          role: "navigation",
          name: "Main Nav",
          children: [
            { role: "link", name: "Home" },
            { role: "link", name: "About" },
          ],
        },
        {
          role: "main",
          name: "",
          children: [{ role: "button", name: "Submit" }],
        },
      ],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));

    // Should include links and button, skip generic roles without names
    const roles = elements.map((e) => e.role);
    expect(roles).toContain("link");
    expect(roles).toContain("button");
  });

  it("sets correct ancestor roles", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [
        {
          role: "navigation",
          name: "Nav",
          children: [{ role: "link", name: "Home" }],
        },
      ],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    const link = elements.find((e) => e.role === "link");
    expect(link).toBeDefined();
    expect(link!.ancestorRoles).toContain("navigation");
  });

  it("sets sibling tokens from adjacent elements", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [
        { role: "button", name: "Save" },
        { role: "button", name: "Cancel" },
        { role: "button", name: "Delete" },
      ],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    const save = elements.find((e) => e.accessibleName === "save");
    expect(save).toBeDefined();
    expect(save!.siblingTokens).toContain("cancel");
    expect(save!.siblingTokens).toContain("delete");
  });

  it("detects semantic region from landmark ancestry", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [
        {
          role: "navigation",
          name: "Nav",
          children: [{ role: "link", name: "Home" }],
        },
        {
          role: "main",
          name: "",
          children: [{ role: "button", name: "Submit" }],
        },
      ],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    const link = elements.find((e) => e.accessibleName === "home");
    const button = elements.find((e) => e.accessibleName === "submit");
    expect(link!.region).toBe("nav");
    expect(button!.region).toBe("main");
  });

  it("returns empty array for null a11y tree", () => {
    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(null));
    expect(elements).toEqual([]);
  });

  it("returns empty array for empty a11y tree", () => {
    const axTree = { role: "WebArea", name: "Empty" };
    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    // WebArea is generic — skipped
    expect(elements).toEqual([]);
  });

  it("extracts bbox from DOM snapshot layout", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [{ role: "button", name: "Click Me" }],
    };

    const elements = extractElements(makeMinimalDOMSnapshot(), makeAXSnapshot(axTree));
    const button = elements.find((e) => e.role === "button");
    expect(button).toBeDefined();
    // Should have some bbox (may be from DOM match or default)
    expect(button!.bbox).toBeDefined();
  });

  it("filters out generic roles without names", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [
        { role: "generic", name: "" },
        { role: "group", name: "" },
        { role: "button", name: "OK" },
      ],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    expect(elements).toHaveLength(1);
    expect(elements[0]!.role).toBe("button");
  });

  it("keeps generic roles that have names", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [{ role: "img", name: "Logo" }],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    expect(elements).toHaveLength(1);
    expect(elements[0]!.accessibleName).toBe("logo");
  });

  it("builds selector hints", () => {
    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [
        { role: "button", name: "Submit" },
        { role: "link", name: "" },
      ],
    };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(axTree));
    const button = elements.find((e) => e.role === "button");
    expect(button!.selectorHint).toBe('role=button[name="submit"]');

    const link = elements.find((e) => e.role === "link");
    if (link) {
      expect(link.selectorHint).toMatch(/role=link\[/);
    }
  });

  it("respects maxAncestorLevels option", () => {
    // Build a deep tree
    let tree: any = { role: "button", name: "Deep" };
    for (let i = 0; i < 15; i++) {
      tree = { role: "group", name: `Level ${i}`, children: [tree] };
    }
    tree = { role: "WebArea", name: "Page", children: [tree] };

    const elements = extractElements(makeDOMSnapshot(null), makeAXSnapshot(tree), {
      maxAncestorLevels: 3,
    });
    const button = elements.find((e) => e.role === "button");
    expect(button).toBeDefined();
    expect(button!.ancestorRoles.length).toBeLessThanOrEqual(3);
  });

  it("handles DOM snapshot with label association", () => {
    const domSnapshot = makeDOMSnapshot({
      documents: [
        {
          nodes: {
            parentIndex: [-1, 0, 1, 1],
            nodeType: [1, 1, 3, 1],
            nodeName: [0, 1, 2, 3],
            nodeValue: [2, 2, 4, 2],
            backendNodeId: [1, 2, 3, 4],
          },
          layout: {
            nodeIndex: [0, 1, 3],
            bounds: [
              [0, 0, 1024, 768],
              [10, 10, 200, 30],
              [10, 40, 200, 30],
            ],
          },
        },
      ],
      strings: ["div", "label", "", "input", "Email Address"],
    });

    const axTree = {
      role: "WebArea",
      name: "Page",
      children: [{ role: "textbox", name: "Email Address" }],
    };

    const elements = extractElements(domSnapshot, makeAXSnapshot(axTree));
    const textbox = elements.find((e) => e.role === "textbox");
    expect(textbox).toBeDefined();
  });
});
