/**
 * @fileoverview BAP method parameter and result types with Zod schemas
 * @module bap-core/types/methods
 */

import { z } from "zod";
import { BAPSelectorSchema } from "./selectors.js";
import {
  BoundingBoxSchema,
  ActionOptionsSchema,
  ClickOptionsSchema,
  TypeOptionsSchema,
  ScrollOptionsSchema,
  ScreenshotOptionsSchema,
  ScreenshotFormatSchema,
  WaitUntilStateSchema,
  ViewportSchema,
  PageSchema,
  StorageStateSchema,
  CookieSchema,
  AccessibilityNodeSchema,
  HttpMethodSchema,
  ResourceTypeSchema,
} from "./common.js";

// =============================================================================
// Browser Methods
// =============================================================================

/** Browser type */
export const BrowserTypeSchema = z.enum(["chromium", "firefox", "webkit"]);
export type BrowserType = z.infer<typeof BrowserTypeSchema>;

/** Proxy configuration */
export const ProxyConfigSchema = z.object({
  server: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

/** browser/launch parameters */
export const BrowserLaunchParamsSchema = z.object({
  browser: BrowserTypeSchema.optional(),
  headless: z.boolean().optional(),
  args: z.array(z.string()).optional(),
  proxy: ProxyConfigSchema.optional(),
  downloadsPath: z.string().optional(),
});
export type BrowserLaunchParams = z.infer<typeof BrowserLaunchParamsSchema>;

/** browser/launch result */
export const BrowserLaunchResultSchema = z.object({
  browserId: z.string(),
  version: z.string(),
  defaultContext: z.string(),
});
export type BrowserLaunchResult = z.infer<typeof BrowserLaunchResultSchema>;

/** browser/close parameters */
export const BrowserCloseParamsSchema = z.object({
  browserId: z.string().optional(),
});
export type BrowserCloseParams = z.infer<typeof BrowserCloseParamsSchema>;

// =============================================================================
// Page Methods
// =============================================================================

/** Geolocation configuration */
export const GeolocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().optional(),
});
export type Geolocation = z.infer<typeof GeolocationSchema>;

/** page/create parameters */
export const PageCreateParamsSchema = z.object({
  url: z.string().optional(),
  viewport: ViewportSchema.optional(),
  userAgent: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  geolocation: GeolocationSchema.optional(),
  permissions: z.array(z.string()).optional(),
  offline: z.boolean().optional(),
  storageState: StorageStateSchema.optional(),
});
export type PageCreateParams = z.infer<typeof PageCreateParamsSchema>;

/** page/navigate parameters */
export const PageNavigateParamsSchema = z.object({
  pageId: z.string().optional(),
  url: z.string(),
  waitUntil: WaitUntilStateSchema.optional(),
  timeout: z.number().optional(),
  referer: z.string().optional(),
});
export type PageNavigateParams = z.infer<typeof PageNavigateParamsSchema>;

/** page/navigate result */
export const PageNavigateResultSchema = z.object({
  url: z.string(),
  status: z.number(),
  headers: z.record(z.string()),
});
export type PageNavigateResult = z.infer<typeof PageNavigateResultSchema>;

/** page/reload parameters */
export const PageReloadParamsSchema = z.object({
  pageId: z.string().optional(),
  waitUntil: WaitUntilStateSchema.optional(),
  timeout: z.number().optional(),
});
export type PageReloadParams = z.infer<typeof PageReloadParamsSchema>;

/** page/goBack parameters */
export const PageGoBackParamsSchema = z.object({
  pageId: z.string().optional(),
  waitUntil: WaitUntilStateSchema.optional(),
  timeout: z.number().optional(),
});
export type PageGoBackParams = z.infer<typeof PageGoBackParamsSchema>;

/** page/goForward parameters */
export const PageGoForwardParamsSchema = z.object({
  pageId: z.string().optional(),
  waitUntil: WaitUntilStateSchema.optional(),
  timeout: z.number().optional(),
});
export type PageGoForwardParams = z.infer<typeof PageGoForwardParamsSchema>;

/** page/close parameters */
export const PageCloseParamsSchema = z.object({
  pageId: z.string(),
  runBeforeUnload: z.boolean().optional(),
});
export type PageCloseParams = z.infer<typeof PageCloseParamsSchema>;

