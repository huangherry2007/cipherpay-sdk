import { CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (context: any) => string;
  onLimitExceeded?: (key: string, context: any) => void;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequestTime: number;
}

/**
 * Rate limiting decorator for methods
 * @param limitKey The rate limit rule to apply
 * @param contextExtractor Function to extract context from method arguments
 */
export function rateLimit(limitKey: string, contextExtractor?: (...args: any[]) => any) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context = contextExtractor ? contextExtractor(...args) : {};
      
      // Add method name and class name to context
      context.method = propertyName;
      context.className = target.constructor.name;
      
      // Apply rate limiting
      globalRateLimiter.consume(limitKey, context);
      
      // Execute the original method
      return method.apply(this, args);
    };
  };
}

/**
 * Rate limiting decorator for functions
 * @param limitKey The rate limit rule to apply
 * @param contextExtractor Function to extract context from function arguments
 */
export function rateLimitFunction(limitKey: string, contextExtractor?: (...args: any[]) => any) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const func = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const context = contextExtractor ? contextExtractor(...args) : {};
      
      // Add function name to context
      context.function = propertyName;
      
      // Apply rate limiting
      globalRateLimiter.consume(limitKey, context);
      
      // Execute the original function
      return func.apply(this, args);
    };
  };
}

/**
 * API Rate Limiting Middleware
 * @param limitKey The rate limit rule to apply
 * @param contextExtractor Function to extract context from request
 */
export function createRateLimitMiddleware(limitKey: string, contextExtractor?: (req: any) => any) {
  return function (req: any, res: any, next: any) {
    try {
      const context = contextExtractor ? contextExtractor(req) : {};
      
      // Add request information to context
      context.ip = req.ip || req.connection.remoteAddress;
      context.userAgent = req.headers['user-agent'];
      context.path = req.path;
      context.method = req.method;
      
      // Apply rate limiting
      globalRateLimiter.consume(limitKey, context);
      
      // Add rate limit headers to response
      const usage = globalRateLimiter.getUsage(limitKey, context);
      if (usage) {
        res.set({
          'X-RateLimit-Limit': usage.limit,
          'X-RateLimit-Remaining': usage.remaining,
          'X-RateLimit-Reset': usage.resetTime
        });
      }
      
      next();
          } catch (error) {
        if (error instanceof CipherPayError && error.type === ErrorType.RATE_LIMIT_EXCEEDED) {
          const context = contextExtractor ? contextExtractor(req) : {};
          const usage = globalRateLimiter.getUsage(limitKey, context);
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: error.message,
          retryAfter: usage ? Math.ceil((usage.resetTime - Date.now()) / 1000) : 60,
          limit: usage?.limit,
          remaining: usage?.remaining,
          resetTime: usage?.resetTime
        });
      } else {
        next(error);
      }
    }
  };
}

export class RateLimiter {
  private limits: Map<string, RateLimitConfig> = new Map();
  private entries: Map<string, RateLimitEntry> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Adds a rate limit rule
   * @param key Unique identifier for the rate limit rule
   * @param config Rate limit configuration
   */
  public addLimit(key: string, config: RateLimitConfig): void {
    this.limits.set(key, {
      ...config,
      keyGenerator: config.keyGenerator || (() => 'default'),
      onLimitExceeded: config.onLimitExceeded || (() => {})
    });
  }

