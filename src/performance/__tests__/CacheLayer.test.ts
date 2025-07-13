import { CacheLayer, CacheLayerManager, CacheConfig } from '../CacheLayer';

describe('CacheLayer', () => {
  let cache: CacheLayer;

  beforeEach(() => {
    const config: Partial<CacheConfig> = {
      maxSize: 5,
      ttl: 1000, // 1 second
      checkPeriod: 100,
      evictionPolicy: 'lru',
      enableMetrics: true
    };

    cache = new CacheLayer(config);
  });

  afterEach(async () => {
    await cache.close();
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should handle different data types', async () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        object: { key: 'value' },
        array: [1, 2, 3]
      };

      for (const [key, value] of Object.entries(testData)) {
        await cache.set(key, value);
        const retrieved = await cache.get(key);
        expect(retrieved).toEqual(value);
      }
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', async () => {
      await cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);

      const deleted2 = cache.delete('nonexistent');
      expect(deleted2).toBe(false);
    });

    it('should delete multiple keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const deletedCount = cache.deleteMultiple(['key1', 'key2', 'nonexistent']);
      expect(deletedCount).toBe(2);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
    });
  });

  describe('TTL Management', () => {
    it('should expire entries after TTL', async () => {
      await cache.set('key1', 'value1', { ttl: 50 });
      
      // Should be available immediately
      expect(await cache.get('key1')).toBe('value1');
      
      // Should expire after TTL
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(await cache.get('key1')).toBeNull();
    });

    it('should handle different TTL values', async () => {
      await cache.set('key1', 'value1', { ttl: 50 });
      await cache.set('key2', 'value2', { ttl: 200 });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      // key1 should be expired, key2 should still be available
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('value2');
    });

    it('should clean up expired entries', async () => {
      await cache.set('key1', 'value1', { ttl: 50 });
      await cache.set('key2', 'value2', { ttl: 50 });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger cleanup
      await cache.set('key3', 'value3');
      
      const metrics = cache.getMetrics();
      expect(metrics.totalEntries).toBe(1); // Only key3 should remain
    });
  });

  describe('Eviction Policies', () => {
    it('should evict entries when max size is reached (LRU)', async () => {
      const lruCache = new CacheLayer({ maxSize: 3, evictionPolicy: 'lru' });

      await lruCache.set('key1', 'value1');
      await lruCache.set('key2', 'value2');
      await lruCache.set('key3', 'value3');
      await lruCache.set('key4', 'value4'); // Should evict key1

      expect(await lruCache.get('key1')).toBeNull();
      expect(await lruCache.get('key2')).toBe('value2');
      expect(await lruCache.get('key3')).toBe('value3');
      expect(await lruCache.get('key4')).toBe('value4');

      await lruCache.close();
    });

    it('should evict least frequently used entries (LFU)', async () => {
      const lfuCache = new CacheLayer({ maxSize: 3, evictionPolicy: 'lfu' });

      await lfuCache.set('key1', 'value1');
      await lfuCache.set('key2', 'value2');
      await lfuCache.set('key3', 'value3');

      // Access key1 and key2 multiple times to make them more frequently used
      await lfuCache.get('key1');
      await lfuCache.get('key1');
      await lfuCache.get('key1'); // Make key1 most frequently used
      await lfuCache.get('key2');
      await lfuCache.get('key2'); // Make key2 second most frequently used
      await lfuCache.get('key3'); // Give key3 one access

      // Add new entry, should evict key3 (least frequently used)
      await lfuCache.set('key4', 'value4');

      // key3 should be evicted (least frequently used)
      expect(await lfuCache.get('key3')).toBeNull();
      // key1 and key2 should remain
      expect(await lfuCache.get('key1')).toBe('value1');
      expect(await lfuCache.get('key2')).toBe('value2');
      expect(await lfuCache.get('key4')).toBe('value4');

      await lfuCache.close();
    });

    it('should evict first in, first out entries (FIFO)', async () => {
      const fifoCache = new CacheLayer({ maxSize: 3, evictionPolicy: 'fifo' });

      await fifoCache.set('key1', 'value1');
      await fifoCache.set('key2', 'value2');
      await fifoCache.set('key3', 'value3');
      await fifoCache.set('key4', 'value4'); // Should evict key1

      expect(await fifoCache.get('key1')).toBeNull();
      expect(await fifoCache.get('key2')).toBe('value2');
      expect(await fifoCache.get('key3')).toBe('value3');
      expect(await fifoCache.get('key4')).toBe('value4');

      await fifoCache.close();
    });
  });

  describe('Tags and Invalidation', () => {
    it('should support tags for entries', async () => {
      await cache.set('key1', 'value1', { tags: ['tag1', 'tag2'] });
      await cache.set('key2', 'value2', { tags: ['tag2', 'tag3'] });
      await cache.set('key3', 'value3', { tags: ['tag1'] });

      // Invalidate by tag
      const invalidatedCount = cache.invalidateByTags(['tag1']);
      expect(invalidatedCount).toBe(2); // key1 and key3

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBe('value2'); // Should remain
      expect(await cache.get('key3')).toBeNull();
    });

    it('should invalidate multiple tags', async () => {
      await cache.set('key1', 'value1', { tags: ['tag1', 'tag2'] });
      await cache.set('key2', 'value2', { tags: ['tag2', 'tag3'] });

      const invalidatedCount = cache.invalidateByTags(['tag1', 'tag3']);
      expect(invalidatedCount).toBe(2); // Both entries should be invalidated
    });
  });

  describe('Metrics', () => {
    it('should track cache metrics', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      await cache.get('key1'); // Hit
      await cache.get('key2'); // Hit
      await cache.get('nonexistent'); // Miss

      const metrics = cache.getMetrics();
      expect(metrics.totalEntries).toBe(2);
      expect(metrics.hitCount).toBe(2);
      expect(metrics.missCount).toBe(1);
      expect(metrics.hitRate).toBe(2 / 3);
      expect(metrics.totalSize).toBeGreaterThan(0);
    });

    it('should track average access time', async () => {
      await cache.set('key1', 'value1');
      
      // Perform multiple accesses to ensure metrics are updated
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key1');

      const metrics = cache.getMetrics();
      expect(metrics.averageAccessTime).toBeGreaterThanOrEqual(0);
    });

    it('should track eviction count', async () => {
      const smallCache = new CacheLayer({ maxSize: 2, evictionPolicy: 'lru' });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3'); // Should evict key1

      const metrics = smallCache.getMetrics();
      expect(metrics.evictionCount).toBeGreaterThan(0);

      await smallCache.close();
    });
  });

  describe('Cache Operations', () => {
    it('should get multiple values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const results = await cache.getMultiple(['key1', 'key2', 'nonexistent']);
      expect(results.size).toBe(2);
      expect(results.get('key1')).toBe('value1');
      expect(results.get('key2')).toBe('value2');
      expect(results.has('nonexistent')).toBe(false);
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });

    it('should get all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys.length).toBe(2);
    });

    it('should get cache size', async () => {
      expect(cache.size()).toBe(0);

      await cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      await cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });

    it('should get total size in bytes', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const totalSize = cache.totalSize();
      expect(totalSize).toBeGreaterThan(0);
    });
  });
});

