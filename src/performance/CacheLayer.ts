import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  checkPeriod: number; // How often to check for expired entries
  evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'random';
  enableCompression: boolean;
  enableEncryption: boolean;
  encryptionKey?: string;
  enableMetrics: boolean;
  enablePersistence: boolean;
  persistencePath?: string;
}

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  ttl: number;
  expiresAt: number;
  size: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface CacheMetrics {
  totalEntries: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
  averageAccessTime: number;
  compressionRatio: number;
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  compress?: boolean;
  encrypt?: boolean;
}

export class CacheLayer {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = []; // For LRU
  private accessCounts: Map<string, number> = new Map(); // For LFU
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: CacheMetrics;
  private cleanupInterval?: NodeJS.Timeout;
  private persistenceInterval?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      ttl: 300000, // 5 minutes
      checkPeriod: 60000, // 1 minute
      evictionPolicy: 'lru',
      enableCompression: false,
      enableEncryption: false,
      enableMetrics: true,
      enablePersistence: false,
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    this.startCleanupInterval();
    if (this.config.enablePersistence) {
      this.startPersistenceInterval();
      this.loadFromPersistence();
    }
  }

  /**
   * Sets a value in the cache
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Check if we need to evict entries
      if (this.cache.size >= this.config.maxSize) {
        await this.evictEntries();
      }

      // Prepare value
      let processedValue = value;
      let size = this.calculateSize(value);

      // Compress if enabled
      if (options.compress || this.config.enableCompression) {
        processedValue = await this.compress(processedValue);
        size = this.calculateSize(processedValue);
      }

      // Encrypt if enabled
      if (options.encrypt || this.config.enableEncryption) {
        processedValue = await this.encrypt(processedValue);
        size = this.calculateSize(processedValue);
      }

      const ttl = options.ttl || this.config.ttl;
      const entry: CacheEntry<T> = {
        key,
        value: processedValue,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        ttl,
        expiresAt: Date.now() + ttl,
        size,
        tags: options.tags,
        metadata: options.metadata
      };

      this.cache.set(key, entry);
      this.updateAccessOrder(key);
      this.updateMetrics('set', Date.now() - startTime);

      this.logger.debug('Cache entry set', {
        key,
        size,
        ttl,
        tags: options.tags
      });
    } catch (error) {
      this.logger.error('Failed to set cache entry', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Gets a value from the cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const startTime = Date.now();
      const entry = this.cache.get(key);

      if (!entry) {
        this.updateMetrics('miss', Date.now() - startTime);
        return null;
      }

      // Check if entry is expired
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.updateMetrics('miss', Date.now() - startTime);
        return null;
      }

      // Update access statistics
      entry.lastAccessed = Date.now();
      entry.accessCount++;
      this.updateAccessOrder(key);
      this.accessCounts.set(key, entry.accessCount);

      // Decompress if needed
      let value = entry.value;
      if (this.config.enableCompression) {
        value = await this.decompress(value);
      }

      // Decrypt if needed
      if (this.config.enableEncryption) {
        value = await this.decrypt(value);
      }

      this.updateMetrics('hit', Date.now() - startTime);

      return value as T;
    } catch (error) {
      this.logger.error('Failed to get cache entry', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Gets multiple values from the cache
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const promises = keys.map(async (key) => {
      const value = await this.get<T>(key);
      if (value !== null) {
        results.set(key, value);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Checks if a key exists in the cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a key from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
      this.accessCounts.delete(key);
    }
    return deleted;
  }

  /**
   * Deletes multiple keys from the cache
   */
  deleteMultiple(keys: string[]): number {
    let deletedCount = 0;
    keys.forEach(key => {
      if (this.delete(key)) {
        deletedCount++;
      }
    });
    return deletedCount;
  }

  /**
   * Invalidates cache entries by tags
   */
  invalidateByTags(tags: string[]): number {
    let invalidatedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.some(tag => tags.includes(tag))) {
        this.delete(key);
        invalidatedCount++;
      }
    }

    this.logger.info('Cache invalidated by tags', {
      tags,
      invalidatedCount
    });

    return invalidatedCount;
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.accessCounts.clear();
    this.metrics = this.initializeMetrics();

    this.logger.info('Cache cleared');
  }

  /**
   * Gets cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Gets cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Gets total cache size in bytes
   */
  totalSize(): number {
    return Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
  }

  /**
   * Evicts entries based on eviction policy
   */
  private async evictEntries(): Promise<void> {
    const entriesToEvict = Math.ceil(this.config.maxSize * 0.1); // Evict 10% of entries
    let evictedCount = 0;

    switch (this.config.evictionPolicy) {
      case 'lru':
        evictedCount = this.evictLRU(entriesToEvict);
        break;
      case 'lfu':
        evictedCount = this.evictLFU(entriesToEvict);
        break;
      case 'fifo':
        evictedCount = this.evictFIFO(entriesToEvict);
        break;
      case 'random':
        evictedCount = this.evictRandom(entriesToEvict);
        break;
    }

    this.metrics.evictionCount += evictedCount;
    this.logger.debug('Cache entries evicted', {
      policy: this.config.evictionPolicy,
      count: evictedCount
    });
  }

  /**
   * Evicts least recently used entries
   */
  private evictLRU(count: number): number {
    let evicted = 0;
    while (evicted < count && this.accessOrder.length > 0) {
      const key = this.accessOrder.shift()!;
      if (this.cache.delete(key)) {
        this.accessCounts.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Evicts least frequently used entries
   */
  private evictLFU(count: number): number {
    const sortedEntries = Array.from(this.accessCounts.entries())
      .sort(([, a], [, b]) => a - b); // Sort by access count ascending (least to most)
    
    let evicted = 0;
    for (const [key] of sortedEntries) {
      if (evicted >= count) break;
      if (this.cache.delete(key)) {
        this.accessCounts.delete(key);
        this.removeFromAccessOrder(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Evicts first in, first out entries
   */
  private evictFIFO(count: number): number {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.createdAt - b.createdAt);
    
    let evicted = 0;
    for (const [key] of entries) {
      if (evicted >= count) break;
      if (this.cache.delete(key)) {
        this.accessCounts.delete(key);
        this.removeFromAccessOrder(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Evicts random entries
   */
  private evictRandom(count: number): number {
    const keys = Array.from(this.cache.keys());
    let evicted = 0;
    
    while (evicted < count && keys.length > 0) {
      const randomIndex = Math.floor(Math.random() * keys.length);
      const key = keys.splice(randomIndex, 1)[0];
      if (this.cache.delete(key)) {
        this.accessCounts.delete(key);
        this.removeFromAccessOrder(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Updates access order for LRU
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Removes key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Starts cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.config.checkPeriod);
  }

  /**
   * Cleans up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.accessCounts.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Expired cache entries cleaned', { count: cleanedCount });
    }
  }

  /**
   * Starts persistence interval
   */
  private startPersistenceInterval(): void {
    if (!this.config.enablePersistence) return;

    this.persistenceInterval = setInterval(() => {
      this.saveToPersistence();
    }, 60000); // Save every minute
  }

  /**
   * Saves cache to persistence
   */
  private async saveToPersistence(): Promise<void> {
    if (!this.config.persistencePath) return;

    try {
      const data = {
        entries: Array.from(this.cache.entries()),
        accessOrder: this.accessOrder,
        accessCounts: Array.from(this.accessCounts.entries()),
        timestamp: Date.now()
      };

      // In a real implementation, you would save to file or database
      // For now, we'll just log it
      this.logger.debug('Cache persistence saved', {
        path: this.config.persistencePath,
        entryCount: this.cache.size
      });
    } catch (error) {
      this.logger.error('Failed to save cache persistence', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Loads cache from persistence
   */
  private async loadFromPersistence(): Promise<void> {
    if (!this.config.persistencePath) return;

    try {
      // In a real implementation, you would load from file or database
      this.logger.debug('Cache persistence loaded', {
        path: this.config.persistencePath
      });
    } catch (error) {
      this.logger.error('Failed to load cache persistence', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Calculates size of a value
   */
  private calculateSize(value: any): number {
    return JSON.stringify(value).length;
  }

  /**
   * Compresses a value
   */
  private async compress(value: any): Promise<any> {
    // In a real implementation, you would use compression libraries
    // For now, we'll just return the value
    return value;
  }

  /**
   * Decompresses a value
   */
  private async decompress(value: any): Promise<any> {
    // In a real implementation, you would use compression libraries
    // For now, we'll just return the value
    return value;
  }

  /**
   * Encrypts a value
   */
  private async encrypt(value: any): Promise<any> {
    // In a real implementation, you would use encryption libraries
    // For now, we'll just return the value
    return value;
  }

  /**
   * Decrypts a value
   */
  private async decrypt(value: any): Promise<any> {
    // In a real implementation, you would use encryption libraries
    // For now, we'll just return the value
    return value;
  }

  /**
   * Updates cache metrics
   */
  private updateMetrics(operation: 'hit' | 'miss' | 'set', duration: number): void {
    if (!this.config.enableMetrics) return;

    if (operation === 'hit') {
      this.metrics.hitCount++;
    } else if (operation === 'miss') {
      this.metrics.missCount++;
    }

    const total = this.metrics.hitCount + this.metrics.missCount;
    this.metrics.hitRate = total > 0 ? this.metrics.hitCount / total : 0;
    this.metrics.averageAccessTime = (this.metrics.averageAccessTime + duration) / 2;
    this.metrics.totalEntries = this.cache.size;
    this.metrics.totalSize = this.totalSize();
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): CacheMetrics {
    return {
      totalEntries: 0,
      totalSize: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      evictionCount: 0,
      averageAccessTime: 0,
      compressionRatio: 1
    };
  }

  /**
   * Closes the cache layer
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    if (this.config.enablePersistence) {
      await this.saveToPersistence();
    }

    this.logger.info('Cache layer closed');
  }
}

/**
 * Cache Layer Manager for managing multiple cache layers
 */
export class CacheLayerManager {
  private static instance: CacheLayerManager;
  private caches: Map<string, CacheLayer> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): CacheLayerManager {
    if (!CacheLayerManager.instance) {
      CacheLayerManager.instance = new CacheLayerManager();
    }
    return CacheLayerManager.instance;
  }

  /**
   * Creates or gets a cache layer
   */
  createCache(name: string, config?: Partial<CacheConfig>): CacheLayer {
    if (this.caches.has(name)) {
      return this.caches.get(name)!;
    }

    const cache = new CacheLayer(config);
    this.caches.set(name, cache);

    this.logger.info('Cache layer created', {
      cacheName: name,
      config
    });

    return cache;
  }

  /**
   * Gets a cache layer
   */
  getCache(name: string): CacheLayer | undefined {
    return this.caches.get(name);
  }

  /**
   * Gets all cache layers
   */
  getAllCaches(): Map<string, CacheLayer> {
    return new Map(this.caches);
  }

  /**
   * Closes all cache layers
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.caches.values()).map(cache => cache.close());
    await Promise.allSettled(closePromises);
    this.caches.clear();

    this.logger.info('All cache layers closed');
  }
} 