/** page/list result */
export const PageListResultSchema = z.object({
  pages: z.array(PageSchema),
  activePage: z.string(),
});
export type PageListResult = z.infer<typeof PageListResultSchema>;

/** page/activate parameters */
export const PageActivateParamsSchema = z.object({
  pageId: z.string(),
});
export type PageActivateParams = z.infer<typeof PageActivateParamsSchema>;

// =============================================================================
// Action Methods
// =============================================================================

/** action/click parameters */
export const ActionClickParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  options: ClickOptionsSchema.optional(),
});
export type ActionClickParams = z.infer<typeof ActionClickParamsSchema>;

/** action/dblclick parameters */
export const ActionDblclickParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  options: ClickOptionsSchema.optional(),
});
export type ActionDblclickParams = z.infer<typeof ActionDblclickParamsSchema>;

/** action/type parameters */
export const ActionTypeParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  text: z.string(),
  options: TypeOptionsSchema.optional(),
});
export type ActionTypeParams = z.infer<typeof ActionTypeParamsSchema>;

/** action/fill parameters */
export const ActionFillParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  value: z.string(),
  options: ActionOptionsSchema.optional(),
});
export type ActionFillParams = z.infer<typeof ActionFillParamsSchema>;

/** action/clear parameters */
export const ActionClearParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  options: ActionOptionsSchema.optional(),
});
export type ActionClearParams = z.infer<typeof ActionClearParamsSchema>;

/** action/press parameters */
export const ActionPressParamsSchema = z.object({
  pageId: z.string().optional(),
  key: z.string(),
  selector: BAPSelectorSchema.optional(),
  options: ActionOptionsSchema.optional(),
});
export type ActionPressParams = z.infer<typeof ActionPressParamsSchema>;

/** Position for hover */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** action/hover parameters */
export const ActionHoverParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  options: ActionOptionsSchema.extend({
    position: PositionSchema.optional(),
  }).optional(),
});
export type ActionHoverParams = z.infer<typeof ActionHoverParamsSchema>;

/** action/scroll parameters */
export const ActionScrollParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema.optional(),
  options: ScrollOptionsSchema.optional(),
});
export type ActionScrollParams = z.infer<typeof ActionScrollParamsSchema>;

/** action/select parameters */
export const ActionSelectParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  values: z.union([z.string(), z.array(z.string())]),
  options: ActionOptionsSchema.optional(),
});
export type ActionSelectParams = z.infer<typeof ActionSelectParamsSchema>;

/** action/check parameters */
export const ActionCheckParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  options: ActionOptionsSchema.optional(),
});
export type ActionCheckParams = z.infer<typeof ActionCheckParamsSchema>;

/** action/uncheck parameters */
export const ActionUncheckParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  options: ActionOptionsSchema.optional(),
});
export type ActionUncheckParams = z.infer<typeof ActionUncheckParamsSchema>;

/** File upload */
export const FileUploadSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  buffer: z.string(), // Base64-encoded
});
export type FileUpload = z.infer<typeof FileUploadSchema>;

/** action/upload parameters */
export const ActionUploadParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  files: z.array(FileUploadSchema),
  options: ActionOptionsSchema.optional(),
});
export type ActionUploadParams = z.infer<typeof ActionUploadParamsSchema>;

/** action/drag parameters */
export const ActionDragParamsSchema = z.object({
  pageId: z.string().optional(),
  source: BAPSelectorSchema,
  target: z.union([BAPSelectorSchema, PositionSchema]),
  options: ActionOptionsSchema.optional(),
});
export type ActionDragParams = z.infer<typeof ActionDragParamsSchema>;

// =============================================================================
// Observation Methods
// =============================================================================

/** observe/screenshot parameters */
export const ObserveScreenshotParamsSchema = z.object({
  pageId: z.string().optional(),
  options: ScreenshotOptionsSchema.optional(),
});
export type ObserveScreenshotParams = z.infer<typeof ObserveScreenshotParamsSchema>;

/** observe/screenshot result */
export const ObserveScreenshotResultSchema = z.object({
  data: z.string(), // Base64-encoded
  format: ScreenshotFormatSchema,
  width: z.number(),
  height: z.number(),
});
export type ObserveScreenshotResult = z.infer<typeof ObserveScreenshotResultSchema>;

