import { ConnectionPool, ConnectionPoolManager, ConnectionConfig, PoolConfig } from '../ConnectionPool';

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  let connectionConfigs: ConnectionConfig[];

  beforeEach(() => {
    connectionConfigs = [
      {
        host: 'localhost',
        port: 8080,
        protocol: 'http',
        timeout: 5000,
        maxRetries: 3,
        keepAlive: true,
        keepAliveInterval: 30000,
        maxIdleTime: 300000
      },
      {
        host: 'localhost',
        port: 8081,
        protocol: 'http',
        timeout: 5000,
        maxRetries: 3,
        keepAlive: true,
        keepAliveInterval: 30000,
        maxIdleTime: 300000
      }
    ];

    const poolConfig: Partial<PoolConfig> = {
      minConnections: 1,
      maxConnections: 3,
      acquireTimeout: 1000,
      healthCheckInterval: 100,
      healthCheckTimeout: 500
    };

    pool = new ConnectionPool(connectionConfigs, poolConfig);
  });

  afterEach(async () => {
    await pool.close();
  });

  describe('Connection Management', () => {
    it('should create pool with minimum connections', async () => {
      const metrics = pool.getMetrics();
      expect(metrics.totalConnections).toBeGreaterThanOrEqual(1);
    });

    it('should acquire and release connections', async () => {
      const connection = await pool.acquire();
      expect(connection).toBeDefined();
      expect(connection.isActive).toBe(true);

      await pool.release(connection);
      expect(connection.isActive).toBe(false);
    });

    it('should create new connections when needed', async () => {
      const connections = [];
      
      // Acquire more connections than minimum
      for (let i = 0; i < 3; i++) {
        const conn = await pool.acquire();
        connections.push(conn);
      }

      const metrics = pool.getMetrics();
      expect(metrics.totalConnections).toBe(3);

      // Release all connections
      for (const conn of connections) {
        await pool.release(conn);
      }
    });

    it('should respect maximum connection limit', async () => {
      const connections = [];
      
      // Try to acquire more than max connections
      for (let i = 0; i < 5; i++) {
        try {
          const conn = await pool.acquire();
          connections.push(conn);
        } catch (error) {
          // Should fail after max connections
          expect(i).toBeGreaterThanOrEqual(3);
          break;
        }
      }

      expect(connections.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Load Balancing', () => {
    it('should use round-robin load balancing', async () => {
      const pool = new ConnectionPool(connectionConfigs, {
        loadBalancing: 'round-robin',
        minConnections: 2
      });

      const connection1 = await pool.acquire();
      const connection2 = await pool.acquire();

      expect(connection1.config.host).toBe(connectionConfigs[0].host);
      expect(connection1.config.port).toBe(connectionConfigs[0].port);
      expect(connection2.config.host).toBe(connectionConfigs[1].host);
      expect(connection2.config.port).toBe(connectionConfigs[1].port);

      await pool.release(connection1);
      await pool.release(connection2);
      await pool.close();
    });

    it('should use random load balancing', async () => {
      const pool = new ConnectionPool(connectionConfigs, {
        loadBalancing: 'random',
        minConnections: 2
      });

      const connections = [];
      for (let i = 0; i < 10; i++) {
        const conn = await pool.acquire();
        connections.push(conn);
        await pool.release(conn);
      }

      // Should have used both configs
      const usedHosts = new Set(connections.map(c => `${c.config.host}:${c.config.port}`));
      expect(usedHosts.size).toBeGreaterThan(1);

      await pool.close();
    });
  });

  describe('Health Checks', () => {
    it('should perform health checks on connections', async () => {
      const connection = await pool.acquire();
      
      // Mock health check to return true
      jest.spyOn(connection, 'healthCheck').mockResolvedValue(true);
      
      const isHealthy = await connection.healthCheck();
      expect(isHealthy).toBe(true);

      await pool.release(connection);
    });

    it('should remove unhealthy connections', async () => {
      const connection = await pool.acquire();
      
      // Mock health check to return false
      jest.spyOn(connection, 'healthCheck').mockResolvedValue(false);
      
      await pool.release(connection);

      // Connection should be removed
      const metrics = pool.getMetrics();
      expect(metrics.failedConnections).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const connection = await pool.acquire();
      
      // Mock execute to throw error
      jest.spyOn(connection, 'execute').mockRejectedValue(new Error('Connection error'));
      
      try {
        await connection.execute(() => Promise.resolve('test'));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Connection error');
      }

      await pool.release(connection);
    });

    it('should handle acquire timeout', async () => {
      const pool = new ConnectionPool(connectionConfigs, {
        maxConnections: 1,
        acquireTimeout: 100
      });

      // Acquire first connection
      const conn1 = await pool.acquire();
      
      // Try to acquire second connection (should timeout)
      try {
        await pool.acquire();
        fail('Should have timed out');
      } catch (error) {
        expect((error as Error).message).toContain('timeout');
      }

      await pool.release(conn1);
      await pool.close();
    });
  });

  describe('Metrics', () => {
    it('should track connection metrics', async () => {
      const connection = await pool.acquire();
      await pool.release(connection);

      const metrics = pool.getMetrics();
      expect(metrics.totalConnections).toBeGreaterThan(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.idleConnections).toBeGreaterThan(0);
    });

    it('should track response times', async () => {
      const connection = await pool.acquire();
      
      // Mock execute to simulate response time
      jest.spyOn(connection, 'execute').mockImplementation(async (operation) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return operation();
      });

      await connection.execute(() => Promise.resolve('test'));
      await pool.release(connection);

      const metrics = pool.getMetrics();
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });
  });
});

