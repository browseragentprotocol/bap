# Feature Plan: Element Reference System & Screenshot Annotation

**Date**: February 2026
**Status**: ✅ IMPLEMENTED
**Version**: Same as current (0.1.0-alpha.1)

> **Implementation Note**: Both features have been implemented. See:
> - Element identity utilities in `packages/protocol/src/shared/element-identity.ts`
> - Annotation types in `packages/protocol/src/types/agent.ts`
> - Server implementation in `packages/server-playwright/src/server.ts` (handleAgentObserve)

---

## Overview

This plan covers two interrelated features for AI agent optimization:

1. **Element Reference System** - Stable element refs (`@e1`, `@e2`) that persist across observations
2. **Screenshot Annotation (Set-of-Marks)** - Visual overlays on screenshots marking interactive elements

Both features work together to enable AI agents to:
- Reference elements consistently across multiple `agent/observe` calls
- Visually identify elements in screenshots using numbered markers
- Map between visual markers and actionable selectors

---

## Feature 1: Element Reference System

### Current State

Currently in `agent/observe`:
- Element refs (`@e1`, `@e2`) are generated fresh on each call
- Index is based on DOM traversal order
- Refs are not stable across observations (element at `@e1` may shift to `@e3` after DOM changes)
- No mechanism to track element identity

### Problem

AI agents cannot reliably reference elements across multiple observations:
```typescript
// First observation
const obs1 = await client.observe({ includeInteractiveElements: true });
// obs1.interactiveElements[0].ref === "@e1" (Submit button)

// Page updates (e.g., new element inserted)
const obs2 = await client.observe({ includeInteractiveElements: true });
// obs2.interactiveElements[0].ref === "@e1" (Now a different element!)
// Submit button may now be @e2
```

### Proposed Solution

#### 1.1 Stable Reference Generation

Generate refs based on **element identity hash** rather than index:

```typescript
// New type for stable element identity
interface ElementIdentity {
  // Primary identifiers (high stability)
  testId?: string;          // data-testid attribute
  ariaLabel?: string;       // aria-label attribute
  id?: string;              // HTML id attribute

  // Secondary identifiers (medium stability)
  role: string;             // ARIA role
  name?: string;            // Accessible name
  tagName: string;          // HTML tag

  // Contextual identifiers (for disambiguation)
  parentRole?: string;      // Parent's ARIA role
  siblingIndex?: number;    // Position among same-role siblings
}

// Generate short stable ref from identity
function generateStableRef(identity: ElementIdentity): string {
  // Priority: testId > id > aria-label > role+name combination
  if (identity.testId) {
    return `@${identity.testId.slice(0, 12)}`;
  }
  if (identity.id) {
    return `@${identity.id.slice(0, 12)}`;
  }
  // Fall back to hash of combined properties
  const hash = hashIdentity(identity);
  return `@e${hash.slice(0, 6)}`;  // e.g., "@e7f3a2"
}
```

#### 1.2 Element Registry per Page

Add element tracking to server's ClientState:

```typescript
interface PageElementRegistry {
  // Map from stable ref to element info
  elements: Map<string, {
    ref: string;
    selector: BAPSelector;
    identity: ElementIdentity;
    lastSeen: number;       // Timestamp
    bounds?: ElementBounds; // Last known position
  }>;

  // Last observation timestamp for staleness detection
  lastObservation: number;
}

interface ClientState {
  // ... existing fields
  elementRegistries: Map<string, PageElementRegistry>; // pageId -> registry
}
```

#### 1.3 Reference Lifecycle

1. **Creation**: On first observation, elements get stable refs
2. **Preservation**: Same element keeps same ref across observations
3. **Invalidation**: Refs marked stale if element not found in N consecutive observations
4. **Garbage Collection**: Old stale refs cleaned up periodically

#### 1.4 Protocol Changes

**New optional parameters for `agent/observe`**:

```typescript
AgentObserveParams {
  // ... existing params

  // Element reference options
  stableRefs?: boolean;        // Use stable refs (default: true when available)
  refreshRefs?: boolean;       // Force refresh all refs
  includeRefHistory?: boolean; // Include previous ref if element moved
}
```

**Enhanced response**:

```typescript
InteractiveElement {
  // ... existing fields

  ref: string;                 // Stable ref (e.g., "@submitBtn" or "@e7f3a2")
  previousRef?: string;        // If element had different ref before
  stability: 'stable' | 'new' | 'moved'; // Ref stability indicator
}
```

#### 1.5 Implementation Steps

1. **Add identity hashing utility** (`packages/protocol/src/shared/`)
2. **Add PageElementRegistry type** (`packages/protocol/src/types/agent.ts`)
3. **Update ClientState** (`packages/server-playwright/src/server.ts`)
4. **Modify getInteractiveElements()** to use registry
5. **Add ref cleanup on page navigation**
6. **Update client types and methods**
7. **Update MCP tool outputs**

---

## Feature 2: Screenshot Annotation (Set-of-Marks)

### Current State

- Screenshots are returned as raw base64 PNG/JPEG
- Element bounds available separately via `includeBounds: true`
- No visual correlation between screenshot and elements
- AI must mentally map bounds to screenshot regions

### Problem

AI agents (especially vision models) benefit from annotated screenshots:
- Visual markers make element identification faster
- Numbered overlays provide clear reference points
- Reduces errors in element selection

### Proposed Solution

#### 2.1 Annotation Style

"Set-of-Marks" (SoM) style annotation:

```
┌──────────────────────────────────┐
│  [1] Search box                  │
│  ┌────────────────────────────┐  │
│  │ Enter search term...       │  │
│  └────────────────────────────┘  │
│                                  │
│  [2] Submit   [3] Clear          │
│                                  │
│  Results:                        │
│  [4] Result 1                    │
│  [5] Result 2                    │
└──────────────────────────────────┘
```

Each marker:
- Numbered badge (e.g., `[1]`, `[2]`)
- Optional bounding box overlay
- Positioned at element's top-left corner
- Non-overlapping placement algorithm

#### 2.2 Annotation Options

```typescript
interface AnnotationOptions {
  // Enable annotation
  enabled: boolean;

  // Visual style
  style?: {
    // Badge appearance
    badgeColor?: string;       // Default: "#FF0000" (red)
    badgeTextColor?: string;   // Default: "#FFFFFF" (white)
    badgeSize?: number;        // Default: 20 (pixels)
    badgeFont?: string;        // Default: "bold 12px sans-serif"

    // Bounding box
    showBoundingBox?: boolean; // Default: true
    boxColor?: string;         // Default: "#FF0000" (red)
    boxWidth?: number;         // Default: 2 (pixels)
    boxStyle?: 'solid' | 'dashed'; // Default: 'solid'

    // Opacity
    opacity?: number;          // Default: 0.8
  };

  // Content options
  useStableRefs?: boolean;     // Use stable refs as labels (e.g., "@submit")
  maxLabels?: number;          // Limit annotations (default: 50)
  labelFormat?: 'number' | 'ref' | 'both'; // Default: 'number'
}
```

#### 2.3 Protocol Changes

**New parameter for `agent/observe`**:

```typescript
AgentObserveParams {
  // ... existing params

  // Screenshot annotation
  annotateScreenshot?: boolean | AnnotationOptions;
}
```

**Enhanced response**:

```typescript
AgentObserveResult {
  // ... existing fields

  screenshot?: {
    data: string;              // Annotated screenshot (if requested)
    format: 'png' | 'jpeg';
    width: number;
    height: number;
    annotated: boolean;        // Whether annotations were applied
  };

  // Mapping from annotation labels to elements
  annotationMap?: {
    label: string;             // e.g., "1" or "@submit"
    ref: string;               // Element ref
    position: { x: number; y: number }; // Badge position on screenshot
  }[];
}
```

#### 2.4 Implementation Approach