/** Accessibility tree options */
export const AccessibilityTreeOptionsSchema = z.object({
  root: BAPSelectorSchema.optional(),
  maxDepth: z.number().optional(),
  includeHidden: z.boolean().optional(),
  interestingOnly: z.boolean().optional(),
});
export type AccessibilityTreeOptions = z.infer<typeof AccessibilityTreeOptionsSchema>;

/** observe/accessibility parameters */
export const ObserveAccessibilityParamsSchema = z.object({
  pageId: z.string().optional(),
  options: AccessibilityTreeOptionsSchema.optional(),
});
export type ObserveAccessibilityParams = z.infer<typeof ObserveAccessibilityParamsSchema>;

/** observe/accessibility result */
export const ObserveAccessibilityResultSchema = z.object({
  tree: AccessibilityNodeSchema,
});
export type ObserveAccessibilityResult = z.infer<typeof ObserveAccessibilityResultSchema>;

/** DOM snapshot options */
export const DOMSnapshotOptionsSchema = z.object({
  root: BAPSelectorSchema.optional(),
  depth: z.number().optional(),
  attributes: z.array(z.string()).optional(),
  computedStyles: z.array(z.string()).optional(),
});
export type DOMSnapshotOptions = z.infer<typeof DOMSnapshotOptionsSchema>;

/** observe/dom parameters */
export const ObserveDOMParamsSchema = z.object({
  pageId: z.string().optional(),
  options: DOMSnapshotOptionsSchema.optional(),
});
export type ObserveDOMParams = z.infer<typeof ObserveDOMParamsSchema>;

/** observe/dom result */
export const ObserveDOMResultSchema = z.object({
  html: z.string(),
  text: z.string(),
  title: z.string(),
  url: z.string(),
});
export type ObserveDOMResult = z.infer<typeof ObserveDOMResultSchema>;

/** Element properties that can be queried */
export const ElementPropertySchema = z.enum([
  "visible",
  "enabled",
  "checked",
  "text",
  "value",
  "boundingBox",
  "attributes",
  "computedStyle",
]);
export type ElementProperty = z.infer<typeof ElementPropertySchema>;

/** observe/element parameters */
export const ObserveElementParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema,
  properties: z.array(ElementPropertySchema),
});
export type ObserveElementParams = z.infer<typeof ObserveElementParamsSchema>;

/** observe/element result */
export const ObserveElementResultSchema = z.object({
  found: z.boolean(),
  visible: z.boolean().optional(),
  enabled: z.boolean().optional(),
  checked: z.boolean().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
  boundingBox: BoundingBoxSchema.optional(),
  attributes: z.record(z.string()).optional(),
  computedStyle: z.record(z.string()).optional(),
});
export type ObserveElementResult = z.infer<typeof ObserveElementResultSchema>;

/** Paper format for PDF */
export const PaperFormatSchema = z.enum(["Letter", "Legal", "Tabloid", "A4", "A3", "A5"]);
export type PaperFormat = z.infer<typeof PaperFormatSchema>;

/** PDF margins */
export const PDFMarginSchema = z.object({
  top: z.string().optional(),
  right: z.string().optional(),
  bottom: z.string().optional(),
  left: z.string().optional(),
});

/** observe/pdf parameters */
export const ObservePDFParamsSchema = z.object({
  pageId: z.string().optional(),
  options: z
    .object({
      format: PaperFormatSchema.optional(),
      landscape: z.boolean().optional(),
      scale: z.number().optional(),
      margin: PDFMarginSchema.optional(),
      printBackground: z.boolean().optional(),
    })
    .optional(),
});
export type ObservePDFParams = z.infer<typeof ObservePDFParamsSchema>;

/** observe/pdf result */
export const ObservePDFResultSchema = z.object({
  data: z.string(), // Base64-encoded
});
export type ObservePDFResult = z.infer<typeof ObservePDFResultSchema>;

/** Content format */
export const ContentFormatSchema = z.enum(["html", "text", "markdown"]);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

/** observe/content parameters */
export const ObserveContentParamsSchema = z.object({
  pageId: z.string().optional(),
  format: ContentFormatSchema,
});
export type ObserveContentParams = z.infer<typeof ObserveContentParamsSchema>;

/** observe/content result */
export const ObserveContentResultSchema = z.object({
  content: z.string(),
  url: z.string(),
  title: z.string(),
});
export type ObserveContentResult = z.infer<typeof ObserveContentResultSchema>;

