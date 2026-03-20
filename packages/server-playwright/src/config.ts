/**
 * @fileoverview BAP Server configuration types, defaults, and security constants
 * @module @browseragentprotocol/server-playwright/config
 */

import { type BAPScope, ScopeProfiles } from "@browseragentprotocol/protocol";

// =============================================================================
// Configuration Interfaces
// =============================================================================

export interface BAPSecurityOptions {
  blockedProtocols?: string[];
  blockedHosts?: string[];
  allowedProtocols?: string[];
  allowedHosts?: string[];
  redactSensitiveContent?: boolean;
  blockPasswordValueExtraction?: boolean;
  redactPasswordsInScreenshots?: boolean;
  blockStorageStateExtraction?: boolean;
}

export interface BAPLimitsOptions {
  maxPagesPerClient?: number;
  maxRequestsPerSecond?: number;
  maxScreenshotsPerMinute?: number;
}

export interface BAPAuthorizationOptions {
  defaultScopes?: BAPScope[];
  scopesEnvVar?: string;
}

export interface BAPSessionOptions {
  maxDuration?: number;
  idleTimeout?: number;
  dormantSessionTtl?: number;
}

export interface BAPTLSOptions {
  requireTLS?: boolean;
  warnInsecure?: boolean;
}

export interface BAPServerOptions {
  port?: number;
  host?: string;
  defaultBrowser?: "chromium" | "firefox" | "webkit";
  defaultChannel?: string;
  headless?: boolean;
  debug?: boolean;
  timeout?: number;
  authToken?: string;
  authTokenEnvVar?: string;
  security?: BAPSecurityOptions;
  limits?: BAPLimitsOptions;
  authorization?: BAPAuthorizationOptions;
  session?: BAPSessionOptions;
  tls?: BAPTLSOptions;
}

// =============================================================================
// Resolved Options Type (all fields required after merging with defaults)
// =============================================================================

/** Security options after merging with defaults. allowedProtocols/allowedHosts stay optional. */
export type ResolvedSecurityOptions = Required<
  Omit<BAPSecurityOptions, "allowedProtocols" | "allowedHosts">
> & {
  allowedProtocols: string[] | undefined;
  allowedHosts: string[] | undefined;
};

export type ResolvedOptions = Required<
  Omit<
    BAPServerOptions,
    | "authToken"
    | "authTokenEnvVar"
    | "defaultChannel"
    | "security"
    | "limits"
    | "authorization"
    | "session"
    | "tls"
  >
> & {
  authToken: string | undefined;
  authTokenEnvVar: string;
  defaultChannel: string | undefined;
  security: ResolvedSecurityOptions;
  limits: Required<BAPLimitsOptions>;
  authorization: Required<BAPAuthorizationOptions>;
  session: Required<BAPSessionOptions>;
  tls: Required<BAPTLSOptions>;
};

// =============================================================================
// Security Constants
// =============================================================================

export const DEFAULT_BLOCKED_PROTOCOLS = ["file", "javascript", "data", "vbscript"];

export const DEFAULT_BLOCKED_HOSTS = [
  "169.254.169.254", // AWS EC2 metadata
  "metadata.google.internal", // GCP metadata
  "metadata.goog", // GCP metadata alternative
  "100.100.100.200", // Alibaba Cloud metadata
  "fd00:ec2::254", // AWS EC2 IPv6 metadata
];

export const ALLOWED_BROWSER_ARGS: (string | RegExp)[] = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-software-rasterizer",
  /^--window-size=\d+,\d+$/,
  /^--window-position=\d+,\d+$/,
  "--start-maximized",
  "--start-fullscreen",
  "--kiosk",
  "--incognito",
  /^--proxy-server=.+$/,
  /^--lang=[a-z]{2}(-[A-Z]{2})?$/,
];

export const BLOCKED_BROWSER_ARGS = [
  "--disable-web-security",
  "--disable-site-isolation-trials",
  "--remote-debugging-port",
  "--remote-debugging-address",
  "--user-data-dir",
  "--load-extension",
  "--disable-extensions-except",
  "--allow-running-insecure-content",
  "--reduce-security-for-testing",
];

// =============================================================================
// Default Options
// =============================================================================

export const DEFAULT_OPTIONS: ResolvedOptions = {
  port: 9222,
  host: "localhost",
  defaultBrowser: "chromium",
  defaultChannel: undefined,
  headless: true,
  debug: false,
  timeout: 30000,
  authToken: undefined,
  authTokenEnvVar: "BAP_AUTH_TOKEN",
  security: {
    blockedProtocols: DEFAULT_BLOCKED_PROTOCOLS,
    blockedHosts: DEFAULT_BLOCKED_HOSTS,
    allowedProtocols: undefined,
    allowedHosts: undefined,
    redactSensitiveContent: true,
    blockPasswordValueExtraction: true,
    redactPasswordsInScreenshots: false,
    blockStorageStateExtraction: false,
  },
  limits: {
    maxPagesPerClient: 10,
    maxRequestsPerSecond: 50,
    maxScreenshotsPerMinute: 30,
  },
  authorization: {
    defaultScopes: ScopeProfiles.standard,
    scopesEnvVar: "BAP_SCOPES",
  },
  session: {
    maxDuration: 3600,
    idleTimeout: 600,
    dormantSessionTtl: 300,
  },
  tls: {
    requireTLS: process.env.NODE_ENV === "production",
    warnInsecure: true,
  },
};

/**
 * Merge user options with defaults, deep-merging sub-option objects.
 */
export function resolveOptions(options: BAPServerOptions): ResolvedOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    security: { ...DEFAULT_OPTIONS.security, ...options.security },
    limits: { ...DEFAULT_OPTIONS.limits, ...options.limits },
    authorization: { ...DEFAULT_OPTIONS.authorization, ...options.authorization },
    session: { ...DEFAULT_OPTIONS.session, ...options.session },
    tls: { ...DEFAULT_OPTIONS.tls, ...options.tls },
  };
}
