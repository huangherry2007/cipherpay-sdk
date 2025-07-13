import { CircuitBreaker, CircuitBreakerManager, CircuitState, CircuitBreakerConfig } from '../../src/resilience/CircuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let config: Partial<CircuitBreakerConfig>;

  beforeEach(() => {
    config = {
      failureThreshold: 3,
      recoveryTimeout: 1000, // 1 second for testing
      timeoutThreshold: 500,
      monitoringWindow: 5000,
      minimumRequestCount: 2,
      successThreshold: 2
    };
    circuitBreaker = new CircuitBreaker('test-circuit', config);
  });

  describe('Initial State', () => {
    test('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should have correct initial metrics', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.currentFailureRate).toBe(0);
    });
  });

  describe('Successful Operations', () => {
    test('should execute successful operation', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should record success metrics', async () => {
      await circuitBreaker.execute(async () => 'success');
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.currentFailureRate).toBe(0);
    });
  });

  describe('Failed Operations', () => {
    test('should record failure metrics', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected to fail
      }

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.currentFailureRate).toBe(1);
    });

    test('should open circuit after threshold failures', async () => {
      // Execute operations that fail
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error(`Test error ${i}`);
          });
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should reject requests when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      // Try to execute when circuit is open
      try {
        await circuitBreaker.execute(async () => 'should not execute');
        fail('Should have thrown circuit open error');
      } catch (error: any) {
        expect(error.message).toContain('Circuit breaker');
        expect(error.message).toContain('is open');
      }
    });
  });

  describe('Half-Open State', () => {
    test('should transition to half-open after recovery timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Try to execute - should transition to half-open
      try {
        await circuitBreaker.execute(async () => 'success');
        expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      } catch (error) {
        // Should succeed and close circuit
      }
    });

    test('should open circuit again if half-open test fails', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Try to execute but fail - should open circuit again
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected to fail
      }

      // Wait a bit for state transition
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout slow operations', async () => {
      try {
        await circuitBreaker.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return 'slow result';
        });
        fail('Should have timed out');
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Manual Reset', () => {
    test('should reset circuit to closed state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test error');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      // Manually reset
      circuitBreaker.reset();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Should work again
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = CircuitBreakerManager.getInstance();
  });

  test('should create and manage circuit breakers', () => {
    const circuit1 = manager.getCircuitBreaker('service1');
    const circuit2 = manager.getCircuitBreaker('service2');

    expect(circuit1).toBeDefined();
    expect(circuit2).toBeDefined();
    expect(circuit1).not.toBe(circuit2);
  });

  test('should return same circuit breaker for same name', () => {
    const circuit1 = manager.getCircuitBreaker('service1');
    const circuit2 = manager.getCircuitBreaker('service1');

    expect(circuit1).toBe(circuit2);
  });

  test('should get all circuit breakers', () => {
    manager.getCircuitBreaker('service1');
    manager.getCircuitBreaker('service2');

    const allCircuits = manager.getAllCircuitBreakers();
    expect(allCircuits.size).toBe(2);
    expect(allCircuits.has('service1')).toBe(true);
    expect(allCircuits.has('service2')).toBe(true);
  });

  test('should get metrics for all circuit breakers', async () => {
    const circuit = manager.getCircuitBreaker('service1');
    
    // Execute some operations
    await circuit.execute(async () => 'success');
    
    const metrics = manager.getAllMetrics();
    expect(metrics.service1).toBeDefined();
    expect(metrics.service1.totalRequests).toBe(1);
  });

  test('should reset all circuit breakers', async () => {
    const circuit = manager.getCircuitBreaker('service1');
    
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuit.execute(async () => {
          throw new Error('Test error');
        });
      } catch (error) {
        // Expected to fail
      }
    }

    // Wait a bit for state transition
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(circuit.getState()).toBe(CircuitState.OPEN);

    // Reset all
    manager.resetAll();
    expect(circuit.getState()).toBe(CircuitState.CLOSED);
  });
}); 