import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';
import { ConnectionPool, ConnectionPoolManager, ConnectionConfig, PoolConfig } from './ConnectionPool';
import { CacheLayer, CacheLayerManager, CacheConfig } from './CacheLayer';
import { AsyncProcessor, AsyncProcessorManager, ProcessorConfig } from './AsyncProcessor';
import { ResourceManager, ResourceManagerManager, ResourceConfig } from './ResourceManager';

export interface PerformanceConfig {
  // Connection Pool Configuration
  connectionPools: {
    [name: string]: {
      configs: ConnectionConfig[];
      poolConfig?: Partial<PoolConfig>;
    };
  };
  
  // Cache Configuration
  caches: {
    [name: string]: Partial<CacheConfig>;
  };
  
  // Async Processor Configuration
  processors: {
    [name: string]: Partial<ProcessorConfig>;
  };
  
  // Resource Management Configuration
  resourceManager?: Partial<ResourceConfig>;
  
  // Global Performance Settings
  enableMonitoring: boolean;
  enableOptimization: boolean;
  optimizationInterval: number;
  enableMetrics: boolean;
  metricsInterval: number;
  enableHealthChecks: boolean;
  healthCheckInterval: number;
}

export interface PerformanceMetrics {
  connectionPools: Map<string, any>;
  caches: Map<string, any>;
  processors: Map<string, any>;
  resources: any;
  overall: {
    totalConnections: number;
    totalCacheHits: number;
    totalCacheMisses: number;
    totalJobsProcessed: number;
    totalJobsFailed: number;
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    resourceUtilization: number;
  };
  timestamp: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    connectionPools: { [name: string]: 'healthy' | 'degraded' | 'unhealthy' };
    caches: { [name: string]: 'healthy' | 'degraded' | 'unhealthy' };
    processors: { [name: string]: 'healthy' | 'degraded' | 'unhealthy' };
    resources: 'healthy' | 'degraded' | 'unhealthy';
  };
  issues: string[];
  timestamp: number;
}

export class PerformanceManager {
  private config: PerformanceConfig;
  private connectionPoolManager: ConnectionPoolManager;
  private cacheLayerManager: CacheLayerManager;
  private asyncProcessorManager: AsyncProcessorManager;
  private resourceManagerManager: ResourceManagerManager;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: PerformanceMetrics;
  private optimizationInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      connectionPools: {},
      caches: {},
      processors: {},
      enableMonitoring: true,
      enableOptimization: true,
      optimizationInterval: 60000, // 1 minute
      enableMetrics: true,
      metricsInterval: 10000, // 10 seconds
      enableHealthChecks: true,
      healthCheckInterval: 30000, // 30 seconds
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    // Initialize managers
    this.connectionPoolManager = ConnectionPoolManager.getInstance();
    this.cacheLayerManager = CacheLayerManager.getInstance();
    this.asyncProcessorManager = AsyncProcessorManager.getInstance();
    this.resourceManagerManager = ResourceManagerManager.getInstance();

