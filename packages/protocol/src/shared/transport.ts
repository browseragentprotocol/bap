/**
 * @fileoverview BAP transport interface
 * @module @browseragentprotocol/core/shared/transport
 */

/**
 * Transport interface for BAP communication.
 *
 * Implementations handle the actual wire protocol (WebSocket, etc.)
 * while the session layer handles JSON-RPC message serialization.
 *
 * @example
 * class WebSocketTransport implements Transport {
 *   async connect(): Promise<void> { ... }
 *   async send(message: string): Promise<void> { ... }
 *   async receive(): Promise<string> { ... }
 *   async close(): Promise<void> { ... }
 *   isConnected(): boolean { ... }
 * }
 */
export interface Transport {
  /**
   * Connect to the remote endpoint.
   * Must be called before send/receive.
   */
  connect(): Promise<void>;

  /**
   * Send a message to the remote endpoint.
   * @param message - The serialized JSON-RPC message
   */
  send(message: string): Promise<void>;

  /**
   * Receive a message from the remote endpoint.
   * Blocks until a message is available.
   * @returns The received JSON-RPC message as a string
   */
  receive(): Promise<string>;

  /**
   * Close the connection.
   * Should clean up any resources.
   */
  close(): Promise<void>;

  /**
   * Check if the transport is currently connected.
   */
  isConnected(): boolean;

  /**
   * Optional: Callback when the connection is closed unexpectedly.
   */
  onClose?: () => void;

  /**
   * Optional: Callback when an error occurs.
   */
  onError?: (error: Error) => void;
}

/**
 * Options for transport configuration
 */
export interface TransportOptions {
  /** Connection timeout in milliseconds */
  connectTimeout?: number;
  /** Send timeout in milliseconds */
  sendTimeout?: number;
  /** Receive timeout in milliseconds */
  receiveTimeout?: number;
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds */
  reconnectDelay?: number;
}

/**
 * Default transport options
 */
export const DEFAULT_TRANSPORT_OPTIONS: Required<TransportOptions> = {
  connectTimeout: 30000,
  sendTimeout: 30000,
  receiveTimeout: 30000,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
};