describe('CacheLayerManager', () => {
  let manager: CacheLayerManager;

  beforeEach(() => {
    manager = CacheLayerManager.getInstance();
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  it('should create and manage multiple caches', () => {
    const cache1 = manager.createCache('cache1', { maxSize: 10 });
    const cache2 = manager.createCache('cache2', { maxSize: 20 });

    expect(cache1).toBeDefined();
    expect(cache2).toBeDefined();
    expect(cache1).not.toBe(cache2);

    const retrievedCache1 = manager.getCache('cache1');
    const retrievedCache2 = manager.getCache('cache2');

    expect(retrievedCache1).toBe(cache1);
    expect(retrievedCache2).toBe(cache2);
  });

  it('should return existing cache if name already exists', () => {
    const cache1 = manager.createCache('test-cache', { maxSize: 10 });
    const cache2 = manager.createCache('test-cache', { maxSize: 20 });

    expect(cache1).toBe(cache2);
  });

  it('should get all caches', () => {
    manager.createCache('cache1', { maxSize: 10 });
    manager.createCache('cache2', { maxSize: 20 });

    const allCaches = manager.getAllCaches();
    expect(allCaches.size).toBe(2);
    expect(allCaches.has('cache1')).toBe(true);
    expect(allCaches.has('cache2')).toBe(true);
  });

  it('should close all caches', async () => {
    manager.createCache('cache1', { maxSize: 10 });
    manager.createCache('cache2', { maxSize: 20 });

    await manager.closeAll();

    const allCaches = manager.getAllCaches();
    expect(allCaches.size).toBe(0);
  });
}); 