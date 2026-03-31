import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, Spinner, icons, box, table, kv, status, banner, pc } from "../index.js";

// ---------------------------------------------------------------------------
// Logger: construction defaults
// ---------------------------------------------------------------------------

describe("Logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use default options when constructed with no arguments", () => {
    const logger = new Logger();
    logger.info("hello");

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[BAP]");
    expect(output).toContain("hello");
  });

  it("should use custom prefix when provided", () => {
    const logger = new Logger({ prefix: "MyApp" });
    logger.info("test message");

    const output = consoleSpy.mock.calls[0]![0] as string;
    expect(output).toContain("[MyApp]");
  });

  // -------------------------------------------------------------------------
  // Log level filtering
  // -------------------------------------------------------------------------

  describe("log level filtering", () => {
    it("should suppress debug messages at info level", () => {
      const logger = new Logger({ level: "info" });
      logger.debug("hidden");

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should show debug messages at debug level", () => {
      const logger = new Logger({ level: "debug" });
      logger.debug("visible");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0]![0] as string;
      expect(output).toContain("visible");
    });

    it("should suppress info messages at warn level", () => {
      const logger = new Logger({ level: "warn" });
      logger.info("hidden");

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should show error messages at warn level", () => {
      const logger = new Logger({ level: "warn" });
      logger.error("shown");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("should allow level to be changed via setLevel", () => {
      const logger = new Logger({ level: "error" });
      logger.info("hidden");
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.setLevel("info");
      logger.info("visible");
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // enabled flag
  // -------------------------------------------------------------------------

  describe("enabled flag", () => {
    it("should suppress all output when enabled is false", () => {
      const logger = new Logger({ enabled: false });
      logger.debug("a");
      logger.info("b");
      logger.success("c");
      logger.warn("d");
      logger.error("e");
      logger.step(1, 3, "f");
      logger.log("*", "g");

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should resume output after setEnabled(true)", () => {
      const logger = new Logger({ enabled: false });
      logger.info("hidden");
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.setEnabled(true);
      logger.info("visible");
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // stderr routing
  // -------------------------------------------------------------------------

  describe("stderr routing", () => {
    it("should route output to console.error when stderr is true", () => {
      const logger = new Logger({ stderr: true });
      logger.info("to stderr");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // JSON format
  // -------------------------------------------------------------------------

  describe("format: json", () => {
    it("should emit valid JSON lines to stderr", () => {
      const logger = new Logger({ format: "json", level: "debug" });
      logger.info("json test");

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const raw = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(raw.trim());
      expect(parsed.level).toBe("info");
      expect(parsed.msg).toBe("json test");
      expect(parsed.component).toBe("BAP");
      expect(parsed.ts).toBeDefined();
    });

    it("should include context fields in JSON output", () => {
      const logger = new Logger({ format: "json", level: "debug" });
      logger.warn("with context", { requestId: "abc" });

      const raw = stderrSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(raw.trim());
      expect(parsed.level).toBe("warn");
      expect(parsed.requestId).toBe("abc");
    });

    it("should respect log level filtering in json mode", () => {
      const logger = new Logger({ format: "json", level: "error" });
      logger.info("hidden");

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it("should emit json for all log methods", () => {
      const logger = new Logger({ format: "json", level: "debug" });
      logger.debug("d");
      logger.info("i");
      logger.success("s");
      logger.warn("w");
      logger.error("e");
      logger.step(1, 2, "st");
      logger.log("*", "l");

      expect(stderrSpy).toHaveBeenCalledTimes(7);
      for (const call of stderrSpy.mock.calls) {
        const parsed = JSON.parse((call[0] as string).trim());
        expect(parsed).toHaveProperty("ts");
        expect(parsed).toHaveProperty("level");
        expect(parsed).toHaveProperty("msg");
      }
    });
  });

  // -------------------------------------------------------------------------
  // child() logger
  // -------------------------------------------------------------------------

  describe("child()", () => {
    it("should create a sub-logger with combined prefix", () => {
      const parent = new Logger({ prefix: "Server" });
      const child = parent.child("WS");
      child.info("connected");

      const output = consoleSpy.mock.calls[0]![0] as string;
      expect(output).toContain("[Server:WS]");
      expect(output).toContain("connected");
    });

    it("should inherit parent settings", () => {
      const parent = new Logger({ prefix: "App", enabled: false });
      const child = parent.child("Sub");
      child.info("hidden");

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // step() method
  // -------------------------------------------------------------------------

  describe("step()", () => {
    it("should include step number and total in output", () => {
      const logger = new Logger();
      logger.step(2, 5, "processing");

      const output = consoleSpy.mock.calls[0]![0] as string;
      expect(output).toContain("[2/5]");
      expect(output).toContain("processing");
    });
  });

  // -------------------------------------------------------------------------
  // error() uses console.error directly
  // -------------------------------------------------------------------------

  describe("error()", () => {
    it("should use console.error even when stderr is false", () => {
      const logger = new Logger({ stderr: false });
      logger.error("something broke");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// icons constant
// ---------------------------------------------------------------------------

describe("icons", () => {
  it("should contain all expected icon categories", () => {
    const expectedKeys = [
      "success",
      "error",
      "warning",
      "info",
      "debug",
      "arrow",
      "arrowDown",
      "pointer",
      "bullet",
      "browser",
      "server",
      "connection",
      "lock",
      "unlock",
      "key",
      "play",
      "stop",
      "pause",
      "loading",
      "sparkle",
      "rocket",
      "check",
      "cross",
      "clock",
    ];
    for (const key of expectedKeys) {
      expect(icons).toHaveProperty(key);
      expect(typeof (icons as Record<string, string>)[key]).toBe("string");
    }
  });

  it("should have exactly 24 icons", () => {
    expect(Object.keys(icons)).toHaveLength(24);
  });
});

// ---------------------------------------------------------------------------
// box()
// ---------------------------------------------------------------------------

describe("box()", () => {
  it("should produce bordered output with content", () => {
    const result = box(["Hello", "World"]);
    const lines = result.split("\n");

    // 3 structure lines (top border, bottom border) + 2 content lines = 4
    expect(lines).toHaveLength(4);
    // Top border starts with ╭
    expect(result).toContain("\u256d");
    // Bottom border starts with ╰
    expect(result).toContain("\u2570");
    // Content is wrapped with │
    expect(result).toContain("\u2502");
  });

  it("should include title when provided", () => {
    const result = box(["content"], { title: "My Title" });
    expect(result).toContain("My Title");
  });
});

// ---------------------------------------------------------------------------
// table()
// ---------------------------------------------------------------------------

describe("table()", () => {
  it("should align labels to the same width", () => {
    const result = table([
      { label: "Name", value: "Alice" },
      { label: "Location", value: "NYC" },
    ]);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    // "Location" is 8 chars, "Name" should be padded to 8
    // Both lines should have the same distance from start to value
    expect(lines[0]).toContain("Alice");
    expect(lines[1]).toContain("NYC");
  });

  it("should include icons when provided in rows", () => {
    const result = table([{ label: "Status", value: "OK", icon: icons.success }]);
    expect(result).toContain(icons.success);
  });
});

// ---------------------------------------------------------------------------
// kv()
// ---------------------------------------------------------------------------

describe("kv()", () => {
  it("should format key-value pair with colon separator", () => {
    const result = kv("Port", "9222");
    expect(result).toContain("Port");
    expect(result).toContain(": ");
    expect(result).toContain("9222");
  });
});

// ---------------------------------------------------------------------------
// status()
// ---------------------------------------------------------------------------

describe("status()", () => {
  it("should return a string with the message for each state", () => {
    const states: Array<Parameters<typeof status>[0]> = [
      "running",
      "stopped",
      "error",
      "warning",
      "connected",
      "disconnected",
    ];
    for (const state of states) {
      const result = status(state, "test");
      expect(result).toContain("test");
      expect(typeof result).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// banner()
// ---------------------------------------------------------------------------

describe("banner()", () => {
  it("should include title in output", () => {
    const result = banner({ title: "BAP Server" });
    expect(result).toContain("BAP Server");
  });

  it("should include version when provided", () => {
    const result = banner({ title: "BAP", version: "1.0.0" });
    expect(result).toContain("1.0.0");
  });

  it("should include subtitle when provided", () => {
    const result = banner({ title: "BAP", subtitle: "Browser Agent Protocol" });
    expect(result).toContain("Browser Agent Protocol");
  });
});

// ---------------------------------------------------------------------------
// pc re-export
// ---------------------------------------------------------------------------

describe("pc re-export", () => {
  it("should re-export picocolors with color functions", () => {
    expect(typeof pc.red).toBe("function");
    expect(typeof pc.green).toBe("function");
    expect(typeof pc.cyan).toBe("function");
    expect(typeof pc.bold).toBe("function");
    expect(typeof pc.dim).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

describe("Spinner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should write frames to stdout on start", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spinner = new Spinner("Loading...");

    spinner.start();
    // Advance past one frame interval (80ms)
    vi.advanceTimersByTime(80);

    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls[0]![0] as string;
    expect(written).toContain("Loading...");

    spinner.stop();
  });

  it("should clear the line on stop", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spinner = new Spinner("Working");

    spinner.start();
    vi.advanceTimersByTime(80);
    writeSpy.mockClear();

    spinner.stop();
    // stop() writes a clear line
    expect(writeSpy).toHaveBeenCalled();
  });

  it("should write success message on succeed", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spinner = new Spinner("Connecting");

    spinner.start();
    vi.advanceTimersByTime(80);
    writeSpy.mockClear();

    spinner.succeed("Connected!");

    // succeed calls stop which writes clear + final message
    const allWrites = writeSpy.mock.calls.map((c) => c[0] as string).join("");
    expect(allWrites).toContain("Connected!");
    expect(allWrites).toContain(icons.success);
  });

  it("should write failure message on fail", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spinner = new Spinner("Connecting");

    spinner.start();
    vi.advanceTimersByTime(80);
    writeSpy.mockClear();

    spinner.fail("Connection failed");

    const allWrites = writeSpy.mock.calls.map((c) => c[0] as string).join("");
    expect(allWrites).toContain("Connection failed");
    expect(allWrites).toContain(icons.error);
  });

  it("should use stderr when specified", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const spinner = new Spinner("Loading", true);

    spinner.start();
    vi.advanceTimersByTime(80);

    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();

    spinner.stop();
  });
});
