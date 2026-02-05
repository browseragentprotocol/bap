import { describe, it, expect } from "vitest";
import {
  BAPError,
  BAPConnectionError,
  BAPInternalError,
  BAPParseError,
  BAPInvalidRequestError,
  BAPMethodNotFoundError,
  BAPInvalidParamsError,
  BAPNotInitializedError,
  BAPAlreadyInitializedError,
  BAPBrowserNotLaunchedError,
  BAPPageNotFoundError,
  BAPElementNotFoundError,
  BAPElementNotVisibleError,
  BAPElementNotEnabledError,
  BAPSelectorAmbiguousError,
  BAPInterceptedRequestError,
  BAPNavigationError,
  BAPTimeoutError,
  BAPActionError,
  BAPTargetClosedError,
  BAPExecutionContextDestroyedError,
  BAPContextNotFoundError,
  BAPResourceLimitExceededError,
  BAPApprovalDeniedError,
  BAPApprovalTimeoutError,
  BAPApprovalRequiredError,
  BAPFrameNotFoundError,
  BAPDomainNotAllowedError,
  BAPStreamNotFoundError,
  BAPStreamCancelledError,
} from "../shared/errors.js";
import { ErrorCodes } from "../types/protocol.js";

describe("BAPError Base Class", () => {
  it("creates error with code and message (new signature)", () => {
    const error = new BAPError(ErrorCodes.InvalidParams, "Invalid parameters");
    expect(error.code).toBe(ErrorCodes.InvalidParams);
    expect(error.message).toBe("Invalid parameters");
    expect(error.name).toBe("BAPError");
    expect(error.retryable).toBe(false);
  });

  it("creates error with options", () => {
    const error = new BAPError(ErrorCodes.Timeout, "Request timeout", {
      retryable: true,
      retryAfterMs: 1000,
      details: { timeout: 30000 },
    });
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(1000);
    expect(error.details).toEqual({ timeout: 30000 });
  });

  it("supports legacy constructor signature", () => {
    const error = new BAPError("Legacy message", ErrorCodes.ServerError, true);
    expect(error.message).toBe("Legacy message");
    expect(error.code).toBe(ErrorCodes.ServerError);
    expect(error.retryable).toBe(true);
  });

  describe("fromResponse()", () => {
    it("creates error from JSON-RPC error response", () => {
      const rpcError = {
        code: ErrorCodes.ElementNotFound,
        message: "Element not found",
        data: {
          retryable: true,
          retryAfterMs: 500,
          details: { selector: ".missing" },
        },
      };
      const error = BAPError.fromResponse(rpcError);
      expect(error).toBeInstanceOf(BAPElementNotFoundError);
      expect(error.code).toBe(ErrorCodes.ElementNotFound);
    });

    it("handles missing data in response", () => {
      const rpcError = {
        code: ErrorCodes.ServerError,
        message: "Server error",
        data: undefined,
      };
      const error = BAPError.fromResponse(rpcError);
      expect(error.code).toBe(ErrorCodes.ServerError);
      expect(error.retryable).toBe(false);
    });
  });

  describe("toJSON()", () => {
    it("serializes error to JSON-RPC format", () => {
      const error = new BAPError(ErrorCodes.Timeout, "Timeout", {
        retryable: true,
        retryAfterMs: 1000,
        details: { duration: 30000 },
      });
      const json = error.toJSON();
      expect(json).toEqual({
        code: ErrorCodes.Timeout,
        message: "Timeout",
        data: {
          retryable: true,
          retryAfterMs: 1000,
          details: { duration: 30000 },
        },
      });
    });
  });
});

describe("Connection Errors", () => {
  it("BAPConnectionError is retryable by default", () => {
    const error = new BAPConnectionError("Connection failed");
    expect(error.code).toBe(ErrorCodes.ServerError);
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(1000);
  });
});

