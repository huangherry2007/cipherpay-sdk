import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';
import { CircuitBreaker, CircuitBreakerManager, CircuitBreakerConfig } from './CircuitBreaker';
import { RetryManager, RetryConfig, RetryResult } from './RetryManager';
import { GracefulDegradation, ServiceLevel, FallbackStrategy } from './GracefulDegradation';
import { DataConsistencyChecker, ConsistencyRule, ConsistencyReport } from './DataConsistencyChecker';

export interface ResilienceConfig {
  // Circuit breaker configuration
  circuitBreaker: Partial<CircuitBreakerConfig>;

  // Retry configuration
  retry: Partial<RetryConfig>;

  // Graceful degradation configuration
  degradation: {
    enableFallbacks: boolean;
    autoRecovery: boolean;
    checkInterval: number;
  };

  // Data consistency configuration
  consistency: {
    enableAutoRepair: boolean;
    enableValidation: boolean;
    checkInterval: number;
  };

  // General resilience settings
  enableMonitoring: boolean;
  enableMetrics: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface ResilienceMetrics {
  circuitBreakers: Record<string, any>;
  retryMetrics: Record<string, any>;
  serviceHealth: Record<string, any>;
  consistencyChecks: Record<string, any>;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  timestamp: number;
}

export interface ResilienceOperation {
  name: string;
  service: string;
  operation: () => Promise<any>;
  context?: Record<string, any>;
  options?: {
    useCircuitBreaker?: boolean;
    useRetry?: boolean;
    useFallbacks?: boolean;
    validateData?: boolean;
    circuitBreakerName?: string;
    retryConfig?: Partial<RetryConfig>;
    consistencyRules?: ConsistencyRule[];
  };
}

export class ResilienceManager {
  private static instance: ResilienceManager;
  private config: ResilienceConfig;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private circuitBreakerManager: CircuitBreakerManager;
  private retryManager: RetryManager;
  private gracefulDegradation: GracefulDegradation;
  private dataConsistencyChecker: DataConsistencyChecker;
  private operationHistory: Map<string, any[]> = new Map();

  private constructor(config: Partial<ResilienceConfig> = {}) {
    this.config = {
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        timeoutThreshold: 10000
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      },
      degradation: {
        enableFallbacks: true,
        autoRecovery: true,
        checkInterval: 30000
      },
      consistency: {
        enableAutoRepair: true,
        enableValidation: true,
        checkInterval: 60000
      },
      enableMonitoring: true,
      enableMetrics: true,
      logLevel: 'info',
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.circuitBreakerManager = CircuitBreakerManager.getInstance();
    this.retryManager = new RetryManager(this.config.retry);
    this.gracefulDegradation = new GracefulDegradation(this.config.degradation);
    this.dataConsistencyChecker = new DataConsistencyChecker(this.config.consistency);

    this.logger.info('Resilience manager initialized', {
      config: this.config
    });
  }

  static getInstance(config?: Partial<ResilienceConfig>): ResilienceManager {
    if (!ResilienceManager.instance) {
      ResilienceManager.instance = new ResilienceManager(config);
    }
    return ResilienceManager.instance;
  }

