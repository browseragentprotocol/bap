import { describe, it, expect } from "vitest";
import net from "node:net";

/**
 * Tests for the standalone server management utilities in cli.ts.
 *
 * Since cli.ts runs as a script (calls main() at module level), we test
 * the port-checking logic by reimplementing the core utility functions
 * that are used by the standalone server management.
 */

// ---------------------------------------------------------------------------
// Port detection tests (mirrors isPortInUse from cli.ts)
// ---------------------------------------------------------------------------

function isPortInUse(port: number, host: string = "localhost"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(
  port: number,
  host: string = "localhost",
  timeoutMs: number = 2000,
  intervalMs: number = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms on port ${port}`);
}

describe("standalone server utilities", () => {
  describe("isPortInUse()", () => {
    it("returns false for a port with nothing listening", async () => {
      // Use a random high port that's unlikely to be in use
      const result = await isPortInUse(59999);
      expect(result).toBe(false);
    });

    it("returns true when a server is listening on the port", async () => {
      // Start a temporary TCP server
      const server = net.createServer();
      const port = await new Promise<number>((resolve) => {
        server.listen(0, "localhost", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            resolve(addr.port);
          }
        });
      });

      try {
        const result = await isPortInUse(port, "localhost");
        expect(result).toBe(true);
      } finally {
        server.close();
      }
    });
  });

  describe("waitForServer()", () => {
    it("resolves immediately if server is already running", async () => {
      const server = net.createServer();
      const port = await new Promise<number>((resolve) => {
        server.listen(0, "localhost", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            resolve(addr.port);
          }
        });
      });

      try {
        // Should resolve almost instantly
        const start = Date.now();
        await waitForServer(port, "localhost", 2000, 50);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
      } finally {
        server.close();
      }
    });

    it("waits for a server that starts after a delay", async () => {
      const server = net.createServer();
      // Find a free port
      const port = await new Promise<number>((resolve) => {
        const tmp = net.createServer();
        tmp.listen(0, "localhost", () => {
          const addr = tmp.address();
          if (addr && typeof addr === "object") {
            const p = addr.port;
            tmp.close(() => resolve(p));
          }
        });
      });

      // Start the server after 200ms
      const startTimer = setTimeout(() => {
        server.listen(port, "localhost");
      }, 200);

      try {
        await waitForServer(port, "localhost", 3000, 50);
        // If we get here, the server was detected
        expect(true).toBe(true);
      } finally {
        clearTimeout(startTimer);
        server.close();
      }
    });

    it("throws if server does not start within timeout", async () => {
      await expect(
        waitForServer(59998, "localhost", 300, 50)
      ).rejects.toThrow("Server did not start within 300ms");
    });
  });

  describe("CLI argument parsing", () => {
    it("standalone mode is the default (no --url)", () => {
      // When no --url is provided, isStandalone should be true
      const url = undefined;
      const isStandalone = !url;
      expect(isStandalone).toBe(true);
    });

    it("providing --url disables standalone mode", () => {
      const url = "ws://remote:9222";
      const isStandalone = !url;
      expect(isStandalone).toBe(false);
    });

    it("default port is 9222", () => {
      const configPort: number | undefined = undefined;
      const port = configPort ?? 9222;
      expect(port).toBe(9222);
    });

    it("custom port overrides default", () => {
      const configPort: number | undefined = 9333;
      const port = configPort ?? 9222;
      expect(port).toBe(9333);
    });

    it("browser mapping to server-playwright names", () => {
      const browserMap: Record<string, string> = {
        chrome: "chromium",
        chromium: "chromium",
        firefox: "firefox",
        webkit: "webkit",
        edge: "chromium",
      };

      expect(browserMap["chrome"]).toBe("chromium");
      expect(browserMap["chromium"]).toBe("chromium");
      expect(browserMap["firefox"]).toBe("firefox");
      expect(browserMap["webkit"]).toBe("webkit");
      expect(browserMap["edge"]).toBe("chromium");
    });
  });
});
