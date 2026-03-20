/**
 * Integration test helper: starts a real BAPPlaywrightServer and provides
 * a WebSocket JSON-RPC client for end-to-end request/response testing.
 */

import { WebSocket } from "ws";
import { BAPPlaywrightServer } from "../../server.js";
import type { JSONRPCResponse } from "@browseragentprotocol/protocol";

let nextId = 1;

export interface TestClient {
  /** Send a JSON-RPC request and wait for the response */
  request: (method: string, params?: Record<string, unknown>) => Promise<JSONRPCResponse>;
  /** Close the WebSocket connection */
  close: () => void;
  /** The underlying WebSocket (for advanced assertions) */
  ws: WebSocket;
}

export interface TestHarness {
  /** The running server instance */
  server: BAPPlaywrightServer;
  /** The port the server is listening on */
  port: number;
  /** Create a new WebSocket test client connected to the server */
  createClient: () => Promise<TestClient>;
  /** Shut down the server and all clients */
  teardown: () => Promise<void>;
}

/**
 * Start a BAPPlaywrightServer on a random available port and return a test harness.
 */
export async function createTestHarness(): Promise<TestHarness> {
  // Use port 0 to let the OS assign a free port, but the server needs
  // a specific port. Find one by briefly binding.
  const port = await findFreePort();

  const server = new BAPPlaywrightServer({
    port,
    host: "127.0.0.1",
    debug: false,
    headless: true,
  });

  await server.start();

  const clients: TestClient[] = [];

  return {
    server,
    port,
    createClient: async () => {
      const client = await connectClient(port);
      clients.push(client);
      return client;
    },
    teardown: async () => {
      for (const client of clients) {
        client.close();
      }
      await server.stop();
    },
  };
}

async function connectClient(port: number): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    const pending = new Map<
      number | string,
      { resolve: (r: JSONRPCResponse) => void; reject: (e: Error) => void }
    >();

    ws.on("open", () => {
      resolve({
        request: (method, params) => {
          return new Promise((res, rej) => {
            const id = nextId++;
            pending.set(id, { resolve: res, reject: rej });

            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id,
                method,
                params: params ?? {},
              })
            );

            // Timeout after 10s — clear on response to avoid timer leak
            const timer = setTimeout(() => {
              if (pending.has(id)) {
                pending.delete(id);
                rej(new Error(`Request ${method} timed out`));
              }
            }, 10000);

            // Store timer handle alongside the pending entry for cleanup
            const original = pending.get(id)!;
            pending.set(id, {
              resolve: (r) => {
                clearTimeout(timer);
                original.resolve(r);
              },
              reject: (e) => {
                clearTimeout(timer);
                original.reject(e);
              },
            });
          });
        },
        close: () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        },
        ws,
      });
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id !== undefined && pending.has(msg.id)) {
          const handler = pending.get(msg.id)!;
          pending.delete(msg.id);
          handler.resolve(msg);
        }
      } catch {
        // Ignore parse errors on notifications
      }
    });

    ws.on("error", (err) => {
      reject(err);
    });

    ws.on("close", () => {
      // Reject all pending requests if server closes unexpectedly
      for (const [id, handler] of pending) {
        pending.delete(id);
        handler.reject(new Error("WebSocket closed before response"));
      }
    });
  });
}

async function findFreePort(): Promise<number> {
  const { createServer } = await import("net");
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not determine port"));
      }
    });
    srv.on("error", reject);
  });
}