**Option A: Browser-side Canvas rendering** (Recommended)

```typescript
// In page.evaluate() context
async function annotateScreenshot(
  page: Page,
  elements: InteractiveElement[],
  options: AnnotationOptions
): Promise<Buffer> {
  // 1. Take screenshot
  const screenshot = await page.screenshot({ type: 'png' });

  // 2. Use page.evaluate to draw on canvas
  const annotated = await page.evaluate(async (args) => {
    const { imageData, elements, options } = args;

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Load screenshot into canvas
    const img = new Image();
    await new Promise(resolve => {
      img.onload = resolve;
      img.src = `data:image/png;base64,${imageData}`;
    });
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Draw annotations
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el.bounds) continue;

      // Draw bounding box
      if (options.style?.showBoundingBox !== false) {
        ctx.strokeStyle = options.style?.boxColor || '#FF0000';
        ctx.lineWidth = options.style?.boxWidth || 2;
        ctx.strokeRect(el.bounds.x, el.bounds.y, el.bounds.width, el.bounds.height);
      }

      // Draw badge
      const label = String(i + 1);
      const badgeSize = options.style?.badgeSize || 20;
      ctx.fillStyle = options.style?.badgeColor || '#FF0000';
      ctx.fillRect(el.bounds.x - 2, el.bounds.y - badgeSize - 2, badgeSize + 4, badgeSize);
      ctx.fillStyle = options.style?.badgeTextColor || '#FFFFFF';
      ctx.font = options.style?.badgeFont || 'bold 12px sans-serif';
      ctx.fillText(label, el.bounds.x + 2, el.bounds.y - 6);
    }

    return canvas.toDataURL('image/png').split(',')[1];
  }, { imageData: screenshot.toString('base64'), elements, options });

  return Buffer.from(annotated, 'base64');
}
```

**Option B: Node.js image library (sharp/canvas)**

Use `sharp` or `node-canvas` for server-side rendering. More dependencies but doesn't require browser context.

**Recommendation**: Option A (browser-side) for:
- No additional dependencies
- Consistent with existing architecture
- Works with any browser/page state

#### 2.5 Implementation Steps

1. **Add AnnotationOptions type** (`packages/protocol/src/types/agent.ts`)
2. **Update AgentObserveParams** with annotation options
3. **Implement annotateScreenshot()** in server
4. **Update handleAgentObserve()** to use annotation
5. **Add annotation map to response**
6. **Update client types**
7. **Update MCP tool to expose annotation option**
8. **Add tests for annotation rendering**

---

## Combined Implementation Plan

### Phase 1: Protocol Types (Day 1)

Files to modify:
- `packages/protocol/src/types/agent.ts`
  - Add `ElementIdentity` type
  - Add `AnnotationOptions` type
  - Update `AgentObserveParams` with new options
  - Update `InteractiveElement` with stability fields
  - Update `AgentObserveResult` with annotation map

- `packages/protocol/src/types/index.ts`
  - Export new types

### Phase 2: Element Reference System (Day 2-3)

Files to modify:
- `packages/protocol/src/shared/element-identity.ts` (new)
  - Identity hashing functions
  - Ref generation utilities

- `packages/server-playwright/src/server.ts`
  - Add `PageElementRegistry` to ClientState
  - Modify `getInteractiveElements()` for stable refs
  - Add registry cleanup on navigation
  - Handle ref invalidation

### Phase 3: Screenshot Annotation (Day 3-4)

Files to modify:
- `packages/server-playwright/src/server.ts`
  - Add `annotateScreenshot()` method
  - Update `handleAgentObserve()` for annotation
  - Generate annotation map

### Phase 4: Client & MCP Updates (Day 4)

Files to modify:
- `packages/client/src/index.ts`
  - Update `observe()` method signature
  - Add helper methods for working with refs

- `packages/mcp/src/index.ts`
  - Update `bap_observe` tool schema
  - Format annotated output for AI

### Phase 5: Documentation & Tests (Day 5)