describe("Protocol Errors", () => {
  it("BAPParseError has correct code", () => {
    const error = new BAPParseError("Invalid JSON");
    expect(error.code).toBe(ErrorCodes.ParseError);
    expect(error.name).toBe("BAPParseError");
  });

  it("BAPInvalidRequestError has correct code", () => {
    const error = new BAPInvalidRequestError("Missing method");
    expect(error.code).toBe(ErrorCodes.InvalidRequest);
  });

  it("BAPMethodNotFoundError includes method name", () => {
    const error = new BAPMethodNotFoundError("unknown/method");
    expect(error.message).toContain("unknown/method");
    expect(error.code).toBe(ErrorCodes.MethodNotFound);
  });

  it("BAPInvalidParamsError has correct code", () => {
    const error = new BAPInvalidParamsError("Invalid params");
    expect(error.code).toBe(ErrorCodes.InvalidParams);
  });

  it("BAPInternalError is not retryable", () => {
    const error = new BAPInternalError("Internal server error");
    expect(error.code).toBe(ErrorCodes.InternalError);
    expect(error.retryable).toBe(false);
  });
});

describe("Server State Errors", () => {
  it("BAPNotInitializedError has fixed message", () => {
    const error = new BAPNotInitializedError();
    expect(error.message).toContain("not initialized");
    expect(error.code).toBe(ErrorCodes.NotInitialized);
  });

  it("BAPAlreadyInitializedError has fixed message", () => {
    const error = new BAPAlreadyInitializedError();
    expect(error.message).toContain("already initialized");
    expect(error.code).toBe(ErrorCodes.AlreadyInitialized);
  });
});

describe("Browser Errors", () => {
  it("BAPBrowserNotLaunchedError has fixed message", () => {
    const error = new BAPBrowserNotLaunchedError();
    expect(error.message).toContain("not launched");
    expect(error.code).toBe(ErrorCodes.BrowserNotLaunched);
  });

  it("BAPPageNotFoundError includes page ID in details", () => {
    const error = new BAPPageNotFoundError("page-123");
    expect(error.message).toContain("page-123");
    expect(error.details).toEqual({ pageId: "page-123" });
  });
});

describe("Element Errors", () => {
  it("BAPElementNotFoundError is retryable", () => {
    const error = new BAPElementNotFoundError({ type: "css", value: ".btn" });
    expect(error.code).toBe(ErrorCodes.ElementNotFound);
    expect(error.retryable).toBe(true);
    expect(error.details?.selector).toEqual({ type: "css", value: ".btn" });
  });

  it("BAPElementNotVisibleError is retryable", () => {
    const error = new BAPElementNotVisibleError({ type: "role", role: "button" });
    expect(error.code).toBe(ErrorCodes.ElementNotVisible);
    expect(error.retryable).toBe(true);
  });

  it("BAPElementNotEnabledError is retryable", () => {
    const error = new BAPElementNotEnabledError({ type: "text", value: "Submit" });
    expect(error.code).toBe(ErrorCodes.ElementNotEnabled);
    expect(error.retryable).toBe(true);
  });

  it("BAPSelectorAmbiguousError includes count", () => {
    const error = new BAPSelectorAmbiguousError({ type: "css", value: ".btn" }, 5);
    expect(error.message).toContain("5 elements");
    expect(error.details?.count).toBe(5);
  });

  it("BAPInterceptedRequestError includes requestId and url", () => {
    const error = new BAPInterceptedRequestError("req-123", "https://example.com");
    expect(error.code).toBe(ErrorCodes.InterceptedRequest);
    expect(error.details).toEqual({ requestId: "req-123", url: "https://example.com" });
  });
});

describe("Navigation Errors", () => {
  it("BAPNavigationError includes URL and status", () => {
    const error = new BAPNavigationError("Navigation failed", {
      url: "https://example.com",
      status: 404,
    });
    expect(error.code).toBe(ErrorCodes.NavigationFailed);
    expect(error.details?.url).toBe("https://example.com");
    expect(error.details?.status).toBe(404);
  });
});

