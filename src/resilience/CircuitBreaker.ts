import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export enum CircuitState {
  CLOSED = 'CLOSED',      // Normal operation
  OPEN = 'OPEN',          // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;        // Number of failures before opening circuit
  recoveryTimeout: number;         // Time to wait before attempting recovery (ms)
  expectedResponseTime: number;    // Expected response time threshold (ms)
  monitoringWindow: number;        // Time window for failure counting (ms)
  minimumRequestCount: number;     // Minimum requests before considering failure rate
  successThreshold: number;        // Number of successful requests to close circuit
  timeoutThreshold: number;        // Timeout threshold for requests (ms)
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  currentFailureRate: number;
  averageResponseTime: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  stateChangeCount: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private lastStateChangeTime: number = Date.now();
  private requestStartTimes: Map<string, number> = new Map();
  private responseTimes: number[] = [];
  private config: CircuitBreakerConfig;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private name: string;

  constructor(
    name: string,
    config: Partial<CircuitBreakerConfig> = {},
    logger?: Logger
  ) {
    this.name = name;
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      expectedResponseTime: 5000, // 5 seconds
      monitoringWindow: 60000, // 1 minute
      minimumRequestCount: 10,
      successThreshold: 3,
      timeoutThreshold: 10000, // 10 seconds
      ...config
    };
    this.logger = logger || Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Executes a function with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: Record<string, any> = {}
  ): Promise<T> {
    const requestId = this.generateRequestId();
    
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw this.createCircuitOpenError(context);
      }
    }

    // Record request start time
    this.requestStartTimes.set(requestId, Date.now());

    try {
      // Execute the operation with timeout
      const result = await this.executeWithTimeout(operation, requestId);
      
      // Record success
      this.recordSuccess(requestId);
      
      // If in half-open state, transition to closed
      if (this.state === CircuitState.HALF_OPEN) {
        this.transitionToClosed();
      }
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(requestId, error);
      
      // Check if circuit should open
      if (this.shouldOpenCircuit()) {
        this.transitionToOpen();
      }
      
      throw error;
    }
  }

  /**
   * Executes operation with timeout protection
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    requestId: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Operation timeout'));
      }, this.config.timeoutThreshold);
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  /**
   * Records a successful operation
   */
  private recordSuccess(requestId: string): void {
    const startTime = this.requestStartTimes.get(requestId);
    if (startTime) {
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      
      // Keep only recent response times
      if (this.responseTimes.length > 100) {
        this.responseTimes.shift();
      }
    }

    this.successCount++;
    this.lastSuccessTime = Date.now();
    
    this.logger.debug('Circuit breaker success recorded', {
      circuitName: this.name,
      successCount: this.successCount,
      responseTime: startTime ? Date.now() - startTime : undefined
    });
  }

  /**
   * Records a failed operation
   */
  private recordFailure(requestId: string, error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    this.logger.warn('Circuit breaker failure recorded', {
      circuitName: this.name,
      failureCount: this.failureCount,
      error: error instanceof Error ? error.message : 'Unknown error',
      state: this.state
    });
  }

  /**
   * Determines if circuit should open based on failure rate
   */
  private shouldOpenCircuit(): boolean {
    const totalRequests = this.successCount + this.failureCount;
    
    if (totalRequests < this.config.minimumRequestCount) {
      return false;
    }

    const failureRate = this.failureCount / totalRequests;
    const recentFailures = this.getRecentFailures();
    
    return (
      failureRate > 0.5 || // More than 50% failure rate
      recentFailures >= this.config.failureThreshold // Too many recent failures
    );
  }

  /**
   * Gets number of failures in the monitoring window
   */
  private getRecentFailures(): number {
    const cutoffTime = Date.now() - this.config.monitoringWindow;
    return this.lastFailureTime > cutoffTime ? this.failureCount : 0;
  }

  /**
   * Determines if circuit should attempt reset
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastStateChangeTime >= this.config.recoveryTimeout;
  }

  /**
   * Transitions circuit to open state
   */
  private transitionToOpen(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.lastStateChangeTime = Date.now();
      
      this.logger.warn('Circuit breaker opened', {
        circuitName: this.name,
        failureCount: this.failureCount,
        failureRate: this.getFailureRate()
      });
    }
  }

  /**
   * Transitions circuit to half-open state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.lastStateChangeTime = Date.now();
    this.successCount = 0;
    this.failureCount = 0;
    
    this.logger.info('Circuit breaker half-open', {
      circuitName: this.name
    });
  }

  /**
   * Transitions circuit to closed state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.lastStateChangeTime = Date.now();
    this.successCount = 0;
    this.failureCount = 0;
    
    this.logger.info('Circuit breaker closed', {
      circuitName: this.name
    });
  }

  /**
   * Creates circuit open error
   */
  private createCircuitOpenError(context: Record<string, any>): CipherPayError {
    return new CipherPayError(
      `Circuit breaker '${this.name}' is open`,
      ErrorType.CIRCUIT_BREAKER_OPEN,
      {
        circuitName: this.name,
        state: this.state,
        lastFailureTime: this.lastFailureTime,
        recoveryTimeout: this.config.recoveryTimeout,
        ...context
      },
      {
        action: 'Wait for circuit to recover',
        description: `The service is temporarily unavailable. Please wait ${Math.ceil(this.config.recoveryTimeout / 1000)} seconds before retrying.`
      },
      true
    );
  }

  /**
   * Gets current failure rate
   */
  private getFailureRate(): number {
    const total = this.successCount + this.failureCount;
    return total > 0 ? this.failureCount / total : 0;
  }

  /**
   * Gets current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const totalRequests = this.successCount + this.failureCount;
    const averageResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : 0;

    return {
      totalRequests,
      successfulRequests: this.successCount,
      failedRequests: this.failureCount,
      timeoutRequests: 0, // TODO: Track timeouts separately
      currentFailureRate: this.getFailureRate(),
      averageResponseTime,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangeCount: 0 // TODO: Track state changes
    };
  }

  /**
   * Gets current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually resets the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChangeTime = Date.now();
    
    this.logger.info('Circuit breaker manually reset', {
      circuitName: this.name
    });
  }

  /**
   * Generates unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Gets or creates a circuit breaker
   */
  getCircuitBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(name, config, this.logger));
    }
    return this.circuitBreakers.get(name)!;
  }

  /**
   * Gets all circuit breakers
   */
  getAllCircuitBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Gets metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, circuit] of this.circuitBreakers) {
      metrics[name] = circuit.getMetrics();
    }
    return metrics;
  }

  /**
   * Resets all circuit breakers
   */
  resetAll(): void {
    for (const circuit of this.circuitBreakers.values()) {
      circuit.reset();
    }
    this.logger.info('All circuit breakers reset');
  }
} 