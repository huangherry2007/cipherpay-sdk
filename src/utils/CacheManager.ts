export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number; // in milliseconds
  cleanupInterval: number; // in milliseconds
  enableLRU: boolean;
}

export class CacheManager {
  private readonly cache: Map<string, CacheEntry<any>> = new Map();
  private readonly config: CacheConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minutes
      cleanupInterval: config.cleanupInterval || 60 * 1000, // 1 minute
      enableLRU: config.enableLRU !== false
    };

    this.startCleanupTimer();
  }

  /**
   * Sets a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in milliseconds
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize) {
      this.evictEntries();
    }

    this.cache.set(key, entry);
  }

  /**
   * Gets a value from the cache
   * @param key Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if entry is expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.value;
  }

  /**
   * Checks if a key exists in the cache and is not expired
   * @param key Cache key
   * @returns Whether the key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Removes a key from the cache
   * @param key Cache key
   * @returns Whether the key was removed
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  } {
    let totalHits = 0;
    let totalMisses = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.accessCount;
    }

    // This is a simplified calculation - in practice you'd track misses separately
    const hitRate = totalHits > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      totalHits,
      totalMisses
    };
  }

  /**
   * Gets all cache keys
   * @returns Array of cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Gets all cache values
   * @returns Array of cache values
   */
  values<T>(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Sets multiple values in the cache
   * @param entries Array of key-value pairs
   * @param ttl Time to live in milliseconds
   */
  setMultiple<T>(entries: Array<{ key: string; value: T }>, ttl?: number): void {
    for (const { key, value } of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Gets multiple values from the cache
   * @param keys Array of cache keys
   * @returns Object with key-value pairs
   */
  getMultiple<T>(keys: string[]): Record<string, T | undefined> {
    const result: Record<string, T | undefined> = {};
    
    for (const key of keys) {
      result[key] = this.get<T>(key);
    }

    return result;
  }

  /**
   * Checks if an entry is expired
   * @param entry Cache entry
   * @returns Whether the entry is expired
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evicts entries from the cache based on LRU or other policies
   */
  private evictEntries(): void {
    if (this.config.enableLRU) {
      this.evictLRU();
    } else {
      this.evictRandom();
    }
  }

  /**
   * Evicts least recently used entries
   */
  private evictLRU(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by last accessed time (oldest first)
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    // Remove oldest entries until we're under the limit
    const toRemove = entries.slice(0, Math.ceil(this.config.maxSize * 0.1)); // Remove 10%
    
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  /**
   * Evicts random entries
   */
  private evictRandom(): void {
    const keys = Array.from(this.cache.keys());
    const toRemove = Math.ceil(this.config.maxSize * 0.1); // Remove 10%
    
    for (let i = 0; i < toRemove && keys.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * keys.length);
      const key = keys.splice(randomIndex, 1)[0];
      this.cache.delete(key);
    }
  }

  /**
   * Starts the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Cleans up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stops the cache manager and cleans up resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
} 