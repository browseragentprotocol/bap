/**
 * @fileoverview BAP Agent types for composite actions, observations, and data extraction
 * @module @browseragentprotocol/protocol/types/agent
 *
 * This module defines types for the agent/* methods that enable AI agents to:
 * - Execute multi-step action sequences in a single request (agent/act)
 * - Get AI-optimized page snapshots for planning (agent/observe)
 * - Extract structured data from pages using schemas (agent/extract)
 */

import { z } from "zod";
import { BAPSelectorSchema } from "./selectors.js";
import { AccessibilityNodeSchema } from "./common.js";

// =============================================================================
// agent/act - Multi-step action execution
// =============================================================================

/**
 * Pre-condition state for a step
 */
export const StepConditionStateSchema = z.enum([
  "visible",
  "enabled",
  "exists",
  "hidden",
  "disabled",
]);
export type StepConditionState = z.infer<typeof StepConditionStateSchema>;

/**
 * Pre-condition for a step (must be true before step executes)
 */
export const StepConditionSchema = z.object({
  /** Element that must exist/match condition */
  selector: BAPSelectorSchema,
  /** Required state of the element */
  state: StepConditionStateSchema,
  /** Timeout for condition check (ms) */
  timeout: z.number().optional(),
});
export type StepCondition = z.infer<typeof StepConditionSchema>;

/**
 * Error handling strategy for a step
 */
export const StepErrorHandlingSchema = z.enum([
  "stop", // Stop execution, return error (default)
  "skip", // Skip this step, continue to next
  "retry", // Retry this step (with backoff)
]);
export type StepErrorHandling = z.infer<typeof StepErrorHandlingSchema>;

/**
 * A single step in an action sequence
 */
export const ExecutionStepSchema = z.object({
  /** Human-readable label for this step (for logging/debugging) */
  label: z.string().optional(),

  /** The BAP method to execute (e.g., "action/click", "action/fill") */
  action: z.string(),

  /** Parameters for the action */
  params: z.record(z.unknown()),

  /** Pre-condition that must be met before executing */
  condition: StepConditionSchema.optional(),

  /** How to handle errors for this step */
  onError: StepErrorHandlingSchema.optional(),

  /** Max retries if onError is "retry" */
  maxRetries: z.number().min(1).max(5).optional(),

  /** Delay between retries (ms) */
  retryDelay: z.number().min(100).max(5000).optional(),
});
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

/**
 * Parameters for agent/act
 */
export const AgentActParamsSchema = z.object({
  /** Page to execute on (defaults to active page) */
  pageId: z.string().optional(),

  /** Sequence of steps to execute */
  steps: z.array(ExecutionStepSchema).min(1).max(50),

  /** Stop on first error (default: true) */
  stopOnFirstError: z.boolean().optional(),

  /** Continue execution even if a condition fails (default: false) */
  continueOnConditionFail: z.boolean().optional(),

  /** Global timeout for entire sequence (ms) */
  timeout: z.number().optional(),
});
export type AgentActParams = z.infer<typeof AgentActParamsSchema>;

/**
 * Error information for a failed step
 */
export const StepErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z
    .object({
      retryable: z.boolean(),
      retryAfterMs: z.number().optional(),
      details: z.record(z.unknown()).optional(),
    })
    .optional(),
});
export type StepError = z.infer<typeof StepErrorSchema>;

/**
 * Result of a single step execution
 */