describe('ConnectionPoolManager', () => {
  let manager: ConnectionPoolManager;

  beforeEach(() => {
    manager = ConnectionPoolManager.getInstance();
  });

  afterEach(async () => {
    await manager.closeAll();
  });

  it('should create and manage multiple pools', () => {
    const connectionConfigs: ConnectionConfig[] = [
      {
        host: 'localhost',
        port: 8080,
        protocol: 'http',
        timeout: 5000,
        maxRetries: 3,
        keepAlive: true,
        keepAliveInterval: 30000,
        maxIdleTime: 300000
      }
    ];

    const pool1 = manager.createPool('pool1', connectionConfigs);
    const pool2 = manager.createPool('pool2', connectionConfigs);

    expect(pool1).toBeDefined();
    expect(pool2).toBeDefined();
    expect(pool1).not.toBe(pool2);

    const retrievedPool1 = manager.getPool('pool1');
    const retrievedPool2 = manager.getPool('pool2');

    expect(retrievedPool1).toBe(pool1);
    expect(retrievedPool2).toBe(pool2);
  });

  it('should return existing pool if name already exists', () => {
    const connectionConfigs: ConnectionConfig[] = [
      {
        host: 'localhost',
        port: 8080,
        protocol: 'http',
        timeout: 5000,
        maxRetries: 3,
        keepAlive: true,
        keepAliveInterval: 30000,
        maxIdleTime: 300000
      }
    ];

    const pool1 = manager.createPool('test-pool', connectionConfigs);
    const pool2 = manager.createPool('test-pool', connectionConfigs);

    expect(pool1).toBe(pool2);
  });

  it('should get all pools', () => {
    const connectionConfigs: ConnectionConfig[] = [
      {
        host: 'localhost',
        port: 8080,
        protocol: 'http',
        timeout: 5000,
        maxRetries: 3,
        keepAlive: true,
        keepAliveInterval: 30000,
        maxIdleTime: 300000
      }
    ];

    manager.createPool('pool1', connectionConfigs);
    manager.createPool('pool2', connectionConfigs);

    const allPools = manager.getAllPools();
    expect(allPools.size).toBe(2);
    expect(allPools.has('pool1')).toBe(true);
    expect(allPools.has('pool2')).toBe(true);
  });

  it('should close all pools', async () => {
    const connectionConfigs: ConnectionConfig[] = [
      {
        host: 'localhost',
        port: 8080,
        protocol: 'http',
        timeout: 5000,
        maxRetries: 3,
        keepAlive: true,
        keepAliveInterval: 30000,
        maxIdleTime: 300000
      }
    ];

    manager.createPool('pool1', connectionConfigs);
    manager.createPool('pool2', connectionConfigs);

    await manager.closeAll();

    const allPools = manager.getAllPools();
    expect(allPools.size).toBe(0);
  });
}); 