/** observe/ariaSnapshot parameters */
export const ObserveAriaSnapshotParamsSchema = z.object({
  pageId: z.string().optional(),
  selector: BAPSelectorSchema.optional(),
  options: z
    .object({
      timeout: z.number().optional(),
    })
    .optional(),
});
export type ObserveAriaSnapshotParams = z.infer<typeof ObserveAriaSnapshotParamsSchema>;

/** observe/ariaSnapshot result */
export const ObserveAriaSnapshotResultSchema = z.object({
  snapshot: z.string(),
  url: z.string(),
  title: z.string(),
});
export type ObserveAriaSnapshotResult = z.infer<typeof ObserveAriaSnapshotResultSchema>;

// =============================================================================
// Storage Methods
// =============================================================================

/** storage/getState parameters */
export const StorageGetStateParamsSchema = z.object({
  pageId: z.string().optional(),
});
export type StorageGetStateParams = z.infer<typeof StorageGetStateParamsSchema>;

/** storage/setState parameters */
export const StorageSetStateParamsSchema = z.object({
  state: StorageStateSchema,
});
export type StorageSetStateParams = z.infer<typeof StorageSetStateParamsSchema>;

/** storage/getCookies parameters */
export const StorageGetCookiesParamsSchema = z.object({
  urls: z.array(z.string()).optional(),
});
export type StorageGetCookiesParams = z.infer<typeof StorageGetCookiesParamsSchema>;

/** storage/getCookies result */
export const StorageGetCookiesResultSchema = z.object({
  cookies: z.array(CookieSchema),
});
export type StorageGetCookiesResult = z.infer<typeof StorageGetCookiesResultSchema>;

/** storage/setCookies parameters */
export const StorageSetCookiesParamsSchema = z.object({
  cookies: z.array(CookieSchema),
});
export type StorageSetCookiesParams = z.infer<typeof StorageSetCookiesParamsSchema>;

/** storage/clearCookies parameters */
export const StorageClearCookiesParamsSchema = z.object({
  urls: z.array(z.string()).optional(),
});
export type StorageClearCookiesParams = z.infer<typeof StorageClearCookiesParamsSchema>;

// =============================================================================
// Network Methods
// =============================================================================

/** Request interception pattern */
export const InterceptPatternSchema = z.object({
  urlPattern: z.string().optional(),
  resourceType: ResourceTypeSchema.optional(),
  method: HttpMethodSchema.optional(),
});
export type InterceptPattern = z.infer<typeof InterceptPatternSchema>;

/** Interception handler type */
export const InterceptHandlerSchema = z.enum(["abort", "continue", "respond", "callback"]);
export type InterceptHandler = z.infer<typeof InterceptHandlerSchema>;

/** network/intercept parameters */
export const NetworkInterceptParamsSchema = z.object({
  patterns: z.array(InterceptPatternSchema),
  handler: InterceptHandlerSchema,
});
export type NetworkInterceptParams = z.infer<typeof NetworkInterceptParamsSchema>;

