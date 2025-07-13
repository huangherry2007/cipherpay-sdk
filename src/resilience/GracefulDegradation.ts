import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export enum ServiceLevel {
  FULL = 'FULL',           // All features available
  DEGRADED = 'DEGRADED',   // Some features unavailable
  LIMITED = 'LIMITED',     // Only essential features
  EMERGENCY = 'EMERGENCY'  // Minimal functionality
}

export interface FallbackStrategy {
  name: string;
  description: string;
  serviceLevel: ServiceLevel;
  isAvailable: () => boolean | Promise<boolean>;
  execute: (...args: any[]) => Promise<any>;
  priority: number; // Lower number = higher priority
}

export interface DegradationConfig {
  checkInterval: number;        // How often to check service health (ms)
  degradationThreshold: number; // Number of failures before degrading
  recoveryThreshold: number;    // Number of successes before recovering
  monitoringWindow: number;     // Time window for health monitoring (ms)
  enableFallbacks: boolean;     // Whether to enable fallback strategies
  autoRecovery: boolean;        // Whether to automatically recover
}

export interface ServiceHealth {
  serviceName: string;
  isHealthy: boolean;
  lastCheck: number;
  failureCount: number;
  successCount: number;
  currentLevel: ServiceLevel;
  fallbackActive: boolean;
}