describe("Timeout Errors", () => {
  it("BAPTimeoutError is retryable", () => {
    const error = new BAPTimeoutError("Request timeout", { timeout: 30000 });
    expect(error.code).toBe(ErrorCodes.Timeout);
    expect(error.retryable).toBe(true);
    expect(error.details?.timeout).toBe(30000);
  });
});

describe("Action Errors", () => {
  it("BAPActionError includes action name", () => {
    const error = new BAPActionError("click", "Element is obscured");
    expect(error.message).toContain("click");
    expect(error.message).toContain("obscured");
    expect(error.code).toBe(ErrorCodes.ActionFailed);
  });
});

describe("Target Errors", () => {
  it("BAPTargetClosedError is not retryable", () => {
    const error = new BAPTargetClosedError("page");
    expect(error.message).toContain("page");
    expect(error.code).toBe(ErrorCodes.TargetClosed);
    expect(error.retryable).toBe(false);
  });

  it("BAPExecutionContextDestroyedError is retryable", () => {
    const error = new BAPExecutionContextDestroyedError();
    expect(error.code).toBe(ErrorCodes.ExecutionContextDestroyed);
    expect(error.retryable).toBe(true);
  });
});

describe("Context Errors", () => {
  it("BAPContextNotFoundError includes context ID", () => {
    const error = new BAPContextNotFoundError("ctx-123");
    expect(error.message).toContain("ctx-123");
    expect(error.details?.contextId).toBe("ctx-123");
  });

  it("BAPResourceLimitExceededError includes limit info", () => {
    const error = new BAPResourceLimitExceededError("contexts", 10, 11);
    expect(error.message).toContain("contexts");
    expect(error.details).toEqual({ resource: "contexts", limit: 10, current: 11 });
  });
});

describe("Approval Errors", () => {
  it("BAPApprovalDeniedError includes reason and rule", () => {
    const error = new BAPApprovalDeniedError("User declined", "sensitive-action");
    expect(error.message).toContain("User declined");
    expect(error.details?.rule).toBe("sensitive-action");
  });

  it("BAPApprovalTimeoutError is retryable", () => {
    const error = new BAPApprovalTimeoutError(60000);
    expect(error.message).toContain("60000ms");
    expect(error.retryable).toBe(true);
  });

  it("BAPApprovalRequiredError includes request info", () => {
    const error = new BAPApprovalRequiredError("req-123", "password-fill");
    expect(error.details?.requestId).toBe("req-123");
    expect(error.details?.rule).toBe("password-fill");
  });
});

describe("Frame Errors", () => {
  it("BAPFrameNotFoundError includes identifier", () => {
    const error = new BAPFrameNotFoundError("frame-abc");
    expect(error.message).toContain("frame-abc");
  });

  it("BAPDomainNotAllowedError includes domain", () => {
    const error = new BAPDomainNotAllowedError("evil.com");
    expect(error.message).toContain("evil.com");
    expect(error.details?.domain).toBe("evil.com");
  });
});

describe("Stream Errors", () => {
  it("BAPStreamNotFoundError includes stream ID", () => {
    const error = new BAPStreamNotFoundError("stream-123");
    expect(error.message).toContain("stream-123");
    expect(error.details?.streamId).toBe("stream-123");
  });

  it("BAPStreamCancelledError includes stream ID", () => {
    const error = new BAPStreamCancelledError("stream-456");
    expect(error.message).toContain("cancelled");
    expect(error.details?.streamId).toBe("stream-456");
  });
});

describe("Error Inheritance", () => {
  it("all errors extend BAPError", () => {
    const errors = [
      new BAPConnectionError("test"),
      new BAPParseError("test"),
      new BAPTimeoutError("test"),
      new BAPElementNotFoundError(null),
      new BAPNavigationError("test"),
    ];

    errors.forEach((error) => {
      expect(error).toBeInstanceOf(BAPError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  it("all errors have proper stack traces", () => {
    const error = new BAPTimeoutError("test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("BAPTimeoutError");
  });
});