/** network/fulfill parameters */
export const NetworkFulfillParamsSchema = z.object({
  requestId: z.string(),
  response: z.object({
    status: z.number().optional(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    contentType: z.string().optional(),
  }),
});
export type NetworkFulfillParams = z.infer<typeof NetworkFulfillParamsSchema>;

/** Request abort reason */
export const AbortReasonSchema = z.enum(["aborted", "accessdenied", "blockedbyclient", "failed"]);
export type AbortReason = z.infer<typeof AbortReasonSchema>;

/** network/abort parameters */
export const NetworkAbortParamsSchema = z.object({
  requestId: z.string(),
  reason: AbortReasonSchema.optional(),
});
export type NetworkAbortParams = z.infer<typeof NetworkAbortParamsSchema>;

/** network/continue parameters */
export const NetworkContinueParamsSchema = z.object({
  requestId: z.string(),
  overrides: z
    .object({
      url: z.string().optional(),
      method: HttpMethodSchema.optional(),
      headers: z.record(z.string()).optional(),
      postData: z.string().optional(),
    })
    .optional(),
});
export type NetworkContinueParams = z.infer<typeof NetworkContinueParamsSchema>;

// =============================================================================
// Emulation Methods
// =============================================================================

/** emulate/setViewport parameters */
export const EmulateSetViewportParamsSchema = z.object({
  pageId: z.string().optional(),
  width: z.number(),
  height: z.number(),
  deviceScaleFactor: z.number().optional(),
  isMobile: z.boolean().optional(),
  hasTouch: z.boolean().optional(),
});
export type EmulateSetViewportParams = z.infer<typeof EmulateSetViewportParamsSchema>;

/** emulate/setUserAgent parameters */
export const EmulateSetUserAgentParamsSchema = z.object({
  pageId: z.string().optional(),
  userAgent: z.string(),
  platform: z.string().optional(),
  acceptLanguage: z.string().optional(),
});
export type EmulateSetUserAgentParams = z.infer<typeof EmulateSetUserAgentParamsSchema>;

/** emulate/setGeolocation parameters */
export const EmulateSetGeolocationParamsSchema = z.object({
  pageId: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().optional(),
});
export type EmulateSetGeolocationParams = z.infer<typeof EmulateSetGeolocationParamsSchema>;

/** emulate/setOffline parameters */
export const EmulateSetOfflineParamsSchema = z.object({
  pageId: z.string().optional(),
  offline: z.boolean(),
});
export type EmulateSetOfflineParams = z.infer<typeof EmulateSetOfflineParamsSchema>;

// =============================================================================
// Dialog Methods
// =============================================================================

/** Dialog action */
export const DialogActionSchema = z.enum(["accept", "dismiss"]);
export type DialogAction = z.infer<typeof DialogActionSchema>;

/** dialog/handle parameters */
export const DialogHandleParamsSchema = z.object({
  pageId: z.string().optional(),
  action: DialogActionSchema,
  promptText: z.string().optional(),
});
export type DialogHandleParams = z.infer<typeof DialogHandleParamsSchema>;

// =============================================================================
// Trace Methods
// =============================================================================

/** trace/start parameters */
export const TraceStartParamsSchema = z.object({
  name: z.string().optional(),
  screenshots: z.boolean().optional(),
  snapshots: z.boolean().optional(),
  sources: z.boolean().optional(),
});
export type TraceStartParams = z.infer<typeof TraceStartParamsSchema>;

/** trace/stop result */
export const TraceStopResultSchema = z.object({
  path: z.string().optional(),
  data: z.string().optional(), // Base64-encoded
});
export type TraceStopResult = z.infer<typeof TraceStopResultSchema>;

// =============================================================================
// Context Methods (Multi-Context Support)
// =============================================================================

/** Context options for creation */
export const ContextOptionsSchema = z.object({
  storageState: StorageStateSchema.optional(),
  viewport: ViewportSchema.optional(),
  userAgent: z.string().optional(),
  locale: z.string().optional(),
  timezoneId: z.string().optional(),
  geolocation: GeolocationSchema.optional(),
  permissions: z.array(z.string()).optional(),
  colorScheme: z.enum(["light", "dark", "no-preference"]).optional(),
  offline: z.boolean().optional(),
});
export type ContextOptions = z.infer<typeof ContextOptionsSchema>;

/** context/create parameters */
export const ContextCreateParamsSchema = z.object({
  /** Optional custom ID (alphanumeric + hyphen, max 64 chars) */
  contextId: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/).optional(),
  /** Context options */
  options: ContextOptionsSchema.optional(),
});
export type ContextCreateParams = z.infer<typeof ContextCreateParamsSchema>;

/** context/create result */
export const ContextCreateResultSchema = z.object({
  contextId: z.string(),
});
export type ContextCreateResult = z.infer<typeof ContextCreateResultSchema>;

/** Context info for listing */
export const ContextInfoSchema = z.object({
  id: z.string(),
  pageCount: z.number(),
  created: z.number(),
  options: ContextOptionsSchema.optional(),
});
export type ContextInfo = z.infer<typeof ContextInfoSchema>;

/** context/list result */
export const ContextListResultSchema = z.object({
  contexts: z.array(ContextInfoSchema),
  limits: z.object({
    maxContexts: z.number(),
    currentCount: z.number(),
  }),
});
export type ContextListResult = z.infer<typeof ContextListResultSchema>;

/** context/destroy parameters */
export const ContextDestroyParamsSchema = z.object({
  contextId: z.string(),
});
export type ContextDestroyParams = z.infer<typeof ContextDestroyParamsSchema>;

