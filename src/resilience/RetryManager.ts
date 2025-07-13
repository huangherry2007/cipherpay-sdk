import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface RetryConfig {
  maxAttempts: number;           // Maximum number of retry attempts
  baseDelay: number;             // Base delay in milliseconds
  maxDelay: number;              // Maximum delay in milliseconds
  backoffMultiplier: number;     // Exponential backoff multiplier
  jitterFactor: number;          // Jitter factor (0-1) for randomization
  timeout: number;               // Timeout for each attempt in milliseconds
  retryableErrors: string[];     // Error types that should be retried
  nonRetryableErrors: string[];  // Error types that should not be retried
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
  lastAttemptDuration: number;
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  averageAttempts: number;
  averageDuration: number;
  lastAttemptTime: number;
}

export class RetryManager {
  private config: RetryConfig;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: Map<string, RetryMetrics> = new Map();

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      timeout: 10000, // 10 seconds
      retryableErrors: [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'RPC_CONNECTION_FAILED',
        'CIRCUIT_BREAKER_OPEN'
      ],
      nonRetryableErrors: [
        'INVALID_INPUT',
        'INSUFFICIENT_FUNDS',
        'INVALID_PRIVATE_KEY',
        'COMPLIANCE_VIOLATION'
      ],
      ...config
    };
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Executes an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: Record<string, any> = {}
  ): Promise<RetryResult<T>> {
    const operationId = this.generateOperationId();
    const startTime = Date.now();
    let lastAttemptDuration = 0;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        // Execute operation with timeout
        const result = await this.executeWithTimeout(operation, attempt);
        
        lastAttemptDuration = Date.now() - attemptStartTime;
        
        // Record success
        this.recordSuccess(operationId, attempt, lastAttemptDuration);
        
        return {
          success: true,
          data: result,
          attempts: attempt,
          totalDuration: Date.now() - startTime,
          lastAttemptDuration
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        lastAttemptDuration = Date.now() - attemptStartTime;
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError, attempt)) {
          this.recordFailure(operationId, attempt, lastAttemptDuration, lastError);
          break;
        }
        
        // Record failure
        this.recordFailure(operationId, attempt, lastAttemptDuration, lastError);
        
        // If this is the last attempt, don't wait
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          this.logger.debug('Retrying operation', {
            operationId,
            attempt,
            nextAttempt: attempt + 1,
            delay,
            error: lastError.message
          });
          
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    return {
      success: false,
      error: lastError,
      attempts: this.config.maxAttempts,
      totalDuration: Date.now() - startTime,
      lastAttemptDuration
    };
  }

  /**
   * Executes operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    attempt: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout on attempt ${attempt}`));
      }, this.config.timeout);
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  /**
   * Calculates delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff
    const exponentialDelay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() - 0.5);
    
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: Error, attempt: number): boolean {
    // Don't retry if we've reached max attempts
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Check if error is explicitly non-retryable
    if (this.config.nonRetryableErrors.some(type => 
      error.message.includes(type) || error.name.includes(type)
    )) {
      return false;
    }

    // Check if error is explicitly retryable
    if (this.config.retryableErrors.some(type => 
      error.message.includes(type) || error.name.includes(type)
    )) {
      return true;
    }

    // For CipherPayError, check the retryable flag
    if (CipherPayError.isCipherPayError(error)) {
      return error.retryable;
    }

    // Default: retry network-related errors, don't retry others
    return error.message.includes('network') || 
           error.message.includes('timeout') || 
           error.message.includes('connection');
  }

  /**
   * Records successful attempt
   */
  private recordSuccess(operationId: string, attempt: number, duration: number): void {
    const metrics = this.getOrCreateMetrics(operationId);
    metrics.totalAttempts++;
    metrics.successfulAttempts++;
    metrics.averageAttempts = metrics.totalAttempts / metrics.successfulAttempts;
    metrics.averageDuration = (metrics.averageDuration * (metrics.successfulAttempts - 1) + duration) / metrics.successfulAttempts;
    metrics.lastAttemptTime = Date.now();
  }

  /**
   * Records failed attempt
   */
  private recordFailure(operationId: string, attempt: number, duration: number, error: Error): void {
    const metrics = this.getOrCreateMetrics(operationId);
    metrics.totalAttempts++;
    metrics.failedAttempts++;
    metrics.lastAttemptTime = Date.now();
    
    this.logger.warn('Retry attempt failed', {
      operationId,
      attempt,
      duration,
      error: error.message,
      retryable: this.isRetryableError(error, attempt)
    });
  }

  /**
   * Gets or creates metrics for an operation
   */
  private getOrCreateMetrics(operationId: string): RetryMetrics {
    if (!this.metrics.has(operationId)) {
      this.metrics.set(operationId, {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        averageAttempts: 0,
        averageDuration: 0,
        lastAttemptTime: 0
      });
    }
    return this.metrics.get(operationId)!;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generates unique operation ID
   */
  private generateOperationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets metrics for all operations
   */
  getAllMetrics(): Record<string, RetryMetrics> {
    const result: Record<string, RetryMetrics> = {};
    for (const [operationId, metrics] of this.metrics.entries()) {
      result[operationId] = { ...metrics };
    }
    return result;
  }

  /**
   * Resets all metrics
   */
  resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Updates retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Retry strategies for different types of operations
 */
export class RetryStrategies {
  /**
   * Fast retry strategy for UI operations
   */
  static fast(): Partial<RetryConfig> {
    return {
      maxAttempts: 2,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 1.5,
      jitterFactor: 0.2,
      timeout: 3000
    };
  }

  /**
   * Standard retry strategy for API calls
   */
  static standard(): Partial<RetryConfig> {
    return {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      timeout: 10000
    };
  }

  /**
   * Conservative retry strategy for critical operations
   */
  static conservative(): Partial<RetryConfig> {
    return {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      jitterFactor: 0.15,
      timeout: 30000
    };
  }

  /**
   * Network retry strategy for external API calls
   */
  static network(): Partial<RetryConfig> {
    return {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      timeout: 15000,
      retryableErrors: [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'RPC_CONNECTION_FAILED',
        'CIRCUIT_BREAKER_OPEN',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT'
      ]
    };
  }
} 