import { HealthChecker, HealthStatus, HealthCheck } from './HealthChecker';
import { globalRateLimiter, getRateLimitStats } from '../utils/RateLimiter';
import { ErrorHandler } from '../errors/ErrorHandler';
import { ConfigurationManager } from '../config/ConfigurationManager';

export interface HealthAPIResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  version: string;
  environment: string;
  uptime: number;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
  rateLimits: {
    stats: Record<string, any>;
    totalActiveEntries: number;
    totalRequests: number;
  };
  errors: {
    recentErrors: Array<{
      type: string;
      count: number;
      lastOccurrence: number;
    }>;
    totalErrors: number;
  };
  performance: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: number;
    activeConnections: number;
  };
}

export interface HealthCheckRequest {
  includeDetails?: boolean;
  timeout?: number;
  checks?: string[];
}

export class HealthAPI {
  private healthChecker: HealthChecker;
  private startTime: number;
  private lastCpuUsage: NodeJS.CpuUsage;

  constructor() {
    this.healthChecker = HealthChecker.getInstance();
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
    
    // Start periodic health checks
    this.healthChecker.startPeriodicChecks();
  }

  /**
   * Gets the overall health status
   * @param request Health check request options
   * @returns Promise<HealthAPIResponse> Comprehensive health status
   */
  async getHealthStatus(request: HealthCheckRequest = {}): Promise<HealthAPIResponse> {
    try {
      // Perform health checks
      const healthStatus = await this.healthChecker.checkHealth();
      
      // Get rate limit statistics
      const rateLimitStats = getRateLimitStats();
      const totalActiveEntries = Object.values(rateLimitStats).reduce(
        (sum: number, stat: any) => sum + stat.activeEntries, 0
      );
      const totalRequests = Object.values(rateLimitStats).reduce(
        (sum: number, stat: any) => sum + stat.totalRequests, 0
      );

      // Get error statistics
      const errorStats = ErrorHandler.getInstance().getErrorStats();
      const recentErrors = Object.entries(errorStats)
        .filter(([_, count]) => count > 0)
        .map(([type, count]) => ({
          type,
          count,
          lastOccurrence: Date.now() // In a real implementation, this would track actual timestamps
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 most frequent errors

      // Get performance metrics
      const performance = await this.getPerformanceMetrics();

      // Filter checks if specified
      let checks = healthStatus.checks;
      if (request.checks && request.checks.length > 0) {
        checks = checks.filter(check => request.checks!.includes(check.name));
      }

      // Remove details if not requested
      if (!request.includeDetails) {
        checks = checks.map(check => ({
          ...check,
          details: undefined
        }));
      }

      const response: HealthAPIResponse = {
        status: healthStatus.status,
        timestamp: healthStatus.timestamp,
        version: healthStatus.version,
        environment: healthStatus.environment,
        uptime: Date.now() - this.startTime,
        checks,
        summary: {
          total: checks.length,
          healthy: checks.filter(c => c.status === 'healthy').length,
          unhealthy: checks.filter(c => c.status === 'unhealthy').length,
          degraded: checks.filter(c => c.status === 'degraded').length
        },
        rateLimits: {
          stats: rateLimitStats,
          totalActiveEntries,
          totalRequests
        },
        errors: {
          recentErrors,
          totalErrors: Object.values(errorStats).reduce((sum, count) => sum + count, 0)
        },
        performance
      };

      return response;
    } catch (error) {
      // Return unhealthy status if health check fails
      return {
        status: 'unhealthy',
        timestamp: Date.now(),
        version: 'unknown',
        environment: 'unknown',
        uptime: Date.now() - this.startTime,
        checks: [{
          name: 'health_api',
          status: 'unhealthy',
          message: 'Health check failed',
          timestamp: Date.now(),
          duration: 0
        }],
        summary: {
          total: 1,
          healthy: 0,
          unhealthy: 1,
          degraded: 0
        },
        rateLimits: {
          stats: {},
          totalActiveEntries: 0,
          totalRequests: 0
        },
        errors: {
          recentErrors: [],
          totalErrors: 0
        },
        performance: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: 0,
          activeConnections: 0
        }
      };
    }
  }

  /**
   * Gets detailed health status for a specific check
   * @param checkName Name of the health check
   * @returns Promise<HealthCheck | null> Detailed health check result
   */
  async getCheckStatus(checkName: string): Promise<HealthCheck | null> {
    const healthStatus = await this.healthChecker.checkHealth();
    return healthStatus.checks.find(check => check.name === checkName) || null;
  }

  /**
   * Gets a simple health status (lightweight)
   * @returns Promise<{ status: string; timestamp: number }> Simple health status
   */
  async getSimpleHealth(): Promise<{ status: string; timestamp: number }> {
    const healthStatus = await this.healthChecker.checkHealth();
    return {
      status: healthStatus.status,
      timestamp: healthStatus.timestamp
    };
  }

  /**
   * Gets readiness status (for Kubernetes readiness probes)
   * @returns Promise<{ ready: boolean; timestamp: number }> Readiness status
   */
  async getReadiness(): Promise<{ ready: boolean; timestamp: number }> {
    const healthStatus = await this.healthChecker.checkHealth();
    return {
      ready: healthStatus.status !== 'unhealthy',
      timestamp: healthStatus.timestamp
    };
  }

  /**
   * Gets liveness status (for Kubernetes liveness probes)
   * @returns Promise<{ alive: boolean; timestamp: number }> Liveness status
   */
  async getLiveness(): Promise<{ alive: boolean; timestamp: number }> {
    const healthStatus = await this.healthChecker.checkHealth();
    return {
      alive: healthStatus.status !== 'unhealthy',
      timestamp: healthStatus.timestamp
    };
  }

  /**
   * Gets performance metrics
   * @returns Promise<HealthAPIResponse['performance']> Performance metrics
   */
  private async getPerformanceMetrics(): Promise<HealthAPIResponse['performance']> {
    const memoryUsage = process.memoryUsage();
    
    // Calculate CPU usage
    const currentCpuUsage = process.cpuUsage();
    const cpuUsage = (currentCpuUsage.user - this.lastCpuUsage.user + 
                     currentCpuUsage.system - this.lastCpuUsage.system) / 1000000; // Convert to seconds
    this.lastCpuUsage = currentCpuUsage;

    // In a real implementation, you would track active connections
    const activeConnections = 0; // Placeholder

    return {
      memoryUsage,
      cpuUsage,
      activeConnections
    };
  }

  /**
   * Resets error statistics
   */
  resetErrorStats(): void {
    ErrorHandler.getInstance().resetErrorCounts();
  }

  /**
   * Stops the health API
   */
  stop(): void {
    this.healthChecker.stopPeriodicChecks();
  }
}

// Singleton instance
let healthAPIInstance: HealthAPI | null = null;

export function getHealthAPI(): HealthAPI {
  if (!healthAPIInstance) {
    healthAPIInstance = new HealthAPI();
  }
  return healthAPIInstance;
}

// Graceful shutdown
process.on('SIGTERM', () => {
  if (healthAPIInstance) {
    healthAPIInstance.stop();
  }
});

process.on('SIGINT', () => {
  if (healthAPIInstance) {
    healthAPIInstance.stop();
  }
}); 