  /**
   * Checks if a request is allowed under the rate limit
   * @param limitKey The rate limit rule to check
   * @param context Context for key generation
   * @returns True if request is allowed, false if rate limited
   */
  public isAllowed(limitKey: string, context: any = {}): boolean {
    const limit = this.limits.get(limitKey);
    if (!limit) {
      return true; // No limit configured
    }

    const key = limit.keyGenerator!(context);
    const entryKey = `${limitKey}:${key}`;
    const now = Date.now();

    // Get or create entry
    let entry = this.entries.get(entryKey);
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + limit.windowMs,
        lastRequestTime: now
      };
    }

    // Check if limit exceeded
    if (entry.count >= limit.maxRequests) {
      limit.onLimitExceeded!(key, context);
      return false;
    }

    // Update entry
    entry.count++;
    entry.lastRequestTime = now;
    this.entries.set(entryKey, entry);

    return true;
  }

  /**
   * Attempts to consume a rate limit slot
   * @param limitKey The rate limit rule to consume
   * @param context Context for key generation
   * @returns True if consumed successfully, throws error if rate limited
   */
  public consume(limitKey: string, context: any = {}): boolean {
    if (!this.isAllowed(limitKey, context)) {
      const limit = this.limits.get(limitKey);
      const key = limit?.keyGenerator!(context) || 'default';
      
      throw new CipherPayError(
        `Rate limit exceeded for ${limitKey}`,
        ErrorType.RATE_LIMIT_EXCEEDED,
        { limitKey, key, context, limit: limit?.maxRequests, window: limit?.windowMs },
        {
          action: 'Wait and retry later',
          description: `You have exceeded the rate limit for ${limitKey}. Please wait before making more requests.`
        },
        true
      );
    }
    return true;
  }

  /**
   * Gets current usage for a rate limit
   * @param limitKey The rate limit rule to check
   * @param context Context for key generation
   * @returns Current usage information
   */
  public getUsage(limitKey: string, context: any = {}): {
    current: number;
    limit: number;
    resetTime: number;
    remaining: number;
  } | null {
    const limit = this.limits.get(limitKey);
    if (!limit) {
      return null;
    }

    const key = limit.keyGenerator!(context);
    const entryKey = `${limitKey}:${key}`;
    const now = Date.now();

    let entry = this.entries.get(entryKey);
    if (!entry || now > entry.resetTime) {
      return {
        current: 0,
        limit: limit.maxRequests,
        resetTime: now + limit.windowMs,
        remaining: limit.maxRequests
      };
    }

    return {
      current: entry.count,
      limit: limit.maxRequests,
      resetTime: entry.resetTime,
      remaining: Math.max(0, limit.maxRequests - entry.count)
    };
  }

  /**
   * Resets a rate limit for a specific key
   * @param limitKey The rate limit rule to reset
   * @param context Context for key generation
   */
  public reset(limitKey: string, context: any = {}): void {
    const limit = this.limits.get(limitKey);
    if (!limit) {
      return;
    }

    const key = limit.keyGenerator!(context);
    const entryKey = `${limitKey}:${key}`;
    this.entries.delete(entryKey);
  }

  /**
   * Gets all rate limit statistics
   * @returns Statistics for all rate limits
   */
  public getStats(): Record<string, {
    limit: RateLimitConfig;
    activeEntries: number;
    totalRequests: number;
  }> {
    const stats: Record<string, any> = {};
    
    for (const [limitKey, limit] of this.limits.entries()) {
      let activeEntries = 0;
      let totalRequests = 0;
      const now = Date.now();

      for (const [entryKey, entry] of this.entries.entries()) {
        if (entryKey.startsWith(`${limitKey}:`) && now <= entry.resetTime) {
          activeEntries++;
          totalRequests += entry.count;
        }
      }

      stats[limitKey] = {
        limit,
        activeEntries,
        totalRequests
      };
    }

    return stats;
  }

  /**
   * Cleans up expired entries
   */
  public cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.entries.entries()) {
      if (now > entry.resetTime) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.entries.delete(key);
    }
  }

  /**
   * Starts the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  /**
   * Stops the cleanup timer
   */
  public stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

