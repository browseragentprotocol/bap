/**
 * @fileoverview BAP Authorization Model
 * @module bap-protocol/authorization
 * @version 0.2.0
 *
 * Scope-based authorization for fine-grained access control.
 * This module defines the permission model for BAP operations.
 */

// =============================================================================
// Authorization Scopes
// =============================================================================

/**
 * BAP authorization scopes define what operations a client can perform.
 * Scopes follow a hierarchical naming convention: category:action
 *
 * @example
 * // Read-only agent (can observe but not interact)
 * const readOnlyScopes: BAPScope[] = ['observe:*', 'page:read'];
 *
 * // Full automation agent
 * const fullScopes: BAPScope[] = ['*'];
 *
 * // Restricted agent (navigate only to specific domains)
 * const restrictedScopes: BAPScope[] = ['browser:launch', 'page:navigate', 'observe:*', 'action:click', 'action:type'];
 */
export type BAPScope =
  // Wildcard - full access
  | '*'

  // Browser scopes
  | 'browser:*'
  | 'browser:launch'
  | 'browser:close'

  // Page scopes
  | 'page:*'
  | 'page:read'        // list, activate (non-destructive)
  | 'page:create'
  | 'page:navigate'
  | 'page:close'

  // Action scopes
  | 'action:*'
  | 'action:click'
  | 'action:type'
  | 'action:fill'
  | 'action:scroll'
  | 'action:select'
  | 'action:upload'    // Higher risk - file access
  | 'action:drag'

  // Observation scopes
  | 'observe:*'
  | 'observe:screenshot'
  | 'observe:accessibility'
  | 'observe:dom'
  | 'observe:element'
  | 'observe:content'
  | 'observe:pdf'

  // Storage scopes (sensitive)
  | 'storage:*'
  | 'storage:read'     // Get cookies, storage state
  | 'storage:write'    // Set cookies, storage state

  // Network scopes (high privilege)
  | 'network:*'
  | 'network:intercept'

  // Emulation scopes
  | 'emulate:*'
  | 'emulate:viewport'
  | 'emulate:geolocation'
  | 'emulate:offline'

  // Tracing scopes
  | 'trace:*'
  | 'trace:start'
  | 'trace:stop';

/**
 * Predefined scope profiles for common use cases
 */
export const ScopeProfiles = {
  /**
   * Read-only access - can observe but not interact
   * Suitable for: monitoring, accessibility auditing, content extraction
   */
  readonly: [
    'page:read',
    'observe:*',
  ] as BAPScope[],

  /**
   * Standard automation - can navigate and interact
   * Suitable for: most AI agent use cases
   */
  standard: [
    'browser:launch',
    'browser:close',
    'page:*',
    'action:click',
    'action:type',
    'action:fill',
    'action:scroll',
    'action:select',
    'observe:*',
    'emulate:viewport',
  ] as BAPScope[],

  /**
   * Full automation - includes sensitive operations
   * Suitable for: trusted internal agents
   */
  full: [
    'browser:*',
    'page:*',
    'action:*',
    'observe:*',
    'emulate:*',
    'trace:*',
  ] as BAPScope[],

  /**
   * Privileged - includes storage and network
   * Suitable for: admin automation, testing frameworks
   * WARNING: Can access credentials and intercept network
   */
  privileged: ['*'] as BAPScope[],
} as const;

// =============================================================================
// Scope Checking
// =============================================================================

/**
 * Map of BAP methods to required scopes
 */