/** context/destroy result */
export const ContextDestroyResultSchema = z.object({
  pagesDestroyed: z.number(),
});
export type ContextDestroyResult = z.infer<typeof ContextDestroyResultSchema>;

// =============================================================================
// Frame Methods (Frame & Shadow DOM Support)
// =============================================================================

/** Frame info */
export const FrameInfoSchema = z.object({
  frameId: z.string(),
  name: z.string(),
  url: z.string(),
  parentFrameId: z.string().optional(),
  isMain: z.boolean(),
});
export type FrameInfo = z.infer<typeof FrameInfoSchema>;

/** frame/list parameters */
export const FrameListParamsSchema = z.object({
  pageId: z.string().optional(),
});
export type FrameListParams = z.infer<typeof FrameListParamsSchema>;

/** frame/list result */
export const FrameListResultSchema = z.object({
  frames: z.array(FrameInfoSchema),
});
export type FrameListResult = z.infer<typeof FrameListResultSchema>;

/** frame/switch parameters */
export const FrameSwitchParamsSchema = z.object({
  pageId: z.string().optional(),
  /** Switch by frame ID */
  frameId: z.string().optional(),
  /** Switch by finding iframe element */
  selector: BAPSelectorSchema.optional(),
  /** Switch by URL pattern */
  url: z.string().optional(),
});
export type FrameSwitchParams = z.infer<typeof FrameSwitchParamsSchema>;

/** frame/switch result */
export const FrameSwitchResultSchema = z.object({
  frameId: z.string(),
  url: z.string(),
});
export type FrameSwitchResult = z.infer<typeof FrameSwitchResultSchema>;

/** frame/main parameters */
export const FrameMainParamsSchema = z.object({
  pageId: z.string().optional(),
});
export type FrameMainParams = z.infer<typeof FrameMainParamsSchema>;

/** frame/main result */
export const FrameMainResultSchema = z.object({
  frameId: z.string(),
});
export type FrameMainResult = z.infer<typeof FrameMainResultSchema>;

// =============================================================================
// Streaming Methods (Streaming Responses)
// =============================================================================

/** stream/chunk notification params */
export const StreamChunkParamsSchema = z.object({
  streamId: z.string(),
  index: z.number(),
  data: z.string(),
  offset: z.number(),
  size: z.number(),
});
export type StreamChunkParams = z.infer<typeof StreamChunkParamsSchema>;

/** stream/end notification params */
export const StreamEndParamsSchema = z.object({
  streamId: z.string(),
  totalChunks: z.number(),
  totalSize: z.number(),
  checksum: z.string().optional(),
});
export type StreamEndParams = z.infer<typeof StreamEndParamsSchema>;

/** stream/error notification params */
export const StreamErrorParamsSchema = z.object({
  streamId: z.string(),
  code: z.number(),
  message: z.string(),
});
export type StreamErrorParams = z.infer<typeof StreamErrorParamsSchema>;

/** stream/cancel parameters */
export const StreamCancelParamsSchema = z.object({
  streamId: z.string(),
});
export type StreamCancelParams = z.infer<typeof StreamCancelParamsSchema>;

/** stream/cancel result */
export const StreamCancelResultSchema = z.object({
  cancelled: z.boolean(),
});
export type StreamCancelResult = z.infer<typeof StreamCancelResultSchema>;

/** Stream start result (returned by methods that support streaming) */
export const StreamStartResultSchema = z.object({
  streamId: z.string(),
  totalSize: z.number().optional(),
  contentType: z.string(),
});
export type StreamStartResult = z.infer<typeof StreamStartResultSchema>;

// =============================================================================
// Approval Methods (Human-in-the-Loop)
// =============================================================================

/** Approval rule match criteria */
export const ApprovalRuleMatchSchema = z.object({
  /** Action method names to match */
  actions: z.array(z.string()).optional(),
  /** Selector patterns to match */
  selectors: z.array(z.object({
    type: z.literal("role"),
    role: z.string(),
    namePattern: z.string().optional(),
  })).optional(),
  /** Domain patterns to match */
  domains: z.array(z.string()).optional(),
  /** URL regex patterns to match */
  urlPatterns: z.array(z.string()).optional(),
});
export type ApprovalRuleMatch = z.infer<typeof ApprovalRuleMatchSchema>;