// Enhanced default rate limit configurations for production
export const DEFAULT_RATE_LIMITS = {
  // Proof generation - computationally expensive
  PROOF_GENERATION: {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // Transaction signing - moderate cost
  TRANSACTION_SIGNING: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // API calls - general endpoints
  API_CALLS: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // Note encryption - moderate cost
  NOTE_ENCRYPTION: {
    maxRequests: 50,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // Merkle tree operations - moderate cost
  MERKLE_OPERATIONS: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // Wallet operations - moderate cost
  WALLET_OPERATIONS: {
    maxRequests: 25,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // High-frequency operations - more permissive
  HIGH_FREQUENCY: {
    maxRequests: 500,
    windowMs: 60000, // 1 minute
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  },
  
  // Admin operations - very restrictive
  ADMIN_OPERATIONS: {
    maxRequests: 10,
    windowMs: 300000, // 5 minutes
    keyGenerator: (context: any) => context.userId || context.address || context.ip || 'anonymous'
  }
};

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();

// Initialize default rate limits
Object.entries(DEFAULT_RATE_LIMITS).forEach(([key, config]) => {
  globalRateLimiter.addLimit(key, config);
});

/**
 * Rate Limiting Configuration Manager
 */
export class RateLimitConfigManager {
  private static instance: RateLimitConfigManager;
  private configs: Map<string, RateLimitConfig> = new Map();

  private constructor() {
    // Initialize with default configurations
    Object.entries(DEFAULT_RATE_LIMITS).forEach(([key, config]) => {
      this.configs.set(key, config);
    });
  }

  public static getInstance(): RateLimitConfigManager {
    if (!RateLimitConfigManager.instance) {
      RateLimitConfigManager.instance = new RateLimitConfigManager();
    }
    return RateLimitConfigManager.instance;
  }

  /**
   * Updates a rate limit configuration
   * @param limitKey The rate limit key
   * @param config The new configuration
   */
  public updateConfig(limitKey: string, config: Partial<RateLimitConfig>): void {
    const existing = this.configs.get(limitKey);
    if (existing) {
      this.configs.set(limitKey, { ...existing, ...config });
      globalRateLimiter.addLimit(limitKey, this.configs.get(limitKey)!);
    }
  }

  /**
   * Gets a rate limit configuration
   * @param limitKey The rate limit key
   * @returns The configuration or null if not found
   */
  public getConfig(limitKey: string): RateLimitConfig | null {
    return this.configs.get(limitKey) || null;
  }

  /**
   * Gets all rate limit configurations
   * @returns All configurations
   */
  public getAllConfigs(): Record<string, RateLimitConfig> {
    const result: Record<string, RateLimitConfig> = {};
    for (const [key, config] of this.configs.entries()) {
      result[key] = config;
    }
    return result;
  }

  /**
   * Resets a rate limit configuration to default
   * @param limitKey The rate limit key
   */
  public resetToDefault(limitKey: string): void {
    const defaultConfig = DEFAULT_RATE_LIMITS[limitKey as keyof typeof DEFAULT_RATE_LIMITS];
    if (defaultConfig) {
      this.configs.set(limitKey, defaultConfig);
      globalRateLimiter.addLimit(limitKey, defaultConfig);
    }
  }

  /**
   * Loads configurations from environment variables
   */
  public loadFromEnvironment(): void {
    const envPrefix = 'RATE_LIMIT_';
    
    for (const [key, defaultConfig] of Object.entries(DEFAULT_RATE_LIMITS)) {
      const envKey = envPrefix + key;
      const maxRequests = process.env[envKey + '_MAX_REQUESTS'];
      const windowMs = process.env[envKey + '_WINDOW_MS'];
      
      if (maxRequests || windowMs) {
        const config = { ...defaultConfig };
        if (maxRequests) config.maxRequests = parseInt(maxRequests);
        if (windowMs) config.windowMs = parseInt(windowMs);
        
        this.updateConfig(key, config);
      }
    }
  }
}

/**
 * Utility function to check if rate limiting is enabled
 * @returns True if rate limiting is enabled
 */
export function isRateLimitingEnabled(): boolean {
  return process.env.DISABLE_RATE_LIMITING !== 'true';
}

/**
 * Utility function to get rate limit usage information
 * @param limitKey The rate limit key
 * @param context The context
 * @returns Usage information or null if not found
 */
export function getRateLimitUsage(limitKey: string, context: any = {}): {
  current: number;
  limit: number;
  resetTime: number;
  remaining: number;
} | null {
  return globalRateLimiter.getUsage(limitKey, context);
}

/**
 * Utility function to reset a rate limit
 * @param limitKey The rate limit key
 * @param context The context
 */
export function resetRateLimit(limitKey: string, context: any = {}): void {
  globalRateLimiter.reset(limitKey, context);
}

/**
 * Utility function to get all rate limit statistics
 * @returns All rate limit statistics
 */
export function getRateLimitStats(): Record<string, {
  limit: RateLimitConfig;
  activeEntries: number;
  totalRequests: number;
}> {
  return globalRateLimiter.getStats();
}

// Initialize rate limiting configuration manager
export const rateLimitConfigManager = RateLimitConfigManager.getInstance();

// Load configurations from environment variables on startup
if (isRateLimitingEnabled()) {
  rateLimitConfigManager.loadFromEnvironment();
} 