  /**
   * Executes an operation with full resilience protection
   */
  async execute<T>(operation: ResilienceOperation): Promise<T> {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    this.logger.debug('Executing resilient operation', {
      operationId,
      operationName: operation.name,
      service: operation.service,
      options: operation.options
    });

    try {
      let result: T;

      // Step 1: Data validation (if enabled)
      if (operation.options?.validateData && operation.options?.consistencyRules) {
        const validationResult = await this.validateOperationData(operation);
        if (validationResult.overallStatus === 'critical') {
          throw new CipherPayError(
            'Critical data validation failed',
            ErrorType.INVALID_INPUT,
            { operationName: operation.name, validationResult }
          );
        }
      }

      // Step 2: Circuit breaker protection (if enabled)
      if (operation.options?.useCircuitBreaker) {
        const circuitName = operation.options.circuitBreakerName || `${operation.service}_${operation.name}`;
        const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(circuitName, this.config.circuitBreaker);

        const retryResult = await circuitBreaker.execute(async () => {
          return this.executeWithRetry<T>(operation);
        }, operation.context);
        if (!retryResult.success || !retryResult.data) {
          throw retryResult.error || new Error('Operation failed after retries');
        }
        result = retryResult.data as T;
      } else {
        // Step 3: Retry mechanism (if enabled)
        if (operation.options?.useRetry) {
          const retryResult = await this.executeWithRetry<T>(operation);
          if (!retryResult.success || !retryResult.data) {
            throw retryResult.error || new Error('Operation failed after retries');
          }
          result = retryResult.data as T;
        } else {
          // Step 4: Direct execution with graceful degradation
          result = await this.executeWithGracefulDegradation(operation);
        }
      }

      // Step 5: Post-execution validation
      if (operation.options?.validateData && operation.options?.consistencyRules) {
        await this.validateOperationResult(result, operation.options.consistencyRules);
      }

      // Record successful operation
      this.recordOperation(operationId, operation, 'success', Date.now() - startTime);

      this.logger.info('Resilient operation completed successfully', {
        operationId,
        operationName: operation.name,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      // Record failed operation
      this.recordOperation(operationId, operation, 'failed', Date.now() - startTime, error);

      this.logger.error('Resilient operation failed', {
        operationId,
        operationName: operation.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Executes operation with retry mechanism
   */
  private async executeWithRetry<T>(operation: ResilienceOperation): Promise<RetryResult<T>> {
    const retryConfig = operation.options?.retryConfig || this.config.retry;
    const retryManager = new RetryManager(retryConfig);

    return retryManager.execute(operation.operation, operation.context);
  }

  /**
   * Executes operation with graceful degradation
   */
  private async executeWithGracefulDegradation<T>(operation: ResilienceOperation): Promise<T> {
    return this.gracefulDegradation.execute(
      operation.service,
      operation.operation,
      operation.context
    );
  }

  /**
   * Validates operation data before execution
   */
  private async validateOperationData(operation: ResilienceOperation): Promise<ConsistencyReport> {
    const data = operation.context?.data;
    if (!data) {
      return {
        overallStatus: 'healthy',
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        criticalFailures: 0,
        warnings: 0,
        checks: [],
        timestamp: Date.now(),
        duration: 0
      };
    }

    // Register rules temporarily
    const rules = operation.options?.consistencyRules || [];
    rules.forEach(rule => {
      this.dataConsistencyChecker.registerRule(rule);
    });

    return this.dataConsistencyChecker.validateData(data, operation.context);
  }

  /**
   * Validates operation result after execution
   */
  private async validateOperationResult<T>(result: T, rules: ConsistencyRule[]): Promise<void> {
    if (!rules.length) return;

    // Register rules temporarily
    rules.forEach(rule => {
      this.dataConsistencyChecker.registerRule(rule);
    });

    const report = await this.dataConsistencyChecker.validateData(result);

    if (report.overallStatus === 'critical') {
      throw new CipherPayError(
        'Operation result validation failed',
        ErrorType.INVALID_INPUT,
        { validationReport: report }
      );
    }
  }

  /**
   * Records operation in history
   */
  private recordOperation(
    operationId: string,
    operation: ResilienceOperation,
    status: 'success' | 'failed',
    duration: number,
    error?: any
  ): void {
    const record = {
      operationId,
      operationName: operation.name,
      service: operation.service,
      status,
      duration,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : undefined
    };

    if (!this.operationHistory.has(operation.service)) {
      this.operationHistory.set(operation.service, []);
    }

    const history = this.operationHistory.get(operation.service)!;
    history.push(record);

    // Keep only last 100 operations per service
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Registers a fallback strategy for a service
   */
  registerFallback(serviceName: string, strategy: FallbackStrategy): void {
    this.gracefulDegradation.registerFallback(serviceName, strategy);
  }

  /**
   * Registers a consistency rule
   */
  registerConsistencyRule(rule: ConsistencyRule): void {
    this.dataConsistencyChecker.registerRule(rule);
  }

  /**
   * Gets comprehensive resilience metrics
   */
  getMetrics(): ResilienceMetrics {
    const circuitBreakers = this.circuitBreakerManager.getAllMetrics();
    const retryMetrics = this.retryManager.getAllMetrics();
    const serviceHealth = this.gracefulDegradation.getAllServiceHealth();
    const consistencyChecks = this.dataConsistencyChecker.getCheckHistory(10);

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';

    // Check circuit breakers
    for (const metrics of Object.values(circuitBreakers)) {
      if (metrics.currentFailureRate > 0.5) {
        overallHealth = 'critical';
        break;
      } else if (metrics.currentFailureRate > 0.2) {
        overallHealth = 'degraded';
      }
    }

    // Check service health
    for (const health of Object.values(serviceHealth)) {
      if (!health.isHealthy) {
        overallHealth = overallHealth === 'healthy' ? 'degraded' : 'critical';
      }
    }

    // Check consistency
    const criticalConsistencyFailures = consistencyChecks.filter(
      check => check.severity === 'critical' && !check.passed
    ).length;

    if (criticalConsistencyFailures > 0) {
      overallHealth = 'critical';
    }

    return {
      circuitBreakers,
      retryMetrics,
      serviceHealth,
      consistencyChecks: consistencyChecks.reduce((acc, check) => {
        if (!acc[check.ruleName]) {
          acc[check.ruleName] = { passed: 0, failed: 0, total: 0 };
        }
        acc[check.ruleName].total++;
        if (check.passed) {
          acc[check.ruleName].passed++;
        } else {
          acc[check.ruleName].failed++;
        }
        return acc;
      }, {} as Record<string, any>),
      overallHealth,
      timestamp: Date.now()
    };
  }

  /**
   * Gets operation history for a service
   */
  getOperationHistory(serviceName: string, limit?: number): any[] {
    const history = this.operationHistory.get(serviceName) || [];
    return limit ? history.slice(-limit) : [...history];
  }

  /**
   * Resets all resilience components
   */
  reset(): void {
    this.circuitBreakerManager.resetAll();
    this.retryManager.resetMetrics();
    this.gracefulDegradation.resetHealth();
    this.dataConsistencyChecker.clearCheckHistory();
    this.dataConsistencyChecker.resetRepairHistory();
    this.operationHistory.clear();

    this.logger.info('All resilience components reset');
  }

  /**
   * Starts monitoring for all resilience components
   */
  startMonitoring(): void {
    this.gracefulDegradation.startMonitoring();

    this.logger.info('Resilience monitoring started');
  }

  /**
   * Stops monitoring for all resilience components
   */
  stopMonitoring(): void {
    this.gracefulDegradation.stopMonitoring();

    this.logger.info('Resilience monitoring stopped');
  }

  /**
   * Updates resilience configuration
   */
  updateConfig(config: Partial<ResilienceConfig>): void {
    this.config = { ...this.config, ...config };

    // Update component configurations
    this.retryManager.updateConfig(config.retry || {});

    this.logger.info('Resilience configuration updated', {
      config: this.config
    });
  }

  /**
   * Generates unique operation ID
   */
  private generateOperationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Convenience functions for common resilience patterns
 */
export class ResiliencePatterns {
  /**
   * Creates a resilient API call with circuit breaker and retry
   */
  static apiCall<T>(
    serviceName: string,
    operationName: string,
    apiCall: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const manager = ResilienceManager.getInstance();

    return manager.execute({
      name: operationName,
      service: serviceName,
      operation: apiCall,
      context,
      options: {
        useCircuitBreaker: true,
        useRetry: true,
        useFallbacks: true,
        circuitBreakerName: `${serviceName}_api`,
        retryConfig: {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 10000
        }
      }
    });
  }

  /**
   * Creates a resilient database operation with consistency checks
   */
  static databaseOperation<T>(
    serviceName: string,
    operationName: string,
    dbOperation: () => Promise<T>,
    consistencyRules?: ConsistencyRule[],
    context?: Record<string, any>
  ): Promise<T> {
    const manager = ResilienceManager.getInstance();

    return manager.execute({
      name: operationName,
      service: serviceName,
      operation: dbOperation,
      context,
      options: {
        useCircuitBreaker: true,
        useRetry: true,
        validateData: true,
        consistencyRules
      }
    });
  }

  /**
   * Creates a resilient file operation with fallbacks
   */
  static fileOperation<T>(
    serviceName: string,
    operationName: string,
    fileOperation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const manager = ResilienceManager.getInstance();

    return manager.execute({
      name: operationName,
      service: serviceName,
      operation: fileOperation,
      context,
      options: {
        useRetry: true,
        useFallbacks: true,
        retryConfig: {
          maxAttempts: 2,
          baseDelay: 500,
          maxDelay: 2000
        }
      }
    });
  }
} 