export class GracefulDegradation {
  private config: DegradationConfig;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private fallbackStrategies: Map<string, FallbackStrategy[]> = new Map();
  private currentServiceLevel: ServiceLevel = ServiceLevel.FULL;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: Partial<DegradationConfig> = {}) {
    this.config = {
      checkInterval: 30000, // 30 seconds
      degradationThreshold: 3,
      recoveryThreshold: 5,
      monitoringWindow: 300000, // 5 minutes
      enableFallbacks: true,
      autoRecovery: true,
      ...config
    };
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Registers a fallback strategy for a service
   */
  registerFallback(serviceName: string, strategy: FallbackStrategy): void {
    if (!this.fallbackStrategies.has(serviceName)) {
      this.fallbackStrategies.set(serviceName, []);
    }
    
    const strategies = this.fallbackStrategies.get(serviceName)!;
    strategies.push(strategy);
    
    // Sort by priority (lower number = higher priority)
    strategies.sort((a, b) => a.priority - b.priority);
    
    this.logger.info('Fallback strategy registered', {
      serviceName,
      strategyName: strategy.name,
      priority: strategy.priority,
      serviceLevel: strategy.serviceLevel
    });
  }

  /**
   * Executes an operation with graceful degradation
   */
  async execute<T>(
    serviceName: string,
    primaryOperation: () => Promise<T>,
    context: Record<string, any> = {}
  ): Promise<T> {
    const health = this.getOrCreateHealth(serviceName);
    
    try {
      // Try primary operation first
      const result = await primaryOperation();
      
      // Record success
      this.recordSuccess(serviceName);
      
      // Check if we can recover to a higher service level
      if (this.config.autoRecovery) {
        this.checkRecovery(serviceName);
      }
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(serviceName, error);
      
      // Check if we need to degrade
      if (this.shouldDegrade(serviceName)) {
        this.degradeService(serviceName);
      }
      
      // Try fallback strategies
      if (this.config.enableFallbacks) {
        const fallbackResult = await this.tryFallbacks(serviceName, context);
        if (fallbackResult) {
          return fallbackResult;
        }
      }
      
      // If no fallbacks available, throw the original error
      throw error;
    }
  }

  /**
   * Tries fallback strategies in order of priority
   */
  private async tryFallbacks(serviceName: string, context: Record<string, any>): Promise<any> {
    const strategies = this.fallbackStrategies.get(serviceName) || [];
    
    for (const strategy of strategies) {
      try {
        // Check if strategy is available
        const isAvailable = await strategy.isAvailable();
        if (!isAvailable) {
          this.logger.debug('Fallback strategy not available', {
            serviceName,
            strategyName: strategy.name
          });
          continue;
        }
        
        // Check if strategy is compatible with current service level
        if (this.getServiceLevelValue(strategy.serviceLevel) > this.getServiceLevelValue(this.currentServiceLevel)) {
          this.logger.debug('Fallback strategy not compatible with current service level', {
            serviceName,
            strategyName: strategy.name,
            strategyLevel: strategy.serviceLevel,
            currentLevel: this.currentServiceLevel
          });
          continue;
        }
        
        this.logger.info('Using fallback strategy', {
          serviceName,
          strategyName: strategy.name,
          serviceLevel: strategy.serviceLevel
        });
        
        // Execute fallback strategy
        const result = await strategy.execute(context);
        
        // Mark fallback as active
        const health = this.getOrCreateHealth(serviceName);
        health.fallbackActive = true;
        
        return result;
      } catch (error) {
        this.logger.warn('Fallback strategy failed', {
          serviceName,
          strategyName: strategy.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        continue;
      }
    }
    
    return null;
  }

  /**
   * Records a successful operation
   */
  private recordSuccess(serviceName: string): void {
    const health = this.getOrCreateHealth(serviceName);
    health.successCount++;
    health.lastCheck = Date.now();
    
    // Reset failure count on success
    if (health.successCount >= this.config.recoveryThreshold) {
      health.failureCount = 0;
    }
  }

  /**
   * Records a failed operation
   */
  private recordFailure(serviceName: string, error: any): void {
    const health = this.getOrCreateHealth(serviceName);
    health.failureCount++;
    health.lastCheck = Date.now();
    health.isHealthy = false;
    
    this.logger.warn('Service operation failed', {
      serviceName,
      failureCount: health.failureCount,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  /**
   * Determines if service should degrade
   */
  private shouldDegrade(serviceName: string): boolean {
    const health = this.getOrCreateHealth(serviceName);
    return health.failureCount >= this.config.degradationThreshold;
  }

  /**
   * Degrades service to a lower level
   */
  private degradeService(serviceName: string): void {
    const health = this.getOrCreateHealth(serviceName);
    const currentLevel = this.currentServiceLevel;
    
    // Determine new service level based on available fallbacks
    const strategies = this.fallbackStrategies.get(serviceName) || [];
    const availableLevels = strategies
      .map(s => s.serviceLevel)
      .filter(level => this.getServiceLevelValue(level) <= this.getServiceLevelValue(currentLevel))
      .sort((a, b) => this.getServiceLevelValue(b) - this.getServiceLevelValue(a));
    
    if (availableLevels.length > 0) {
      this.currentServiceLevel = availableLevels[0];
    } else {
      // No fallbacks available, degrade to emergency mode
      this.currentServiceLevel = ServiceLevel.EMERGENCY;
    }
    
    this.logger.warn('Service degraded', {
      serviceName,
      previousLevel: currentLevel,
      newLevel: this.currentServiceLevel,
      failureCount: health.failureCount
    });
  }

  /**
   * Checks if service can recover to a higher level
   */
  private checkRecovery(serviceName: string): void {
    const health = this.getOrCreateHealth(serviceName);
    
    if (health.successCount >= this.config.recoveryThreshold && health.failureCount === 0) {
      const previousLevel = this.currentServiceLevel;
      
      // Try to recover to the next higher level
      const levels = [ServiceLevel.EMERGENCY, ServiceLevel.LIMITED, ServiceLevel.DEGRADED, ServiceLevel.FULL];
      const currentIndex = levels.indexOf(this.currentServiceLevel);
      
      if (currentIndex < levels.length - 1) {
        this.currentServiceLevel = levels[currentIndex + 1];
        
        this.logger.info('Service recovered', {
          serviceName,
          previousLevel,
          newLevel: this.currentServiceLevel,
          successCount: health.successCount
        });
      }
      
      // Reset success count
      health.successCount = 0;
    }
  }

  /**
   * Gets or creates health record for a service
   */
  private getOrCreateHealth(serviceName: string): ServiceHealth {
    if (!this.serviceHealth.has(serviceName)) {
      this.serviceHealth.set(serviceName, {
        serviceName,
        isHealthy: true,
        lastCheck: Date.now(),
        failureCount: 0,
        successCount: 0,
        currentLevel: ServiceLevel.FULL,
        fallbackActive: false
      });
    }
    return this.serviceHealth.get(serviceName)!;
  }

  /**
   * Gets service level value for comparison
   */
  private getServiceLevelValue(level: ServiceLevel): number {
    switch (level) {
      case ServiceLevel.FULL: return 4;
      case ServiceLevel.DEGRADED: return 3;
      case ServiceLevel.LIMITED: return 2;
      case ServiceLevel.EMERGENCY: return 1;
      default: return 0;
    }
  }

  /**
   * Starts health monitoring
   */
  startMonitoring(): void {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.checkInterval);
    
    this.logger.info('Graceful degradation monitoring started', {
      checkInterval: this.config.checkInterval
    });
  }

  /**
   * Stops health monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      
      this.logger.info('Graceful degradation monitoring stopped');
    }
  }

  /**
   * Performs health checks on all services
   */
  private async performHealthChecks(): Promise<void> {
    for (const [serviceName, health] of this.serviceHealth.entries()) {
      const cutoffTime = Date.now() - this.config.monitoringWindow;
      
      // Reset counters if outside monitoring window
      if (health.lastCheck < cutoffTime) {
        health.failureCount = 0;
        health.successCount = 0;
      }
      
      // Update health status
      health.isHealthy = health.failureCount < this.config.degradationThreshold;
      health.currentLevel = this.currentServiceLevel;
    }
  }

  /**
   * Gets current service level
   */
  getCurrentServiceLevel(): ServiceLevel {
    return this.currentServiceLevel;
  }

  /**
   * Gets health status for all services
   */
  getAllServiceHealth(): Record<string, ServiceHealth> {
    const result: Record<string, ServiceHealth> = {};
    for (const [serviceName, health] of this.serviceHealth.entries()) {
      result[serviceName] = { ...health };
    }
    return result;
  }

  /**
   * Manually sets service level
   */
  setServiceLevel(level: ServiceLevel): void {
    const previousLevel = this.currentServiceLevel;
    this.currentServiceLevel = level;
    
    this.logger.info('Service level manually changed', {
      previousLevel,
      newLevel: level
    });
  }

  /**
   * Resets all health records
   */
  resetHealth(): void {
    this.serviceHealth.clear();
    this.currentServiceLevel = ServiceLevel.FULL;
    
    this.logger.info('All service health records reset');
  }
}

/**
 * Predefined fallback strategies
 */
export class FallbackStrategies {
  /**
   * Local storage fallback for data persistence
   */
  static localStorage(serviceName: string): FallbackStrategy {
    return {
      name: 'localStorage',
      description: 'Use browser local storage for data persistence',
      serviceLevel: ServiceLevel.LIMITED,
      priority: 1,
      isAvailable: () => {
        try {
          return typeof window !== 'undefined' && window.localStorage !== undefined;
        } catch {
          return false;
        }
      },
      execute: async (context: any) => {
        const { operation, key, data } = context;
        
        switch (operation) {
          case 'get':
            return localStorage.getItem(key);
          case 'set':
            localStorage.setItem(key, JSON.stringify(data));
            return true;
          case 'delete':
            localStorage.removeItem(key);
            return true;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      }
    };
  }

  /**
   * Memory cache fallback for data storage
   */
  static memoryCache(serviceName: string): FallbackStrategy {
    const cache = new Map();
    
    return {
      name: 'memoryCache',
      description: 'Use in-memory cache for data storage',
      serviceLevel: ServiceLevel.DEGRADED,
      priority: 2,
      isAvailable: () => true,
      execute: async (context: any) => {
        const { operation, key, data, ttl } = context;
        
        switch (operation) {
          case 'get':
            const item = cache.get(key);
            if (!item) return null;
            
            if (item.expiry && Date.now() > item.expiry) {
              cache.delete(key);
              return null;
            }
            
            return item.data;
          case 'set':
            cache.set(key, {
              data,
              expiry: ttl ? Date.now() + ttl : null
            });
            return true;
          case 'delete':
            cache.delete(key);
            return true;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      }
    };
  }

  /**
   * Offline mode fallback for network operations
   */
  static offlineMode(serviceName: string): FallbackStrategy {
    return {
      name: 'offlineMode',
      description: 'Operate in offline mode with queued operations',
      serviceLevel: ServiceLevel.EMERGENCY,
      priority: 3,
      isAvailable: () => true,
      execute: async (context: any) => {
        const { operation, data } = context;
        
        // Queue operation for later execution
        const queue = this.getOfflineQueue();
        queue.push({
          operation,
          data,
          timestamp: Date.now(),
          serviceName
        });
        
        // Store queue in localStorage
        try {
          localStorage.setItem('offlineQueue', JSON.stringify(queue));
        } catch (error) {
          console.warn('Failed to store offline queue:', error);
        }
        
        return {
          queued: true,
          queueLength: queue.length,
          message: 'Operation queued for later execution'
        };
      }
    };
  }

  /**
   * Gets offline operation queue
   */
  private static getOfflineQueue(): any[] {
    try {
      const stored = localStorage.getItem('offlineQueue');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
} 