export const MethodScopes: Record<string, BAPScope[]> = {
  // Lifecycle (always allowed after auth)
  'initialize': [],
  'shutdown': [],
  'notifications/initialized': [],

  // Browser
  'browser/launch': ['browser:launch', 'browser:*', '*'],
  'browser/close': ['browser:close', 'browser:*', '*'],

  // Page
  'page/create': ['page:create', 'page:*', '*'],
  'page/navigate': ['page:navigate', 'page:*', '*'],
  'page/reload': ['page:navigate', 'page:*', '*'],
  'page/goBack': ['page:navigate', 'page:*', '*'],
  'page/goForward': ['page:navigate', 'page:*', '*'],
  'page/close': ['page:close', 'page:*', '*'],
  'page/list': ['page:read', 'page:*', '*'],
  'page/activate': ['page:read', 'page:*', '*'],

  // Actions
  'action/click': ['action:click', 'action:*', '*'],
  'action/dblclick': ['action:click', 'action:*', '*'],
  'action/type': ['action:type', 'action:*', '*'],
  'action/fill': ['action:fill', 'action:*', '*'],
  'action/clear': ['action:fill', 'action:*', '*'],
  'action/press': ['action:type', 'action:*', '*'],
  'action/hover': ['action:click', 'action:*', '*'],
  'action/scroll': ['action:scroll', 'action:*', '*'],
  'action/select': ['action:select', 'action:*', '*'],
  'action/check': ['action:click', 'action:*', '*'],
  'action/uncheck': ['action:click', 'action:*', '*'],
  'action/upload': ['action:upload', 'action:*', '*'],
  'action/drag': ['action:drag', 'action:*', '*'],

  // Observations
  'observe/screenshot': ['observe:screenshot', 'observe:*', '*'],
  'observe/accessibility': ['observe:accessibility', 'observe:*', '*'],
  'observe/dom': ['observe:dom', 'observe:*', '*'],
  'observe/element': ['observe:element', 'observe:*', '*'],
  'observe/pdf': ['observe:pdf', 'observe:*', '*'],
  'observe/content': ['observe:content', 'observe:*', '*'],
  'observe/ariaSnapshot': ['observe:accessibility', 'observe:*', '*'],

  // Storage (sensitive)
  'storage/getState': ['storage:read', 'storage:*', '*'],
  'storage/setState': ['storage:write', 'storage:*', '*'],
  'storage/getCookies': ['storage:read', 'storage:*', '*'],
  'storage/setCookies': ['storage:write', 'storage:*', '*'],
  'storage/clearCookies': ['storage:write', 'storage:*', '*'],

  // Network (high privilege)
  'network/intercept': ['network:intercept', 'network:*', '*'],
  'network/fulfill': ['network:intercept', 'network:*', '*'],
  'network/abort': ['network:intercept', 'network:*', '*'],
  'network/continue': ['network:intercept', 'network:*', '*'],

  // Emulation
  'emulate/setViewport': ['emulate:viewport', 'emulate:*', '*'],
  'emulate/setUserAgent': ['emulate:viewport', 'emulate:*', '*'],
  'emulate/setGeolocation': ['emulate:geolocation', 'emulate:*', '*'],
  'emulate/setOffline': ['emulate:offline', 'emulate:*', '*'],

  // Dialog
  'dialog/handle': ['action:click', 'action:*', '*'],

  // Tracing
  'trace/start': ['trace:start', 'trace:*', '*'],
  'trace/stop': ['trace:stop', 'trace:*', '*'],

  // Events
  'events/subscribe': ['observe:*', '*'],
};

/**
 * Check if a set of granted scopes allows a specific method
 *
 * @param grantedScopes - Scopes the client has been granted
 * @param method - The BAP method being called
 * @returns true if the method is allowed
 *
 * @example
 * const clientScopes: BAPScope[] = ['observe:*', 'page:read'];
 * hasScope(clientScopes, 'observe/screenshot'); // true
 * hasScope(clientScopes, 'action/click'); // false
 */
