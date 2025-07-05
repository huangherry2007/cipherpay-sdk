import { CipherPayError, ErrorType } from '../errors/ErrorHandler';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { globalRateLimiter } from '../utils/RateLimiter';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  timestamp: number;
  duration: number;
  details?: Record<string, any>;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  version: string;
  environment: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

export interface HealthCheckConfig {
  enabled: boolean;
  timeout: number;
  interval: number;
  retries: number;
}

export class HealthChecker {
  private static instance: HealthChecker;
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private config: HealthCheckConfig;
  private lastCheck: HealthStatus | null = null;
  private checkTimer?: NodeJS.Timeout;

  private constructor() {
    this.config = {
      enabled: true,
      timeout: 5000,
      interval: 30000, // 30 seconds
      retries: 3
    };
    this.initializeDefaultChecks();
  }

  public static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  /**
   * Adds a custom health check
   * @param name Unique name for the health check
   * @param check Function that performs the health check
   */
  public addCheck(name: string, check: () => Promise<HealthCheck>): void {
    this.checks.set(name, check);
  }

  /**
   * Removes a health check
   * @param name Name of the health check to remove
   */
  public removeCheck(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Performs all health checks
   * @returns Overall health status
   */
  public async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    const checks: HealthCheck[] = [];
    const configManager = ConfigurationManager.getInstance();

    // Perform all checks
    for (const [name, checkFn] of this.checks.entries()) {
      try {
        const check = await this.performCheck(name, checkFn);
        checks.push(check);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        checks.push({
          name,
          status: 'unhealthy',
          message: `Health check failed: ${errorMessage}`,
          timestamp: Date.now(),
          duration: 0,
          details: { error: errorMessage }
        });
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(checks);

    // Determine overall status
    const status = this.determineOverallStatus(summary);

    const healthStatus: HealthStatus = {
      status,
      timestamp: Date.now(),
      version: configManager.getConfig().version,
      environment: configManager.getEnvironment(),
      checks,
      summary
    };

    this.lastCheck = healthStatus;
    return healthStatus;
  }

  /**
   * Gets the last health check result
   * @returns Last health status or null if no check performed
   */
  public getLastHealthCheck(): HealthStatus | null {
    return this.lastCheck;
  }

  /**
   * Starts periodic health checking
   */
  public startPeriodicChecks(): void {
    if (this.checkTimer) {
      return; // Already running
    }

    this.checkTimer = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error('Periodic health check failed:', error);
      }
    }, this.config.interval);
  }

  /**
   * Stops periodic health checking
   */
  public stopPeriodicChecks(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * Updates health check configuration
   * @param config New configuration
   */
  public updateConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets health check configuration
   * @returns Current configuration
   */
  public getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Performs a single health check with timeout and retries
   * @param name Health check name
   * @param checkFn Health check function
   * @returns Health check result
   */
  private async performCheck(name: string, checkFn: () => Promise<HealthCheck>): Promise<HealthCheck> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const check = await Promise.race([
          checkFn(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), this.config.timeout)
          )
        ]);

        return {
          ...check,
          duration: Date.now() - startTime,
          details: {
            ...check.details,
            attempts: attempt
          }
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.retries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All attempts failed
    return {
      name,
      status: 'unhealthy',
      message: `Health check failed after ${this.config.retries} attempts: ${lastError?.message}`,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      details: {
        attempts: this.config.retries,
        lastError: lastError?.message
      }
    };
  }

  /**
   * Calculates summary statistics
   * @param checks Health check results
   * @returns Summary statistics
   */
  private calculateSummary(checks: HealthCheck[]): HealthStatus['summary'] {
    const summary = {
      total: checks.length,
      healthy: 0,
      unhealthy: 0,
      degraded: 0
    };

    for (const check of checks) {
      switch (check.status) {
        case 'healthy':
          summary.healthy++;
          break;
        case 'unhealthy':
          summary.unhealthy++;
          break;
        case 'degraded':
          summary.degraded++;
          break;
      }
    }

    return summary;
  }

  /**
   * Determines overall health status
   * @param summary Health check summary
   * @returns Overall status
   */
  private determineOverallStatus(summary: HealthStatus['summary']): 'healthy' | 'unhealthy' | 'degraded' {
    if (summary.unhealthy > 0) {
      return 'unhealthy';
    }
    if (summary.degraded > 0) {
      return 'degraded';
    }
    return 'healthy';
  }

  /**
   * Initializes default health checks
   */
  private initializeDefaultChecks(): void {
    // Configuration health check
    this.addCheck('configuration', async () => {
      const configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfig();
      
      return {
        name: 'configuration',
        status: 'healthy',
        message: 'Configuration is valid',
        timestamp: Date.now(),
        duration: 0,
        details: {
          environment: config.environment,
          version: config.version
        }
      };
    });

    // Rate limiter health check
    this.addCheck('rate_limiter', async () => {
      const stats = globalRateLimiter.getStats();
      
      return {
        name: 'rate_limiter',
        status: 'healthy',
        message: 'Rate limiter is functioning',
        timestamp: Date.now(),
        duration: 0,
        details: {
          activeLimits: Object.keys(stats).length,
          totalRequests: Object.values(stats).reduce((sum, stat) => sum + stat.totalRequests, 0)
        }
      };
    });

    // Memory usage health check
    this.addCheck('memory_usage', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const usagePercent = (heapUsedMB / heapTotalMB) * 100;

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'Memory usage is normal';

      if (usagePercent > 90) {
        status = 'unhealthy';
        message = 'Memory usage is critically high';
      } else if (usagePercent > 75) {
        status = 'degraded';
        message = 'Memory usage is elevated';
      }

      return {
        name: 'memory_usage',
        status,
        message,
        timestamp: Date.now(),
        duration: 0,
        details: {
          heapUsedMB,
          heapTotalMB,
          usagePercent: Math.round(usagePercent * 100) / 100
        }
      };
    });

    // Event loop health check
    this.addCheck('event_loop', async () => {
      const start = Date.now();
      await new Promise(resolve => setImmediate(resolve));
      const duration = Date.now() - start;

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'Event loop is responsive';

      if (duration > 100) {
        status = 'unhealthy';
        message = 'Event loop is blocked';
      } else if (duration > 50) {
        status = 'degraded';
        message = 'Event loop is slow';
      }

      return {
        name: 'event_loop',
        status,
        message,
        timestamp: Date.now(),
        duration: 0,
        details: {
          eventLoopDelay: duration
        }
      };
    });
  }
} 