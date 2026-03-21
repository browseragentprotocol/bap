/**
 * @fileoverview In-process transport that bypasses WebSocket
 * @module @browseragentprotocol/mcp/direct-transport
 *
 * Used with `--in-process` mode. Routes JSON-RPC messages directly
 * through BAPPlaywrightServer.createInProcessClient() without
 * serialization over the network.
 */

import type { BAPTransport } from "@browseragentprotocol/client";

/**
 * DirectTransport implements BAPTransport by calling a request handler
 * function directly instead of sending over WebSocket.
 *
 * Note: Server-push notifications (events) are not supported in this
 * transport — event streaming requires WebSocket. This is a known
 * limitation of --in-process mode.
 */
export class DirectTransport implements BAPTransport {
  private handler: ((message: string) => Promise<string>) | null;
  private closeHandler: (() => Promise<void>) | null;
  private closed = false;

  onMessage: ((message: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  constructor(handler: (message: string) => Promise<string>, closeHandler: () => Promise<void>) {
    this.handler = handler;
    this.closeHandler = closeHandler;
  }

  async send(message: string): Promise<void> {
    if (!this.handler) {
      throw new Error("DirectTransport is closed");
    }
    try {
      const response = await this.handler(message);
      if (this.onMessage) {
        this.onMessage(response);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.onError) {
        this.onError(err);
      } else {
        throw err;
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.closeHandler) {
      await this.closeHandler();
      this.closeHandler = null;
    }
    this.handler = null;
    if (this.onClose) {
      this.onClose();
    }
  }
}