export function hasScope(grantedScopes: BAPScope[], method: string): boolean {
  // Wildcard grants everything
  if (grantedScopes.includes('*')) {
    return true;
  }

  const requiredScopes = MethodScopes[method];

  // Unknown methods require wildcard
  if (!requiredScopes) {
    return grantedScopes.includes('*');
  }

  // Empty required scopes = always allowed (lifecycle methods)
  if (requiredScopes.length === 0) {
    return true;
  }

  // Check if client has any of the required scopes
  return requiredScopes.some(required => {
    // Direct match
    if (grantedScopes.includes(required)) {
      return true;
    }

    // Check category wildcards (e.g., 'action:*' covers 'action:click')
    const [category] = required.split(':');
    const categoryWildcard = `${category}:*` as BAPScope;
    if (grantedScopes.includes(categoryWildcard)) {
      return true;
    }

    return false;
  });
}

/**
 * Parse scopes from a token or configuration
 * Supports comma-separated strings or arrays
 *
 * @example
 * parseScopes('observe:*,page:read'); // ['observe:*', 'page:read']
 * parseScopes(['observe:*', 'page:read']); // ['observe:*', 'page:read']
 */
export function parseScopes(input: string | string[] | undefined): BAPScope[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.filter(isValidScope) as BAPScope[];
  }

  return input
    .split(',')
    .map(s => s.trim())
    .filter(isValidScope) as BAPScope[];
}

/**
 * Validate that a string is a valid BAP scope
 */
export function isValidScope(scope: string): scope is BAPScope {
  // Check against known scopes
  const validScopes = new Set<string>([
    '*',
    'browser:*', 'browser:launch', 'browser:close',
    'page:*', 'page:read', 'page:create', 'page:navigate', 'page:close',
    'action:*', 'action:click', 'action:type', 'action:fill', 'action:scroll',
    'action:select', 'action:upload', 'action:drag',
    'observe:*', 'observe:screenshot', 'observe:accessibility', 'observe:dom',
    'observe:element', 'observe:content', 'observe:pdf',
    'storage:*', 'storage:read', 'storage:write',
    'network:*', 'network:intercept',
    'emulate:*', 'emulate:viewport', 'emulate:geolocation', 'emulate:offline',
    'trace:*', 'trace:start', 'trace:stop',
  ]);

  return validScopes.has(scope);
}

// =============================================================================
// Authorization Error
// =============================================================================

/**
 * Authorization error code
 */
export const AuthorizationErrorCode = -32023;

/**
 * Create an authorization error response
 */
export function createAuthorizationError(method: string, requiredScopes: BAPScope[]) {
  return {
    code: AuthorizationErrorCode,
    message: `Insufficient permissions for '${method}'. Required scopes: ${requiredScopes.join(' or ')}`,
    data: {
      retryable: false,
      details: {
        method,
        requiredScopes,
      },
    },
  };
}

// =============================================================================
// Token Claims (for JWT-style tokens)
// =============================================================================

/**
 * BAP token claims structure (for JWT or similar tokens)
 */
export interface BAPTokenClaims {
  /** Subject (client identifier) */
  sub?: string;
  /** Issuer */
  iss?: string;
  /** Audience (server identifier) */
  aud?: string;
  /** Expiration time (Unix timestamp) */
  exp?: number;
  /** Issued at (Unix timestamp) */
  iat?: number;
  /** Not before (Unix timestamp) */
  nbf?: number;
  /** Granted scopes */
  scopes: BAPScope[];
  /** Allowed navigation hosts (optional domain restriction) */
  allowedHosts?: string[];
  /** Maximum session duration in seconds */
  maxSessionDuration?: number;
}

/**
 * Validate token claims
 * @returns Error message if invalid, undefined if valid
 */
export function validateTokenClaims(claims: BAPTokenClaims): string | undefined {
  const now = Math.floor(Date.now() / 1000);

  if (claims.exp && claims.exp < now) {
    return 'Token has expired';
  }

  if (claims.nbf && claims.nbf > now) {
    return 'Token is not yet valid';
  }

  if (!claims.scopes || claims.scopes.length === 0) {
    return 'Token has no scopes';
  }

  const invalidScopes = claims.scopes.filter(s => !isValidScope(s));
  if (invalidScopes.length > 0) {
    return `Invalid scopes: ${invalidScopes.join(', ')}`;
  }

  return undefined;
}
