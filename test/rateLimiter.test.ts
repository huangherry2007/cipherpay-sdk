import { 
  RateLimiter, 
  globalRateLimiter, 
  rateLimitConfigManager,
  isRateLimitingEnabled,
  getRateLimitUsage,
  resetRateLimit,
  getRateLimitStats,
  createRateLimitMiddleware
} from '../src/utils/RateLimiter';
import { CipherPayError, ErrorType } from '../src/errors/ErrorHandler';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    rateLimiter.stop();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', () => {
      rateLimiter.addLimit('test', {
        maxRequests: 5,
        windowMs: 1000
      });

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed('test')).toBe(true);
      }

      // 6th request should be blocked
      expect(rateLimiter.isAllowed('test')).toBe(false);
    });

    it('should reset after window expires', async () => {
      rateLimiter.addLimit('test', {
        maxRequests: 1,
        windowMs: 100
      });

      expect(rateLimiter.isAllowed('test')).toBe(true);
      expect(rateLimiter.isAllowed('test')).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(rateLimiter.isAllowed('test')).toBe(true);
    });

    it('should throw error when consume is called on exceeded limit', () => {
      rateLimiter.addLimit('test', {
        maxRequests: 1,
        windowMs: 1000
      });

      rateLimiter.consume('test'); // First call should succeed

      expect(() => {
        rateLimiter.consume('test'); // Second call should throw
      }).toThrow(CipherPayError);
    });
  });

  describe('Context-Based Rate Limiting', () => {
    it('should track different contexts separately', () => {
      rateLimiter.addLimit('test', {
        maxRequests: 2,
        windowMs: 1000,
        keyGenerator: (context) => context.userId
      });

      // User A should have 2 requests
      expect(rateLimiter.isAllowed('test', { userId: 'userA' })).toBe(true);
      expect(rateLimiter.isAllowed('test', { userId: 'userA' })).toBe(true);
      expect(rateLimiter.isAllowed('test', { userId: 'userA' })).toBe(false);

      // User B should have 2 requests
      expect(rateLimiter.isAllowed('test', { userId: 'userB' })).toBe(true);
      expect(rateLimiter.isAllowed('test', { userId: 'userB' })).toBe(true);
      expect(rateLimiter.isAllowed('test', { userId: 'userB' })).toBe(false);
    });
  });

  describe('Usage Information', () => {
    it('should provide correct usage information', () => {
      rateLimiter.addLimit('test', {
        maxRequests: 10,
        windowMs: 1000
      });

      const usage = rateLimiter.getUsage('test');
      expect(usage).toEqual({
        current: 0,
        limit: 10,
        remaining: 10,
        resetTime: expect.any(Number)
      });

      rateLimiter.consume('test');
      const usageAfter = rateLimiter.getUsage('test');
      expect(usageAfter?.current).toBe(1);
      expect(usageAfter?.remaining).toBe(9);
    });
  });

  describe('Statistics', () => {
    it('should provide correct statistics', () => {
      rateLimiter.addLimit('test1', { maxRequests: 5, windowMs: 1000 });
      rateLimiter.addLimit('test2', { maxRequests: 10, windowMs: 1000 });

      rateLimiter.consume('test1');
      rateLimiter.consume('test1');
      rateLimiter.consume('test2');

      const stats = rateLimiter.getStats();
      expect(stats.test1.totalRequests).toBe(2);
      expect(stats.test2.totalRequests).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup expired entries', async () => {
      rateLimiter.addLimit('test', {
        maxRequests: 1,
        windowMs: 50
      });

      rateLimiter.consume('test');
      expect(rateLimiter.getUsage('test')?.current).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      rateLimiter.cleanup();
      expect(rateLimiter.getUsage('test')?.current).toBe(0);
    });
  });
});

