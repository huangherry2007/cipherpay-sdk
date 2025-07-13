// Core resilience components
export { CircuitBreaker, CircuitBreakerManager, CircuitBreakerConfig, CircuitState, CircuitBreakerMetrics } from './CircuitBreaker';
export { RetryManager, RetryConfig, RetryResult, RetryMetrics, RetryStrategies } from './RetryManager';
export { GracefulDegradation, ServiceLevel, FallbackStrategy, DegradationConfig, ServiceHealth, FallbackStrategies } from './GracefulDegradation';
export { DataConsistencyChecker, ConsistencyRule, ConsistencyCheck, ConsistencyReport, ConsistencyConfig, ConsistencyRules } from './DataConsistencyChecker';
export { ResilienceManager, ResilienceConfig, ResilienceMetrics, ResilienceOperation, ResiliencePatterns } from './ResilienceManager';

// Re-export error types for convenience
export { ErrorType, CipherPayError } from '../errors/ErrorHandler';

// Import for default instance
import { ResilienceManager, ResiliencePatterns, ResilienceConfig } from './ResilienceManager';

// Default resilience manager instance
export const resilienceManager = ResilienceManager.getInstance();

// Convenience exports for common patterns
export const apiCall = ResiliencePatterns.apiCall;
export const databaseOperation = ResiliencePatterns.databaseOperation;
export const fileOperation = ResiliencePatterns.fileOperation;

// Default configurations
export const defaultResilienceConfig: ResilienceConfig = {
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
  logLevel: 'info'
}; 