export const StepResultSchema = z.object({
  /** Step index (0-based) */
  step: z.number(),

  /** Step label if provided */
  label: z.string().optional(),

  /** Whether step succeeded */
  success: z.boolean(),

  /** Result data from the action (if any) */
  result: z.unknown().optional(),

  /** Error if step failed */
  error: StepErrorSchema.optional(),

  /** Time taken for this step (ms) */
  duration: z.number(),

  /** Number of retries attempted */
  retries: z.number().optional(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

/**
 * Result of agent/act
 */
export const AgentActResultSchema = z.object({
  /** Number of steps completed successfully */
  completed: z.number(),

  /** Total number of steps */
  total: z.number(),

  /** Whether all steps succeeded */
  success: z.boolean(),

  /** Results for each step (in order) */
  results: z.array(StepResultSchema),

  /** Total execution time (ms) */
  duration: z.number(),

  /** Index of first failed step (if any) */
  failedAt: z.number().optional(),
});
export type AgentActResult = z.infer<typeof AgentActResultSchema>;

// =============================================================================
// agent/observe - AI-optimized page observation
// =============================================================================

/**
 * Action hint for an interactive element
 */
export const ActionHintSchema = z.enum([
  "clickable",
  "editable",
  "selectable",
  "checkable",
  "expandable",
  "draggable",
  "scrollable",
  "submittable",
]);
export type ActionHint = z.infer<typeof ActionHintSchema>;

/**
 * Bounding box for an element
 */
export const ElementBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type ElementBounds = z.infer<typeof ElementBoundsSchema>;

// =============================================================================
// Element Identity System - Stable element references across observations
// =============================================================================

/**
 * Element identity information for stable reference generation
 * Used to track elements across multiple observations
 */
export const ElementIdentitySchema = z.object({
  /** data-testid attribute (highest stability) */
  testId: z.string().optional(),
  /** aria-label attribute */
  ariaLabel: z.string().optional(),
  /** HTML id attribute */
  id: z.string().optional(),
  /** ARIA role */
  role: z.string(),
  /** Accessible name */
  name: z.string().optional(),
  /** HTML tag name */
  tagName: z.string(),
  /** Parent's ARIA role (for context) */
  parentRole: z.string().optional(),
  /** Position among same-role siblings */
  siblingIndex: z.number().optional(),
});
export type ElementIdentity = z.infer<typeof ElementIdentitySchema>;

/**
 * Stability indicator for element references
 */
export const RefStabilitySchema = z.enum([
  "stable",  // Same element, same ref
  "new",     // Newly discovered element
  "moved",   // Element found but ref changed (rare)
]);
export type RefStability = z.infer<typeof RefStabilitySchema>;

/**
 * Interactive element with pre-computed selector
 */
export const InteractiveElementSchema = z.object({
  /** Element reference ID (e.g., "@e1" or "@submitBtn") */
  ref: z.string(),

  /** Pre-computed selector that targets this element */
  selector: BAPSelectorSchema,

  /** ARIA role */
  role: z.string(),

  /** Accessible name */
  name: z.string().optional(),

  /** Current value (for inputs) */
  value: z.string().optional(),

  /** What actions can be performed */
  actionHints: z.array(ActionHintSchema),

  /** Bounding box (if requested) */
  bounds: ElementBoundsSchema.optional(),

  /** Tag name */
  tagName: z.string(),

  /** Whether element is focused */
  focused: z.boolean().optional(),

  /** Whether element is disabled */
  disabled: z.boolean().optional(),

  /** Previous ref if element was reassigned (for tracking) */
  previousRef: z.string().optional(),

  /** Ref stability indicator */
  stability: RefStabilitySchema.optional(),
});
export type InteractiveElement = z.infer<typeof InteractiveElementSchema>;

// =============================================================================
// Screenshot Annotation (Set-of-Marks)
// =============================================================================

/**
 * Badge style for annotation markers
 */
export const AnnotationBadgeStyleSchema = z.object({
  /** Badge background color */
  color: z.string().optional(),
  /** Badge text color */
  textColor: z.string().optional(),
  /** Badge size in pixels */
  size: z.number().optional(),
  /** Font specification */
  font: z.string().optional(),
});
export type AnnotationBadgeStyle = z.infer<typeof AnnotationBadgeStyleSchema>;

/**
 * Bounding box style for annotation
 */
export const AnnotationBoxStyleSchema = z.object({
  /** Box border color */
  color: z.string().optional(),
  /** Box border width in pixels */
  width: z.number().optional(),
  /** Box border style */
  style: z.enum(["solid", "dashed"]).optional(),
});
export type AnnotationBoxStyle = z.infer<typeof AnnotationBoxStyleSchema>;

/**
 * Annotation style options
 */
export const AnnotationStyleSchema = z.object({
  /** Badge appearance */
  badge: AnnotationBadgeStyleSchema.optional(),
  /** Bounding box appearance */
  box: AnnotationBoxStyleSchema.optional(),
  /** Show bounding box around elements */
  showBoundingBox: z.boolean().optional(),
  /** Overall opacity (0-1) */
  opacity: z.number().min(0).max(1).optional(),
});
export type AnnotationStyle = z.infer<typeof AnnotationStyleSchema>;

/**
 * Label format for annotations
 */
export const AnnotationLabelFormatSchema = z.enum([
  "number",  // [1], [2], [3]
  "ref",     // @e1, @submit
  "both",    // [1] @submit
]);
export type AnnotationLabelFormat = z.infer<typeof AnnotationLabelFormatSchema>;

/**
 * Full annotation options
 */
export const AnnotationOptionsSchema = z.object({
  /** Enable annotation */
  enabled: z.boolean(),
  /** Visual style options */
  style: AnnotationStyleSchema.optional(),
  /** Use stable refs as labels */
  useStableRefs: z.boolean().optional(),
  /** Maximum number of labels to show */
  maxLabels: z.number().optional(),
  /** Label format */
  labelFormat: AnnotationLabelFormatSchema.optional(),
});
export type AnnotationOptions = z.infer<typeof AnnotationOptionsSchema>;

/**
 * Mapping from annotation label to element
 */
export const AnnotationMappingSchema = z.object({
  /** Label shown on screenshot (e.g., "1" or "@submit") */
  label: z.string(),
  /** Element ref */
  ref: z.string(),
  /** Badge position on screenshot */
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
});
export type AnnotationMapping = z.infer<typeof AnnotationMappingSchema>;

/**
 * Parameters for agent/observe
 */
export const AgentObserveParamsSchema = z.object({
  /** Page to observe (defaults to active page) */
  pageId: z.string().optional(),

  /** Include full accessibility tree */
  includeAccessibility: z.boolean().optional(),

  /** Include screenshot (base64) */
  includeScreenshot: z.boolean().optional(),

  /** Include list of interactive elements with selectors */
  includeInteractiveElements: z.boolean().optional(),

  /** Include page metadata (title, URL) */
  includeMetadata: z.boolean().optional(),

  /** Max elements to return (for token efficiency) */
  maxElements: z.number().min(1).max(200).optional(),

  /** Filter to specific ARIA roles */
  filterRoles: z.array(z.string()).optional(),

  /** Include bounding boxes for elements */
  includeBounds: z.boolean().optional(),

  // Element Reference System options
  /** Use stable refs that persist across observations (default: true) */
  stableRefs: z.boolean().optional(),

  /** Force refresh all refs (regenerate from scratch) */
  refreshRefs: z.boolean().optional(),

  /** Include previous ref if element was reassigned */
  includeRefHistory: z.boolean().optional(),

  // Screenshot Annotation options
  /** Annotate screenshot with element markers (Set-of-Marks style) */
  annotateScreenshot: z.union([
    z.boolean(),
    AnnotationOptionsSchema,
  ]).optional(),
});
export type AgentObserveParams = z.infer<typeof AgentObserveParamsSchema>;

/**
 * Page metadata in observation
 */
export const ObserveMetadataSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
});
export type ObserveMetadata = z.infer<typeof ObserveMetadataSchema>;

/**
 * Screenshot data in observation
 */
export const ObserveScreenshotSchema = z.object({
  data: z.string(),
  format: z.enum(["png", "jpeg", "webp"]),
  width: z.number(),
  height: z.number(),
  /** Whether screenshot has been annotated with element markers */
  annotated: z.boolean().optional(),
});
export type ObserveScreenshot = z.infer<typeof ObserveScreenshotSchema>;

/**
 * Result of agent/observe
 */
export const AgentObserveResultSchema = z.object({
  /** Page metadata */
  metadata: ObserveMetadataSchema.optional(),

  /** Accessibility tree (if requested) */
  accessibility: z
    .object({
      tree: z.array(AccessibilityNodeSchema),
    })
    .optional(),

  /** Screenshot data (if requested) */
  screenshot: ObserveScreenshotSchema.optional(),

  /** Interactive elements with selectors (if requested) */
  interactiveElements: z.array(InteractiveElementSchema).optional(),

  /** Total interactive elements on page (may be more than returned) */
  totalInteractiveElements: z.number().optional(),

  /** Mapping from annotation labels to elements (if annotateScreenshot was used) */
  annotationMap: z.array(AnnotationMappingSchema).optional(),
});
export type AgentObserveResult = z.infer<typeof AgentObserveResultSchema>;

// =============================================================================
// Allowed Actions for agent/act
// =============================================================================

/**
 * List of actions allowed in agent/act sequences
 * This whitelist prevents unsafe operations from being included in composite actions
 */
export const ALLOWED_ACT_ACTIONS = [
  "action/click",
  "action/dblclick",
  "action/fill",
  "action/type",
  "action/press",
  "action/hover",
  "action/scroll",
  "action/select",
  "action/check",
  "action/uncheck",
  "action/clear",
  "action/upload",
  "action/drag",
  "page/navigate",
  "page/reload",
  "page/goBack",
  "page/goForward",
] as const;

export type AllowedActAction = (typeof ALLOWED_ACT_ACTIONS)[number];

// =============================================================================
// agent/extract - Structured data extraction
// =============================================================================

/**
 * Base schema property (non-recursive leaf types)
 */
const BaseSchemaPropertySchema = z.object({
  /** Type of the value */
  type: z.enum(["string", "number", "boolean"]),
  /** Description of what to extract (helps AI understand the intent) */
  description: z.string().optional(),
});

/**
 * JSON Schema for extraction (simplified subset - max 2 levels deep)
 * This avoids infinite recursion while supporting common use cases
 */
export const ExtractionSchemaSchema: z.ZodType<{
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, {
    type: "object" | "array" | "string" | "number" | "boolean";
    description?: string;
    properties?: Record<string, { type: string; description?: string }>;
    items?: { type: string; description?: string; properties?: Record<string, { type: string; description?: string }> };
  }>;
  required?: string[];
  items?: {
    type: "object" | "array" | "string" | "number" | "boolean";
    description?: string;
    properties?: Record<string, { type: string; description?: string }>;
  };
  description?: string;
}> = z.object({
  /** Type of the root value */
  type: z.enum(["object", "array", "string", "number", "boolean"]),
  /** Properties for object type (one level of nesting) */
  properties: z.record(z.object({
    type: z.enum(["object", "array", "string", "number", "boolean"]),
    description: z.string().optional(),
    properties: z.record(BaseSchemaPropertySchema).optional(),
    items: z.object({
      type: z.enum(["object", "array", "string", "number", "boolean"]),
      description: z.string().optional(),
      properties: z.record(BaseSchemaPropertySchema).optional(),
    }).optional(),
  })).optional(),
  /** Required properties for object type */
  required: z.array(z.string()).optional(),
  /** Items schema for array type */
  items: z.object({
    type: z.enum(["object", "array", "string", "number", "boolean"]),
    description: z.string().optional(),
    properties: z.record(BaseSchemaPropertySchema).optional(),
  }).optional(),
  /** Description of what to extract (helps AI understand the intent) */
  description: z.string().optional(),
});
export type ExtractionSchema = z.infer<typeof ExtractionSchemaSchema>;

/**
 * Extraction mode
 */
export const ExtractionModeSchema = z.enum([
  "single", // Extract a single item matching the schema
  "list", // Extract all items matching the schema
  "table", // Extract tabular data
]);
export type ExtractionMode = z.infer<typeof ExtractionModeSchema>;

/**
 * Parameters for agent/extract
 */
export const AgentExtractParamsSchema = z.object({
  /** Page to extract from (defaults to active page) */
  pageId: z.string().optional(),

  /** Natural language description of what to extract */
  instruction: z.string(),

  /** JSON Schema defining the structure of extracted data */
  schema: ExtractionSchemaSchema,

  /** Extraction mode */
  mode: ExtractionModeSchema.optional(),

  /** Selector to limit extraction scope */
  selector: BAPSelectorSchema.optional(),

  /** Include source element references in result */
  includeSourceRefs: z.boolean().optional(),

  /** Timeout for extraction (ms) */
  timeout: z.number().optional(),
});
export type AgentExtractParams = z.infer<typeof AgentExtractParamsSchema>;

/**
 * Source reference for extracted data
 */
export const ExtractionSourceRefSchema = z.object({
  /** Element reference ID */
  ref: z.string(),
  /** Selector to target this element */
  selector: BAPSelectorSchema,
  /** Text content of the element */
  text: z.string().optional(),
});
export type ExtractionSourceRef = z.infer<typeof ExtractionSourceRefSchema>;

/**
 * Result of agent/extract
 */
export const AgentExtractResultSchema = z.object({
  /** Whether extraction was successful */
  success: z.boolean(),

  /** Extracted data matching the schema */
  data: z.unknown(),

  /** Source references for extracted data (if requested) */
  sources: z.array(ExtractionSourceRefSchema).optional(),

  /** Confidence score (0-1) for the extraction */
  confidence: z.number().min(0).max(1).optional(),

  /** Error message if extraction failed */
  error: z.string().optional(),
});
export type AgentExtractResult = z.infer<typeof AgentExtractResultSchema>;
