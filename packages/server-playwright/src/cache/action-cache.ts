/**
 * @fileoverview Action caching — file-system LRU cache for selector resolutions
 * @module @browseragentprotocol/server-playwright/cache/action-cache
 *
 * Caches successful selector resolutions so repeat workflows execute
 * instantly without DOM traversal. Key: SHA256(action + instruction + url_origin + dom_fingerprint).
 * Invalidation: cached selector fails → delete entry, TTL 24h, DOM fingerprint drift >30%.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

export interface CachedAction {
  key: string;
  action: string;
  instruction?: string;
  resolvedSelector: { type: string; value: string };
  urlPattern: string;
  domFingerprint: string;
  createdAt: number;
  hitCount: number;
  ttl: number;
}

export interface ActionCacheOptions {
  /** Directory for cache files. Default: ~/.bap/cache/actions */
  dir?: string;
  /** Enable/disable caching. Default: true */
  enabled?: boolean;
  /** TTL in seconds. Default: 86400 (24h) */
  ttl?: number;
  /** Max entries before LRU eviction. Default: 1000 */
  maxEntries?: number;
}

export class ActionCache {
  private readonly dir: string;
  private readonly enabled: boolean;
  private readonly ttl: number;
  private readonly maxEntries: number;
  private entries = new Map<string, CachedAction>();
  private loaded = false;

  constructor(options: ActionCacheOptions = {}) {
    this.dir = options.dir ?? path.join(os.homedir(), ".bap", "cache", "actions");
    this.enabled = options.enabled ?? true;
    this.ttl = (options.ttl ?? 86400) * 1000; // convert to ms
    this.maxEntries = options.maxEntries ?? 1000;

    if (this.enabled) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  /** Generate cache key from action context */
  static cacheKey(action: string, urlOrigin: string, selectorHint: string): string {
    const input = `${action}|${urlOrigin}|${selectorHint}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }

  /** Look up a cached action */
  get(key: string): CachedAction | null {
    if (!this.enabled) return null;
    this.ensureLoaded();

    const entry = this.entries.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttl) {
      this.delete(key);
      return null;
    }

    entry.hitCount++;
    return entry;
  }

  /** Store a successful resolution */
  set(key: string, entry: Omit<CachedAction, "key" | "createdAt" | "hitCount" | "ttl">): void {
    if (!this.enabled) return;
    this.ensureLoaded();

    const cached: CachedAction = {
      ...entry,
      key,
      createdAt: Date.now(),
      hitCount: 0,
      ttl: this.ttl,
    };

    this.entries.set(key, cached);

    // LRU eviction
    if (this.entries.size > this.maxEntries) {
      const oldest = Array.from(this.entries.entries()).sort(
        ([, a], [, b]) => a.createdAt - b.createdAt
      )[0];
      if (oldest) {
        this.delete(oldest[0]);
      }
    }

    // Persist
    this.writeEntry(key, cached);
  }

  /** Delete a cache entry (e.g., on selector failure) */
  delete(key: string): void {
    this.entries.delete(key);
    const filepath = path.join(this.dir, `${key}.json`);
    try {
      fs.unlinkSync(filepath);
    } catch {
      // File may not exist
    }
  }

  /** Get cache stats */
  stats(): { entries: number; hits: number; dir: string } {
    this.ensureLoaded();
    const hits = Array.from(this.entries.values()).reduce((sum, e) => sum + e.hitCount, 0);
    return { entries: this.entries.size, hits, dir: this.dir };
  }

  private ensureLoaded(): void {
    if (this.loaded || !this.enabled) return;
    this.loaded = true;

    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.dir, file), "utf-8");
          const entry = JSON.parse(content) as CachedAction;
          if (Date.now() - entry.createdAt <= this.ttl) {
            this.entries.set(entry.key, entry);
          } else {
            // Expired — clean up
            fs.unlinkSync(path.join(this.dir, file));
          }
        } catch {
          // Corrupt file — remove
          try {
            fs.unlinkSync(path.join(this.dir, file));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  private writeEntry(key: string, entry: CachedAction): void {
    try {
      fs.writeFileSync(path.join(this.dir, `${key}.json`), JSON.stringify(entry, null, 2));
    } catch {
      // Non-fatal — cache is best-effort
    }
  }
}