    this.initializeComponents();
    this.startMonitoring();
  }

  /**
   * Initializes all performance components
   */
  private initializeComponents(): void {
    // Initialize connection pools
    Object.entries(this.config.connectionPools).forEach(([name, poolConfig]) => {
      this.connectionPoolManager.createPool(
        name,
        poolConfig.configs,
        poolConfig.poolConfig
      );
    });

    // Initialize cache layers
    Object.entries(this.config.caches).forEach(([name, cacheConfig]) => {
      this.cacheLayerManager.createCache(name, cacheConfig);
    });

    // Initialize async processors
    Object.entries(this.config.processors).forEach(([name, processorConfig]) => {
      this.asyncProcessorManager.createProcessor(name, processorConfig);
    });

    // Initialize resource manager
    if (this.config.resourceManager) {
      this.resourceManagerManager.createManager('default', this.config.resourceManager);
    }

    this.logger.info('Performance components initialized', {
      connectionPools: Object.keys(this.config.connectionPools).length,
      caches: Object.keys(this.config.caches).length,
      processors: Object.keys(this.config.processors).length
    });
  }

  /**
   * Starts monitoring and optimization
   */
  private startMonitoring(): void {
    if (this.config.enableMetrics) {
      this.metricsInterval = setInterval(() => {
        this.updateMetrics();
      }, this.config.metricsInterval);
    }

    if (this.config.enableOptimization) {
      this.optimizationInterval = setInterval(() => {
        this.performOptimization();
      }, this.config.optimizationInterval);
    }

    if (this.config.enableHealthChecks) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthChecks();
      }, this.config.healthCheckInterval);
    }
  }

  /**
   * Gets a connection pool
   */
  getConnectionPool(name: string): ConnectionPool | undefined {
    return this.connectionPoolManager.getPool(name);
  }

  /**
   * Gets a cache layer
   */
  getCache(name: string): CacheLayer | undefined {
    return this.cacheLayerManager.getCache(name);
  }

  /**
   * Gets an async processor
   */
  getProcessor(name: string): AsyncProcessor | undefined {
    return this.asyncProcessorManager.getProcessor(name);
  }

  /**
   * Gets the resource manager
   */
  getResourceManager(name: string = 'default'): ResourceManager | undefined {
    return this.resourceManagerManager.getManager(name);
  }

  /**
   * Executes an operation with performance optimization
   */
  async executeWithOptimization<T>(
    operation: () => Promise<T>,
    options: {
      useCache?: boolean;
      cacheKey?: string;
      cacheName?: string;
      useConnectionPool?: boolean;
      poolName?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      resourceQuota?: string;
      quotaAmount?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Check resource quota
      if (options.resourceQuota) {
        const resourceManager = this.getResourceManager();
        if (resourceManager) {
          const allowed = await resourceManager.checkQuota(
            options.resourceQuota,
            options.quotaAmount || 1
          );
          if (!allowed) {
            throw new CipherPayError(
              'Resource quota exceeded',
              ErrorType.RATE_LIMIT_EXCEEDED,
              { quota: options.resourceQuota }
            );
          }
        }
      }

      // Try cache first
      if (options.useCache && options.cacheKey) {
        const cacheName = options.cacheName || 'default';
        const cache = this.getCache(cacheName);
        if (cache) {
          const cachedResult = await cache.get<T>(options.cacheKey);
          if (cachedResult !== null) {
            this.logger.debug('Cache hit', {
              cacheKey: options.cacheKey,
              cacheName
            });
            return cachedResult;
          }
        }
      }

      // Execute operation
      let result: T;
      if (options.useConnectionPool && options.poolName) {
        const pool = this.getConnectionPool(options.poolName);
        if (pool) {
          result = await pool.execute(operation);
        } else {
          result = await operation();
        }
      } else {
        result = await operation();
      }

      // Cache result
      if (options.useCache && options.cacheKey) {
        const cacheName = options.cacheName || 'default';
        const cache = this.getCache(cacheName);
        if (cache) {
          await cache.set(options.cacheKey, result);
        }
      }

      // Consume resource quota
      if (options.resourceQuota) {
        const resourceManager = this.getResourceManager();
        if (resourceManager) {
          await resourceManager.consumeQuota(
            options.resourceQuota,
            options.quotaAmount || 1
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.debug('Operation completed with optimization', {
        duration,
        cacheUsed: options.useCache,
        poolUsed: options.useConnectionPool,
        quotaUsed: options.resourceQuota
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Operation failed with optimization', {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheUsed: options.useCache,
        poolUsed: options.useConnectionPool,
        quotaUsed: options.resourceQuota
      });
      throw error;
    }
  }

  /**
   * Submits a job with performance optimization
   */
  async submitJobWithOptimization<T>(
    processorName: string,
    jobType: string,
    data: T,
    options: {
      priority?: 'low' | 'normal' | 'high' | 'critical';
      useCache?: boolean;
      cacheKey?: string;
      cacheName?: string;
      resourceQuota?: string;
      quotaAmount?: number;
    } = {}
  ): Promise<string> {
    const processor = this.getProcessor(processorName);
    if (!processor) {
      throw new CipherPayError(
        `Processor not found: ${processorName}`,
        ErrorType.CONFIGURATION_ERROR
      );
    }

    // Check resource quota
    if (options.resourceQuota) {
      const resourceManager = this.getResourceManager();
      if (resourceManager) {
        const allowed = await resourceManager.checkQuota(
          options.resourceQuota,
          options.quotaAmount || 1
        );
        if (!allowed) {
          throw new CipherPayError(
            'Resource quota exceeded',
            ErrorType.RATE_LIMIT_EXCEEDED,
            { quota: options.resourceQuota }
          );
        }
      }
    }

    // Submit job
    const jobId = await processor.submitJob(jobType, data, {
      priority: options.priority
    });

    // Consume resource quota
    if (options.resourceQuota) {
      const resourceManager = this.getResourceManager();
      if (resourceManager) {
        await resourceManager.consumeQuota(
          options.resourceQuota,
          options.quotaAmount || 1
        );
      }
    }

    this.logger.debug('Job submitted with optimization', {
      jobId,
      processorName,
      jobType,
      priority: options.priority,
      quotaUsed: options.resourceQuota
    });

    return jobId;
  }

  /**
   * Gets performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets health status
   */
  getHealthStatus(): HealthStatus {
    const components = {
      connectionPools: {} as { [name: string]: 'healthy' | 'degraded' | 'unhealthy' },
      caches: {} as { [name: string]: 'healthy' | 'degraded' | 'unhealthy' },
      processors: {} as { [name: string]: 'healthy' | 'degraded' | 'unhealthy' },
      resources: 'healthy' as 'healthy' | 'degraded' | 'unhealthy'
    };

    const issues: string[] = [];

    // Check connection pools
    const pools = this.connectionPoolManager.getAllPools();
    pools.forEach((pool, name) => {
      const metrics = pool.getMetrics();
      if (metrics.healthStatus === 'healthy') {
        components.connectionPools[name] = 'healthy';
      } else if (metrics.healthStatus === 'degraded') {
        components.connectionPools[name] = 'degraded';
        issues.push(`Connection pool ${name} is degraded`);
      } else {
        components.connectionPools[name] = 'unhealthy';
        issues.push(`Connection pool ${name} is unhealthy`);
      }
    });

    // Check caches
    const caches = this.cacheLayerManager.getAllCaches();
    caches.forEach((cache, name) => {
      const metrics = cache.getMetrics();
      if (metrics.hitRate > 0.8) {
        components.caches[name] = 'healthy';
      } else if (metrics.hitRate > 0.5) {
        components.caches[name] = 'degraded';
        issues.push(`Cache ${name} has low hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      } else {
        components.caches[name] = 'unhealthy';
        issues.push(`Cache ${name} has very low hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
      }
    });

    // Check processors
    const processors = this.asyncProcessorManager.getAllProcessors();
    processors.forEach((processor, name) => {
      const metrics = processor.getMetrics();
      if (metrics.errorRate < 0.1) {
        components.processors[name] = 'healthy';
      } else if (metrics.errorRate < 0.3) {
        components.processors[name] = 'degraded';
        issues.push(`Processor ${name} has high error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      } else {
        components.processors[name] = 'unhealthy';
        issues.push(`Processor ${name} has very high error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      }
    });

    // Check resources
    const resourceManager = this.getResourceManager();
    if (resourceManager) {
      const usage = resourceManager.getResourceUsage();
      if (usage.memory.percentage < 80 && usage.cpu.usage < 80) {
        components.resources = 'healthy';
      } else if (usage.memory.percentage < 95 && usage.cpu.usage < 95) {
        components.resources = 'degraded';
        issues.push(`High resource usage: Memory ${usage.memory.percentage.toFixed(1)}%, CPU ${usage.cpu.usage.toFixed(1)}%`);
      } else {
        components.resources = 'unhealthy';
        issues.push(`Critical resource usage: Memory ${usage.memory.percentage.toFixed(1)}%, CPU ${usage.cpu.usage.toFixed(1)}%`);
      }
    }

    // Determine overall status
    const hasUnhealthy = Object.values(components).some(component => 
      typeof component === 'string' ? component === 'unhealthy' : 
      Object.values(component).some(status => status === 'unhealthy')
    );
    
    const hasDegraded = Object.values(components).some(component => 
      typeof component === 'string' ? component === 'degraded' : 
      Object.values(component).some(status => status === 'degraded')
    );

    const status = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    return {
      status,
      components,
      issues,
      timestamp: Date.now()
    };
  }

  /**
   * Updates performance metrics
   */
  private updateMetrics(): void {
    const connectionPools = new Map();
    const caches = new Map();
    const processors = new Map();

    // Collect connection pool metrics
    this.connectionPoolManager.getAllPools().forEach((pool, name) => {
      connectionPools.set(name, pool.getMetrics());
    });

    // Collect cache metrics
    this.cacheLayerManager.getAllCaches().forEach((cache, name) => {
      caches.set(name, cache.getMetrics());
    });

    // Collect processor metrics
    this.asyncProcessorManager.getAllProcessors().forEach((processor, name) => {
      processors.set(name, processor.getMetrics());
    });

    // Calculate overall metrics
    let totalConnections = 0;
    let totalCacheHits = 0;
    let totalCacheMisses = 0;
    let totalJobsProcessed = 0;
    let totalJobsFailed = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    connectionPools.forEach(metrics => {
      totalConnections += metrics.totalConnections;
      totalResponseTime += metrics.averageResponseTime;
      responseTimeCount++;
    });

    caches.forEach(metrics => {
      totalCacheHits += metrics.hitCount;
      totalCacheMisses += metrics.missCount;
    });

    processors.forEach(metrics => {
      totalJobsProcessed += metrics.completedJobs;
      totalJobsFailed += metrics.failedJobs;
    });

    const resourceManager = this.getResourceManager();
    const resourceUtilization = resourceManager ? 
      (resourceManager.getResourceUsage().memory.percentage + 
       resourceManager.getResourceUsage().cpu.usage) / 2 : 0;

    this.metrics = {
      connectionPools,
      caches,
      processors,
      resources: resourceManager ? resourceManager.getMetrics() : null,
      overall: {
        totalConnections,
        totalCacheHits,
        totalCacheMisses,
        totalJobsProcessed,
        totalJobsFailed,
        averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
        throughput: totalJobsProcessed / 10, // jobs per second over last 10 seconds
        errorRate: (totalJobsProcessed + totalJobsFailed) > 0 ? 
          totalJobsFailed / (totalJobsProcessed + totalJobsFailed) : 0,
        resourceUtilization
      },
      timestamp: Date.now()
    };
  }

  /**
   * Performs performance optimization
   */
  private performOptimization(): void {
    this.logger.debug('Performing performance optimization');

    // Optimize connection pools
    this.connectionPoolManager.getAllPools().forEach((pool, name) => {
      const metrics = pool.getMetrics();
      if (metrics.healthStatus === 'unhealthy') {
        this.logger.warn('Connection pool needs attention', { poolName: name });
      }
    });

    // Optimize caches
    this.cacheLayerManager.getAllCaches().forEach((cache, name) => {
      const metrics = cache.getMetrics();
      if (metrics.hitRate < 0.5) {
        this.logger.warn('Cache has low hit rate, consider tuning', {
          cacheName: name,
          hitRate: metrics.hitRate
        });
      }
    });

    // Optimize processors
    this.asyncProcessorManager.getAllProcessors().forEach((processor, name) => {
      const metrics = processor.getMetrics();
      if (metrics.errorRate > 0.2) {
        this.logger.warn('Processor has high error rate', {
          processorName: name,
          errorRate: metrics.errorRate
        });
      }
    });

    // Optimize resources
    const resourceManager = this.getResourceManager();
    if (resourceManager) {
      const usage = resourceManager.getResourceUsage();
      if (usage.memory.percentage > 90 || usage.cpu.usage > 90) {
        this.logger.warn('High resource usage detected', {
          memory: usage.memory.percentage,
          cpu: usage.cpu.usage
        });
      }
    }
  }

  /**
   * Performs health checks
   */
  private performHealthChecks(): void {
    const health = this.getHealthStatus();
    
    if (health.status === 'unhealthy') {
      this.logger.error('Performance system is unhealthy', {
        issues: health.issues
      });
    } else if (health.status === 'degraded') {
      this.logger.warn('Performance system is degraded', {
        issues: health.issues
      });
    } else {
      this.logger.debug('Performance system is healthy');
    }
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      connectionPools: new Map(),
      caches: new Map(),
      processors: new Map(),
      resources: null,
      overall: {
        totalConnections: 0,
        totalCacheHits: 0,
        totalCacheMisses: 0,
        totalJobsProcessed: 0,
        totalJobsFailed: 0,
        averageResponseTime: 0,
        throughput: 0,
        errorRate: 0,
        resourceUtilization: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * Closes the performance manager
   */
  async close(): Promise<void> {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close all managers
    await Promise.allSettled([
      this.connectionPoolManager.closeAll(),
      this.cacheLayerManager.closeAll(),
      this.asyncProcessorManager.closeAll(),
      this.resourceManagerManager.closeAll()
    ]);

    this.logger.info('Performance manager closed');
  }
} 