import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { getHealthAPI, HealthAPIResponse } from './HealthAPI';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from './observability/logger';

export interface HealthServerConfig {
  port?: number;
  host?: string;
  enableCORS?: boolean;
  enableLogging?: boolean;
  timeout?: number;
}

export class HealthServer {
  private server: any;
  private config: Required<HealthServerConfig>;
  private logger: Logger;

  constructor(config: HealthServerConfig = {}) {
    this.config = {
      port: config.port || 3001,
      host: config.host || '0.0.0.0',
      enableCORS: config.enableCORS !== false,
      enableLogging: config.enableLogging !== false,
      timeout: config.timeout || 30000
    };

    this.logger = Logger.getInstance();
    this.server = createServer(this.handleRequest.bind(this));
  }

  /**
   * Starts the health server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        if (this.config.enableLogging) {
          this.logger.info(`Health server started on ${this.config.host}:${this.config.port}`);
        }
        resolve();
      });

      this.server.on('error', (error: Error) => {
        this.logger.error('Health server error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Stops the health server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        if (this.config.enableLogging) {
          this.logger.info('Health server stopped');
        }
        resolve();
      });
    });
  }

  /**
   * Handles incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | undefined;
    
    try {
      // Set CORS headers if enabled
      if (this.config.enableCORS) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Parse URL
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const path = url.pathname;
      const query = Object.fromEntries(url.searchParams.entries());

      // Set timeout
      timeoutId = setTimeout(() => {
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request timeout' }));
      }, this.config.timeout);

      // Route requests
      let response: any;
      let statusCode = 200;

      switch (path) {
        case '/health':
          response = await this.handleHealthEndpoint(query);
          break;
        
        case '/health/simple':
          response = await this.handleSimpleHealthEndpoint();
          break;
        
        case '/health/readiness':
          response = await this.handleReadinessEndpoint();
          break;
        
        case '/health/liveness':
          response = await this.handleLivenessEndpoint();
          break;
        
        case '/health/check':
          const checkName = query.name;
          if (!checkName) {
            statusCode = 400;
            response = { error: 'Check name is required' };
          } else {
            response = await this.handleCheckEndpoint(checkName);
            if (!response) {
              statusCode = 404;
              response = { error: 'Check not found' };
            }
          }
          break;
        
        case '/health/metrics':
          response = await this.handleMetricsEndpoint();
          break;
        
        case '/health/errors':
          response = await this.handleErrorsEndpoint();
          break;
        
        case '/health/reset':
          if (req.method === 'POST') {
            response = await this.handleResetEndpoint();
          } else {
            statusCode = 405;
            response = { error: 'Method not allowed' };
          }
          break;
        
        default:
          statusCode = 404;
          response = { error: 'Endpoint not found' };
      }

      clearTimeout(timeoutId);

      // Send response
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));

      // Log request if enabled
      if (this.config.enableLogging) {
        const duration = Date.now() - startTime;
        this.logger.info(`Health request processed`, {
          method: req.method,
          path,
          statusCode,
          duration,
          userAgent: req.headers['user-agent']
        });
      }

    } catch (error) {
      clearTimeout(timeoutId);
      
      const errorHandler = ErrorHandler.getInstance();
      errorHandler.handleError(error as Error, {
        context: 'HealthServer.handleRequest',
        request: {
          method: req.method,
          url: req.url,
          headers: req.headers
        }
      });

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal server error',
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Handles the main health endpoint
   */
  private async handleHealthEndpoint(query: Record<string, string>): Promise<HealthAPIResponse> {
    const request = {
      includeDetails: query.details === 'true',
      timeout: query.timeout ? parseInt(query.timeout) : undefined,
      checks: query.checks ? query.checks.split(',') : undefined
    };

    const healthAPI = getHealthAPI();
    return await healthAPI.getHealthStatus(request);
  }

  /**
   * Handles the simple health endpoint
   */
  private async handleSimpleHealthEndpoint(): Promise<{ status: string; timestamp: number }> {
    const healthAPI = getHealthAPI();
    return await healthAPI.getSimpleHealth();
  }

  /**
   * Handles the readiness endpoint
   */
  private async handleReadinessEndpoint(): Promise<{ ready: boolean; timestamp: number }> {
    const healthAPI = getHealthAPI();
    return await healthAPI.getReadiness();
  }

  /**
   * Handles the liveness endpoint
   */
  private async handleLivenessEndpoint(): Promise<{ alive: boolean; timestamp: number }> {
    const healthAPI = getHealthAPI();
    return await healthAPI.getLiveness();
  }

  /**
   * Handles the specific check endpoint
   */
  private async handleCheckEndpoint(checkName: string): Promise<any> {
    const healthAPI = getHealthAPI();
    const check = await healthAPI.getCheckStatus(checkName);
    return check;
  }

  /**
   * Handles the metrics endpoint
   */
  private async handleMetricsEndpoint(): Promise<any> {
    const healthAPI = getHealthAPI();
    const healthStatus = await healthAPI.getHealthStatus({ includeDetails: true });
    return {
      timestamp: healthStatus.timestamp,
      uptime: healthStatus.uptime,
      performance: healthStatus.performance,
      rateLimits: healthStatus.rateLimits
    };
  }

  /**
   * Handles the errors endpoint
   */
  private async handleErrorsEndpoint(): Promise<any> {
    const healthAPI = getHealthAPI();
    const healthStatus = await healthAPI.getHealthStatus();
    return {
      timestamp: healthStatus.timestamp,
      errors: healthStatus.errors
    };
  }

  /**
   * Handles the reset endpoint
   */
  private async handleResetEndpoint(): Promise<{ message: string; timestamp: number }> {
    const healthAPI = getHealthAPI();
    healthAPI.resetErrorStats();
    return {
      message: 'Error statistics reset successfully',
      timestamp: Date.now()
    };
  }
}

// Export a function to create and start a health server
export async function startHealthServer(config?: HealthServerConfig): Promise<HealthServer> {
  const server = new HealthServer(config);
  await server.start();
  return server;
}

// Export a function to create a health server without starting it
export function createHealthServer(config?: HealthServerConfig): HealthServer {
  return new HealthServer(config);
} 