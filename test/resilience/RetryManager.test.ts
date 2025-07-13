import { RetryManager, RetryConfig, RetryResult, RetryStrategies } from '../../src/resilience/RetryManager';

describe('RetryManager', () => {
  let retryManager: RetryManager;
  let config: Partial<RetryConfig>;

  beforeEach(() => {
    config = {
      maxAttempts: 3,
      baseDelay: 100, // 100ms for faster tests
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      timeout: 500,
      retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR'],
      nonRetryableErrors: ['INVALID_INPUT', 'INSUFFICIENT_FUNDS']
    };
    retryManager = new RetryManager(config);
  });

  describe('Successful Operations', () => {
    test('should execute successful operation on first attempt', async () => {
      const result = await retryManager.execute(async () => 'success');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalDuration).toBeGreaterThan(0);
    });

    test('should record success metrics', async () => {
      await retryManager.execute(async () => 'success');
      
      const metrics = retryManager.getAllMetrics();
      const operationId = Object.keys(metrics)[0];
      const metric = metrics[operationId];
      
      expect(metric.totalAttempts).toBe(1);
      expect(metric.successfulAttempts).toBe(1);
      expect(metric.failedAttempts).toBe(0);
      expect(metric.averageAttempts).toBe(1);
    });
  });

  describe('Retryable Failures', () => {
    test('should retry on retryable errors', async () => {
      let attemptCount = 0;
      
      const result = await retryManager.execute(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('NETWORK_ERROR');
        }
        return 'success';
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      expect(attemptCount).toBe(3);
    });

    test('should fail after max attempts', async () => {
      const result = await retryManager.execute(async () => {
        throw new Error('NETWORK_ERROR');
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(3);
      expect(result.error?.message).toBe('NETWORK_ERROR');
    });

    test('should apply exponential backoff', async () => {
      const startTime = Date.now();
      let attemptTimes: number[] = [];
      
      await retryManager.execute(async () => {
        attemptTimes.push(Date.now() - startTime);
        throw new Error('NETWORK_ERROR');
      });
      
      // Should have delays between attempts
      expect(attemptTimes.length).toBe(3);
      expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThan(50); // At least 50ms delay
      expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThan(attemptTimes[1] - attemptTimes[0]); // Increasing delay
    });
  });

  describe('Non-Retryable Failures', () => {
    test('should not retry on non-retryable errors', async () => {
      let attemptCount = 0;
      
      const result = await retryManager.execute(async () => {
        attemptCount++;
        throw new Error('INVALID_INPUT');
      });
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should not retry
      expect(attemptCount).toBe(1);
    });

    test('should not retry on validation errors', async () => {
      const result = await retryManager.execute(async () => {
        throw new Error('INSUFFICIENT_FUNDS');
      });
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout slow operations', async () => {
      const result = await retryManager.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'slow result';
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    });
  });

  describe('Error Classification', () => {
    test('should retry network-related errors by default', async () => {
      let attemptCount = 0;
      
      const result = await retryManager.execute(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Connection timeout');
        }
        return 'success';
      });
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('should not retry business logic errors by default', async () => {
      const result = await retryManager.execute(async () => {
        throw new Error('Business rule violation');
      });
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should track retry metrics', async () => {
      // Execute some operations
      await retryManager.execute(async () => 'success');
      
      try {
        await retryManager.execute(async () => {
          throw new Error('NETWORK_ERROR');
        });
      } catch (error) {
        // Expected to fail
      }
      
      const metrics = retryManager.getAllMetrics();
      expect(Object.keys(metrics).length).toBe(2);
      
      // Check that metrics are being tracked
      const metricValues = Object.values(metrics);
      expect(metricValues.some(m => m.successfulAttempts > 0)).toBe(true);
      expect(metricValues.some(m => m.failedAttempts > 0)).toBe(true);
    });

    test('should reset metrics', () => {
      retryManager.resetMetrics();
      const metrics = retryManager.getAllMetrics();
      expect(Object.keys(metrics).length).toBe(0);
    });
  });

  describe('Configuration Updates', () => {
    test('should update configuration', () => {
      const newConfig = { maxAttempts: 5, baseDelay: 200 };
      retryManager.updateConfig(newConfig);
      
      // Test with new configuration
      let attemptCount = 0;
      retryManager.execute(async () => {
        attemptCount++;
        throw new Error('NETWORK_ERROR');
      });
      
      // Should use new max attempts
      expect(attemptCount).toBe(5);
    });
  });
});

describe('RetryStrategies', () => {
  describe('Fast Strategy', () => {
    test('should have fast retry settings', () => {
      const strategy = RetryStrategies.fast();
      
      expect(strategy.maxAttempts).toBe(2);
      expect(strategy.baseDelay).toBe(100);
      expect(strategy.maxDelay).toBe(1000);
      expect(strategy.timeout).toBe(3000);
    });
  });

  describe('Standard Strategy', () => {
    test('should have standard retry settings', () => {
      const strategy = RetryStrategies.standard();
      
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.baseDelay).toBe(1000);
      expect(strategy.maxDelay).toBe(10000);
      expect(strategy.timeout).toBe(10000);
    });
  });

  describe('Conservative Strategy', () => {
    test('should have conservative retry settings', () => {
      const strategy = RetryStrategies.conservative();
      
      expect(strategy.maxAttempts).toBe(5);
      expect(strategy.baseDelay).toBe(2000);
      expect(strategy.maxDelay).toBe(60000);
      expect(strategy.timeout).toBe(30000);
    });
  });

  describe('Network Strategy', () => {
    test('should have network-specific retry settings', () => {
      const strategy = RetryStrategies.network();
      
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.baseDelay).toBe(1000);
      expect(strategy.maxDelay).toBe(15000);
      expect(strategy.timeout).toBe(15000);
      expect(strategy.retryableErrors).toContain('NETWORK_ERROR');
      expect(strategy.retryableErrors).toContain('TIMEOUT_ERROR');
      expect(strategy.retryableErrors).toContain('ECONNRESET');
    });
  });
}); 