/** Approval rule */
export const ApprovalRuleSchema = z.object({
  name: z.string(),
  match: ApprovalRuleMatchSchema,
  action: z.enum(["require", "allow", "deny"]),
  timeout: z.number().optional(),
});
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;

/** Approval configuration */
export const ApprovalConfigSchema = z.object({
  mode: z.enum(["disabled", "audit", "required"]),
  rules: z.array(ApprovalRuleSchema).optional(),
  defaultAction: z.enum(["allow", "require"]).optional(),
  timeout: z.number().optional(),
  includeScreenshot: z.boolean().optional(),
});
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;

/** Element info in approval context */
export const ApprovalElementInfoSchema = z.object({
  role: z.string(),
  name: z.string().optional(),
  bounds: BoundingBoxSchema.optional(),
});
export type ApprovalElementInfo = z.infer<typeof ApprovalElementInfoSchema>;

/** approval/required notification params (sent from server to client) */
export const ApprovalRequiredParamsSchema = z.object({
  requestId: z.string(),
  originalRequest: z.object({
    method: z.string(),
    params: z.record(z.unknown()),
  }),
  rule: z.string(),
  context: z.object({
    pageUrl: z.string(),
    pageTitle: z.string(),
    screenshot: z.string().optional(),
    elementInfo: ApprovalElementInfoSchema.optional(),
  }),
  expiresAt: z.number(),
});
export type ApprovalRequiredParams = z.infer<typeof ApprovalRequiredParamsSchema>;

/** Approval decision */
export const ApprovalDecisionSchema = z.enum([
  "approve",
  "deny",
  "approve-once",
  "approve-session",
]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/** approval/respond parameters */
export const ApprovalRespondParamsSchema = z.object({
  requestId: z.string(),
  decision: ApprovalDecisionSchema,
  reason: z.string().optional(),
});
export type ApprovalRespondParams = z.infer<typeof ApprovalRespondParamsSchema>;

/** approval/respond result */
export const ApprovalRespondResultSchema = z.object({
  acknowledged: z.boolean(),
});
export type ApprovalRespondResult = z.infer<typeof ApprovalRespondResultSchema>;

// =============================================================================
// Event Subscription
// =============================================================================

/** events/subscribe parameters */
export const EventsSubscribeParamsSchema = z.object({
  events: z.array(z.string()),
});
export type EventsSubscribeParams = z.infer<typeof EventsSubscribeParamsSchema>;

// =============================================================================
// Method Names
// =============================================================================

/**
 * All BAP method names
 */
export const BAPMethodSchema = z.enum([
  "initialize",
  "shutdown",
  "browser/launch",
  "browser/close",
  // Context methods (Multi-Context Support)
  "context/create",
  "context/list",
  "context/destroy",
  // Page methods
  "page/create",
  "page/navigate",
  "page/reload",
  "page/goBack",
  "page/goForward",
  "page/close",
  "page/list",
  "page/activate",
  // Frame methods (Frame & Shadow DOM Support)
  "frame/list",
  "frame/switch",
  "frame/main",
  // Action methods
  "action/click",
  "action/dblclick",
  "action/type",
  "action/fill",
  "action/clear",
  "action/press",
  "action/hover",
  "action/scroll",
  "action/select",
  "action/check",
  "action/uncheck",
  "action/upload",
  "action/drag",
  // Observation methods
  "observe/screenshot",
  "observe/accessibility",
  "observe/dom",
  "observe/element",
  "observe/pdf",
  "observe/content",
  "observe/ariaSnapshot",
  // Storage methods
  "storage/getState",
  "storage/setState",
  "storage/getCookies",
  "storage/setCookies",
  "storage/clearCookies",
  // Network methods
  "network/intercept",
  "network/fulfill",
  "network/abort",
  "network/continue",
  // Emulation methods
  "emulate/setViewport",
  "emulate/setUserAgent",
  "emulate/setGeolocation",
  "emulate/setOffline",
  // Dialog methods
  "dialog/handle",
  // Trace methods
  "trace/start",
  "trace/stop",
  // Event subscription
  "events/subscribe",
  // Stream methods (Streaming Responses)
  "stream/cancel",
  // Approval methods (Human-in-the-Loop)
  "approval/respond",
  // Agent methods (composite actions, observations, and data extraction)
  "agent/act",
  "agent/observe",
  "agent/extract",
]);
export type BAPMethod = z.infer<typeof BAPMethodSchema>;