Files to modify:
- `SPEC.md` - Document new capabilities
- `README.md` - Update feature list
- `packages/*/README.md` - Update package docs
- Add integration tests

---

## API Examples

### Using Stable Element Refs

```typescript
// First observation
const obs1 = await client.observe({
  includeInteractiveElements: true,
  stableRefs: true,
});

// Submit button has ref "@submitBtn" (based on testId or identity)
const submitBtn = obs1.interactiveElements.find(e => e.name === 'Submit');
console.log(submitBtn.ref);  // "@submitBtn"

// Later observation (after page update)
const obs2 = await client.observe({
  includeInteractiveElements: true,
  stableRefs: true,
});

// Same element keeps same ref
const submitBtn2 = obs2.interactiveElements.find(e => e.ref === '@submitBtn');
console.log(submitBtn2.stability);  // "stable"
```

### Using Annotated Screenshots

```typescript
const observation = await client.observe({
  includeScreenshot: true,
  includeInteractiveElements: true,
  includeBounds: true,
  annotateScreenshot: {
    enabled: true,
    style: {
      badgeColor: '#0066FF',
      showBoundingBox: true,
    },
    labelFormat: 'number',
  },
});

// Screenshot has numbered markers
console.log(observation.screenshot.annotated);  // true

// Map numbers to elements
for (const mapping of observation.annotationMap) {
  console.log(`[${mapping.label}] -> ${mapping.ref}`);
}
// Output:
// [1] -> @searchInput
// [2] -> @submitBtn
// [3] -> @clearBtn
```

### MCP Tool Usage

```
User: "Show me the page with element markers"

AI: I'll get an annotated screenshot of the page.

<tool_call>
bap_observe({
  includeScreenshot: true,
  annotateScreenshot: true,
  maxElements: 20
})
</tool_call>

Result shows:
- Annotated screenshot with [1], [2], [3]... markers
- Element list mapping numbers to descriptions:
  [1] searchInput - textbox "Search" - @searchInput
  [2] submitBtn - button "Submit" - @submitBtn
  [3] clearBtn - button "Clear" - @clearBtn

User: "Click element [2]"

AI: I'll click the Submit button.

<tool_call>
bap_click({ selector: "ref:@submitBtn" })
</tool_call>
```

---

## Testing Strategy

### Unit Tests

1. **Identity hashing**: Same element produces same hash
2. **Ref generation**: Stable refs from identity
3. **Annotation rendering**: Canvas drawing accuracy

### Integration Tests

1. **Ref stability**: Refs persist across observations
2. **Ref invalidation**: Removed elements lose refs
3. **Screenshot annotation**: Markers positioned correctly
4. **Full flow**: observe → annotated screenshot → click by ref

### Visual Tests

1. **Annotation appearance**: Screenshot comparison tests
2. **Marker positioning**: Edge cases (overlapping, off-screen)
3. **Different page scales**: deviceScaleFactor handling

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Identity collisions (two elements same hash) | Low | Medium | Use longer hashes, include position data |
| Performance overhead for large pages | Medium | Low | Limit max elements, lazy registry updates |
| Canvas rendering inconsistencies | Low | Medium | Test across browsers, fallback to simple drawing |
| Memory leak from element registries | Medium | Medium | Implement cleanup on navigation/close |
| Breaking existing clients | Low | High | All new features are opt-in |

---

## Success Criteria

1. **Element refs stable across 5+ consecutive observations** (no page changes)
2. **Ref persistence > 90%** when minor DOM changes occur
3. **Annotated screenshots render in < 200ms** for typical pages
4. **No breaking changes** to existing API consumers
5. **MCP tool usable** by AI agents for element identification

---

## Future Enhancements

1. **Ref persistence across sessions** - Store registry in storage state
2. **Element change detection** - Notify when tracked elements change
3. **Annotation customization** - User-defined styles, icons
4. **Hover/focus highlighting** - Dynamic annotations
5. **Video recording with annotations** - For debugging

