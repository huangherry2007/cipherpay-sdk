import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface ConnectionConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'ws' | 'wss';
  timeout: number;
  maxRetries: number;
  keepAlive: boolean;
  keepAliveInterval: number;
  maxIdleTime: number;
  credentials?: {
    username?: string;
    password?: string;
    apiKey?: string;
    token?: string;
  };
}

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  releaseTimeout: number;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  loadBalancing: 'round-robin' | 'least-connections' | 'weighted' | 'random';
  failover: boolean;
  failoverTimeout: number;
  connectionTimeout: number;
  idleTimeout: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  failedConnections: number;
  connectionErrors: number;
  averageResponseTime: number;
  lastHealthCheck: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export interface Connection {
  id: string;
  config: ConnectionConfig;
  isActive: boolean;
  isHealthy: boolean;
  lastUsed: number;
  createdAt: number;
  errorCount: number;
  responseTimes: number[];
  acquire: () => Promise<void>;
  release: () => Promise<void>;
  execute: <T>(operation: () => Promise<T>) => Promise<T>;
  healthCheck: () => Promise<boolean>;
  close: () => Promise<void>;
}

export class ConnectionPool {
  private config: PoolConfig;
  private connections: Map<string, Connection> = new Map();
  private availableConnections: Connection[] = [];
  private waitingQueue: Array<{
    resolve: (connection: Connection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private healthCheckInterval?: NodeJS.Timeout;
  private metrics: ConnectionMetrics;
  private connectionCounter = 0;

  constructor(
    private connectionConfigs: ConnectionConfig[],
    config: Partial<PoolConfig> = {}
  ) {
    this.config = {
      minConnections: 2,
      maxConnections: 10,
      acquireTimeout: 30000,
      releaseTimeout: 5000,
      healthCheckInterval: 30000,
      healthCheckTimeout: 5000,
      loadBalancing: 'round-robin',
      failover: true,
      failoverTimeout: 10000,
      connectionTimeout: 10000,
      idleTimeout: 300000, // 5 minutes
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    this.initializePool();
    this.startHealthChecks();
  }

  /**
   * Acquires a connection from the pool
   */
  async acquire(): Promise<Connection> {
    // Check if we have available connections
    if (this.availableConnections.length > 0) {
      const connection = this.getNextConnection();
      if (connection && await this.validateConnection(connection)) {
        await connection.acquire();
        this.updateMetrics();
        return connection;
      }
    }

    // Check if we can create a new connection
    if (this.connections.size < this.config.maxConnections) {
      const connection = await this.createConnection();
      await connection.acquire();
      this.updateMetrics();
      return connection;
    }

    // Wait for a connection to become available
    return this.waitForConnection();
  }

  /**
   * Releases a connection back to the pool
   */
  async release(connection: Connection): Promise<void> {
    try {
      await connection.release();
      
      // Check if connection is still healthy
      if (await connection.healthCheck()) {
        this.availableConnections.push(connection);
      } else {
        await this.removeConnection(connection);
      }
      
      this.updateMetrics();
      
      // Process waiting queue
      this.processWaitingQueue();
    } catch (error) {
      this.logger.error('Failed to release connection', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await this.removeConnection(connection);
    }
  }

  /**
   * Executes an operation using a connection from the pool
   */
  async execute<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await this.acquire();
    
    try {
      const startTime = Date.now();
      const result = await connection.execute(() => operation(connection));
      const responseTime = Date.now() - startTime;
      
      // Update connection metrics
      connection.responseTimes.push(responseTime);
      if (connection.responseTimes.length > 100) {
        connection.responseTimes.shift();
      }
      
      return result;
    } finally {
      await this.release(connection);
    }
  }

  /**
   * Gets pool metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets all connections
   */
  getAllConnections(): Connection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Closes the connection pool
   */
  async close(): Promise<void> {
    this.logger.info('Closing connection pool', {
      totalConnections: this.connections.size,
      activeConnections: this.metrics.activeConnections
    });

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(conn => conn.close());
    await Promise.allSettled(closePromises);

    // Clear waiting queue
    this.waitingQueue.forEach(waiting => {
      clearTimeout(waiting.timeout);
      waiting.reject(new Error('Connection pool closed'));
    });

    this.connections.clear();
    this.availableConnections = [];
    this.waitingQueue = [];

    this.logger.info('Connection pool closed');
  }

  /**
   * Initializes the connection pool
   */
  private async initializePool(): Promise<void> {
    this.logger.info('Initializing connection pool', {
      minConnections: this.config.minConnections,
      maxConnections: this.config.maxConnections,
      connectionConfigs: this.connectionConfigs.length
    });

    // Create minimum number of connections
    const initPromises = [];
    for (let i = 0; i < this.config.minConnections; i++) {
      initPromises.push(this.createConnection());
    }

    await Promise.allSettled(initPromises);
    this.updateMetrics();
  }

  /**
   * Creates a new connection
   */
  private async createConnection(): Promise<Connection> {
    const connectionId = `conn-${++this.connectionCounter}`;
    const config = this.selectConnectionConfig();
    
    const connection: Connection = {
      id: connectionId,
      config,
      isActive: false,
      isHealthy: true,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      errorCount: 0,
      responseTimes: [],

      acquire: async () => {
        connection.isActive = true;
        connection.lastUsed = Date.now();
      },

      release: async () => {
        connection.isActive = false;
        connection.lastUsed = Date.now();
      },

      execute: async <T>(operation: () => Promise<T>): Promise<T> => {
        try {
          const result = await operation();
          connection.errorCount = 0;
          return result;
        } catch (error) {
          connection.errorCount++;
          throw error;
        }
      },

      healthCheck: async (): Promise<boolean> => {
                  try {
            // Simple health check - can be overridden for specific connection types
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);
            
            try {
              const response = await fetch(`${config.protocol}://${config.host}:${config.port}/health`, {
                method: 'GET',
                headers: this.buildHeaders(config),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              connection.isHealthy = response.ok;
              return response.ok;
            } catch (error) {
              clearTimeout(timeoutId);
              connection.isHealthy = false;
              return false;
          
            }
        } catch (error) {
          connection.isHealthy = false;
          return false;
        }
      },

      close: async () => {
        connection.isActive = false;
        connection.isHealthy = false;
        this.connections.delete(connectionId);
        this.availableConnections = this.availableConnections.filter(c => c.id !== connectionId);
      }
    };

    this.connections.set(connectionId, connection);
    this.availableConnections.push(connection);

    this.logger.info('Connection created', {
      connectionId,
      host: config.host,
      port: config.port
    });

    return connection;
  }

  /**
   * Selects connection config based on load balancing strategy
   */
  private selectConnectionConfig(): ConnectionConfig {
    switch (this.config.loadBalancing) {
      case 'round-robin':
        return this.connectionConfigs[this.connectionCounter % this.connectionConfigs.length];
      
      case 'random':
        return this.connectionConfigs[Math.floor(Math.random() * this.connectionConfigs.length)];
      
      case 'least-connections':
        // Select config with least active connections
        const connectionCounts = new Map<string, number>();
        this.connectionConfigs.forEach(config => {
          const key = `${config.host}:${config.port}`;
          connectionCounts.set(key, 0);
        });
        
        this.connections.forEach(conn => {
          const key = `${conn.config.host}:${conn.config.port}`;
          connectionCounts.set(key, (connectionCounts.get(key) || 0) + 1);
        });
        
        const leastUsed = Array.from(connectionCounts.entries())
          .sort(([, a], [, b]) => a - b)[0];
        
        return this.connectionConfigs.find(config => 
          `${config.host}:${config.port}` === leastUsed[0]
        ) || this.connectionConfigs[0];
      
      default:
        return this.connectionConfigs[0];
    }
  }

  /**
   * Gets next available connection based on load balancing
   */
  private getNextConnection(): Connection | undefined {
    if (this.availableConnections.length === 0) {
      return undefined;
    }

    switch (this.config.loadBalancing) {
      case 'round-robin':
        const connection = this.availableConnections.shift()!;
        this.availableConnections.push(connection);
        return connection;
      
      case 'random':
        const index = Math.floor(Math.random() * this.availableConnections.length);
        return this.availableConnections.splice(index, 1)[0];
      
      case 'least-connections':
        return this.availableConnections.shift();
      
      default:
        return this.availableConnections.shift();
    }
  }

  /**
   * Waits for a connection to become available
   */
  private waitForConnection(): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.timeout === timeout);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Connection acquisition timeout'));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Processes waiting queue when connections become available
   */
  private processWaitingQueue(): void {
    while (this.waitingQueue.length > 0 && this.availableConnections.length > 0) {
      const waiting = this.waitingQueue.shift()!;
      const connection = this.availableConnections.shift()!;
      
      clearTimeout(waiting.timeout);
      waiting.resolve(connection);
    }
  }

  /**
   * Validates a connection before use
   */
  private async validateConnection(connection: Connection): Promise<boolean> {
    // Check if connection is too old
    if (Date.now() - connection.createdAt > this.config.idleTimeout) {
      await this.removeConnection(connection);
      return false;
    }

    // Check if connection has too many errors
    if (connection.errorCount > 5) {
      await this.removeConnection(connection);
      return false;
    }

    return connection.isHealthy;
  }

  /**
   * Removes a connection from the pool
   */
  private async removeConnection(connection: Connection): Promise<void> {
    await connection.close();
    this.connections.delete(connection.id);
    this.availableConnections = this.availableConnections.filter(c => c.id !== connection.id);
    
    this.logger.warn('Connection removed from pool', {
      connectionId: connection.id,
      errorCount: connection.errorCount
    });
  }

  /**
   * Starts health check interval
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Performs health checks on all connections
   */
  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        const isHealthy = await connection.healthCheck();
        if (!isHealthy && connection.isActive) {
          this.logger.warn('Unhealthy active connection detected', {
            connectionId: connection.id
          });
        }
      } catch (error) {
        this.logger.error('Health check failed', {
          connectionId: connection.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    await Promise.allSettled(healthPromises);
    this.updateMetrics();
  }

  /**
   * Updates pool metrics
   */
  private updateMetrics(): void {
    const connections = Array.from(this.connections.values());
    const activeConnections = connections.filter(c => c.isActive).length;
    const healthyConnections = connections.filter(c => c.isHealthy).length;
    
    const totalResponseTime = connections.reduce((sum, conn) => 
      sum + conn.responseTimes.reduce((a, b) => a + b, 0), 0
    );
    const totalResponseCount = connections.reduce((sum, conn) => 
      sum + conn.responseTimes.length, 0
    );

    this.metrics = {
      totalConnections: connections.length,
      activeConnections,
      idleConnections: connections.length - activeConnections,
      failedConnections: connections.length - healthyConnections,
      connectionErrors: connections.reduce((sum, conn) => sum + conn.errorCount, 0),
      averageResponseTime: totalResponseCount > 0 ? totalResponseTime / totalResponseCount : 0,
      lastHealthCheck: Date.now(),
      healthStatus: healthyConnections === connections.length ? 'healthy' : 
                   healthyConnections > connections.length / 2 ? 'degraded' : 'unhealthy'
    };
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): ConnectionMetrics {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      failedConnections: 0,
      connectionErrors: 0,
      averageResponseTime: 0,
      lastHealthCheck: Date.now(),
      healthStatus: 'healthy'
    };
  }

  /**
   * Builds headers for connection requests
   */
  private buildHeaders(config: ConnectionConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'CipherPay-SDK/1.0'
    };

    if (config.credentials?.apiKey) {
      headers['Authorization'] = `Bearer ${config.credentials.apiKey}`;
    } else if (config.credentials?.token) {
      headers['Authorization'] = `Bearer ${config.credentials.token}`;
    } else if (config.credentials?.username && config.credentials?.password) {
      const auth = Buffer.from(`${config.credentials.username}:${config.credentials.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    return headers;
  }
}

/**
 * Connection Pool Manager for managing multiple pools
 */
export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private pools: Map<string, ConnectionPool> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager();
    }
    return ConnectionPoolManager.instance;
  }

  /**
   * Creates or gets a connection pool
   */
  createPool(
    name: string,
    connectionConfigs: ConnectionConfig[],
    poolConfig?: Partial<PoolConfig>
  ): ConnectionPool {
    if (this.pools.has(name)) {
      return this.pools.get(name)!;
    }

    const pool = new ConnectionPool(connectionConfigs, poolConfig);
    this.pools.set(name, pool);

    this.logger.info('Connection pool created', {
      poolName: name,
      connectionCount: connectionConfigs.length
    });

    return pool;
  }

  /**
   * Gets a connection pool
   */
  getPool(name: string): ConnectionPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Gets all pools
   */
  getAllPools(): Map<string, ConnectionPool> {
    return new Map(this.pools);
  }

  /**
   * Closes all pools
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(pool => pool.close());
    await Promise.allSettled(closePromises);
    this.pools.clear();

    this.logger.info('All connection pools closed');
  }
} 