describe('Global Rate Limiter', () => {
  beforeEach(() => {
    // Reset global rate limiter
    globalRateLimiter.reset('PROOF_GENERATION');
    globalRateLimiter.reset('TRANSACTION_SIGNING');
    globalRateLimiter.reset('API_CALLS');
  });

  it('should have default rate limits configured', () => {
    expect(globalRateLimiter.getUsage('PROOF_GENERATION')).toBeTruthy();
    expect(globalRateLimiter.getUsage('TRANSACTION_SIGNING')).toBeTruthy();
    expect(globalRateLimiter.getUsage('API_CALLS')).toBeTruthy();
  });

  it('should enforce proof generation limits', () => {
    // Should allow 5 proof generation requests
    for (let i = 0; i < 5; i++) {
      expect(() => {
        globalRateLimiter.consume('PROOF_GENERATION', { userId: 'test' });
      }).not.toThrow();
    }

    // 6th request should be blocked
    expect(() => {
      globalRateLimiter.consume('PROOF_GENERATION', { userId: 'test' });
    }).toThrow(CipherPayError);
  });

  it('should enforce transaction signing limits', () => {
    // Should allow 20 transaction signing requests
    for (let i = 0; i < 20; i++) {
      expect(() => {
        globalRateLimiter.consume('TRANSACTION_SIGNING', { userId: 'test' });
      }).not.toThrow();
    }

    // 21st request should be blocked
    expect(() => {
      globalRateLimiter.consume('TRANSACTION_SIGNING', { userId: 'test' });
    }).toThrow(CipherPayError);
  });
});

describe('Rate Limit Configuration Manager', () => {
  it('should update configurations', () => {
    const originalConfig = rateLimitConfigManager.getConfig('PROOF_GENERATION');
    expect(originalConfig?.maxRequests).toBe(5);

    rateLimitConfigManager.updateConfig('PROOF_GENERATION', { maxRequests: 10 });
    const updatedConfig = rateLimitConfigManager.getConfig('PROOF_GENERATION');
    expect(updatedConfig?.maxRequests).toBe(10);
  });

  it('should reset to default', () => {
    rateLimitConfigManager.updateConfig('PROOF_GENERATION', { maxRequests: 10 });
    rateLimitConfigManager.resetToDefault('PROOF_GENERATION');
    
    const config = rateLimitConfigManager.getConfig('PROOF_GENERATION');
    expect(config?.maxRequests).toBe(5);
  });

  it('should get all configurations', () => {
    const configs = rateLimitConfigManager.getAllConfigs();
    expect(configs.PROOF_GENERATION).toBeTruthy();
    expect(configs.TRANSACTION_SIGNING).toBeTruthy();
    expect(configs.API_CALLS).toBeTruthy();
  });
});

describe('Utility Functions', () => {
  it('should check if rate limiting is enabled', () => {
    const originalEnv = process.env.DISABLE_RATE_LIMITING;
    
    delete process.env.DISABLE_RATE_LIMITING;
    expect(isRateLimitingEnabled()).toBe(true);
    
    process.env.DISABLE_RATE_LIMITING = 'true';
    expect(isRateLimitingEnabled()).toBe(false);
    
    // Restore original environment
    if (originalEnv) {
      process.env.DISABLE_RATE_LIMITING = originalEnv;
    } else {
      delete process.env.DISABLE_RATE_LIMITING;
    }
  });

  it('should get rate limit usage', () => {
    const usage = getRateLimitUsage('PROOF_GENERATION', { userId: 'test' });
    expect(usage).toBeTruthy();
    expect(usage?.limit).toBe(5);
  });

  it('should reset rate limits', () => {
    // Reset first to ensure clean state
    resetRateLimit('PROOF_GENERATION', { userId: 'test' });
    
    globalRateLimiter.consume('PROOF_GENERATION', { userId: 'test' });
    expect(getRateLimitUsage('PROOF_GENERATION', { userId: 'test' })?.current).toBe(1);
    
    resetRateLimit('PROOF_GENERATION', { userId: 'test' });
    expect(getRateLimitUsage('PROOF_GENERATION', { userId: 'test' })?.current).toBe(0);
  });

  it('should get rate limit stats', () => {
    const stats = getRateLimitStats();
    expect(stats.PROOF_GENERATION).toBeTruthy();
    expect(stats.TRANSACTION_SIGNING).toBeTruthy();
  });
});

describe('Rate Limit Middleware', () => {
  it('should create middleware function', () => {
    const middleware = createRateLimitMiddleware('API_CALLS');
    expect(typeof middleware).toBe('function');
  });

  it('should add rate limit headers', () => {
    const middleware = createRateLimitMiddleware('API_CALLS');
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
      path: '/test',
      method: 'GET'
    };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith({
      'X-RateLimit-Limit': expect.any(Number),
      'X-RateLimit-Remaining': expect.any(Number),
      'X-RateLimit-Reset': expect.any(Number)
    });
    expect(next).toHaveBeenCalled();
  });
}); 