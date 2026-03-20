/**
 * @fileoverview BAP Server error class
 * @module @browseragentprotocol/server-playwright/errors
 */

export class BAPServerError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
    public readonly details?: Record<string, unknown>,
    public readonly recoveryHint?: string
  ) {
    super(message);
    this.name = "BAPServerError";
  }
}
