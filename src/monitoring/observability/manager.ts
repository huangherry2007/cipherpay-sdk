import { Logger, LogLevel, type LoggerConfig } from './logger';
import { MetricsCollector, type MetricConfig } from './metrics';
import { Tracer, type TracingConfig } from './tracing';
import { AlertingSystem, AlertType, AlertSeverity, type AlertingConfig } from './alerting';
import { 
  type ObservabilityConfig, 
  type CorrelationContext,
  type MonitoringEvent,
  type PerformanceMetrics,
  type SecurityMetrics,
  type SystemMetrics,
  type HealthCheckResult
} from './types';
import { 
  generateCorrelationId, 
  generateRequestId, 
  generateSessionId,
  getCurrentTimestampMs 
} from './utils';

/**
 * Main Observability Manager
 * Orchestrates logging, metrics, tracing, and alerting for comprehensive monitoring
 */
export class ObservabilityManager {
  private static instance: ObservabilityManager;
  
  private logger: Logger;
  private metrics: MetricsCollector;
  private tracer: Tracer;
  private alerting: AlertingSystem;
  
  private config: ObservabilityConfig;
  private correlationContext: CorrelationContext | null = null;
  private isInitialized = false;

  private constructor(config: ObservabilityConfig) {
    this.config = {
      serviceName: 'cipherpay-sdk',
      environment: process.env.NODE_ENV || 'development',
      enableCorrelationIds: true,
      enableRequestIds: true,
      ...config
    };

    // Initialize components with configuration
    this.logger = Logger.getInstance(this.config.logger);
    this.metrics = MetricsCollector.getInstance(this.config.metrics);
    this.tracer = Tracer.getInstance(this.config.tracing);
    this.alerting = AlertingSystem.getInstance(this.config.alerting);

    this.isInitialized = true;
  }

  public static getInstance(config?: ObservabilityConfig): ObservabilityManager {
    if (!ObservabilityManager.instance) {
      ObservabilityManager.instance = new ObservabilityManager(config || {});
    }
    return ObservabilityManager.instance;
  }

  public static resetInstance(): void {
    ObservabilityManager.instance = undefined as any;
  }

  /**
   * Initialize correlation context for a request
   */
  public initializeContext(context?: Partial<CorrelationContext>): CorrelationContext {
    const correlationId = context?.correlationId || generateCorrelationId();
    const requestId = context?.requestId || generateRequestId();
    const sessionId = context?.sessionId || generateSessionId();

    this.correlationContext = {
      correlationId,
      requestId,
      sessionId,
      userId: context?.userId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      parentSpanId: context?.parentSpanId,
      metadata: context?.metadata
    };

    // Set correlation context in all components
    this.logger.setCorrelationId(correlationId);
    this.logger.setRequestId(requestId);
    this.logger.setSessionId(sessionId);
    if (this.correlationContext.userId) {
      this.logger.setUserId(this.correlationContext.userId);
    }

    return this.correlationContext;
  }

  /**
   * Get current correlation context
   */
  public getContext(): CorrelationContext | null {
    return this.correlationContext;
  }

  /**
   * Log a monitoring event
   */
  public logEvent(event: MonitoringEvent): void {
    const logLevel = this.getLogLevelForSeverity(event.severity);
    
    this.logger.info(
      `${event.type.toUpperCase()}_EVENT: ${event.operation}`,
      {
        ...event.data,
        component: event.component,
        operation: event.operation,
        severity: event.severity
      },
      {
        component: event.component,
        operation: event.operation
      }
    );

    // Record metrics based on event type
    this.recordEventMetrics(event);

    // Check for alerts based on event
    this.checkEventAlerts(event);
  }

  /**
   * Start monitoring a request
   */
  public startRequestMonitoring(method: string, endpoint: string, ip: string): string {
    const startTime = getCurrentTimestampMs();
    
    // Start tracing
    const traceContext = this.tracer.traceRequest(method, endpoint, ip);
    
    // Log request start
    this.logger.info('Request started', {
      method,
      endpoint,
      ip,
      startTime
    }, {
      component: 'http',
      operation: 'request_start'
    });

    // Record request metrics
    this.metrics.requestCount(method, endpoint, 200);

    return traceContext.spanId;
  }

  /**
   * End request monitoring
   */
  public endRequestMonitoring(spanId: string, statusCode: number, duration: number): void {
    // End tracing
    this.tracer.endSpan(spanId, { statusCode, duration });

    // Log request completion
    this.logger.info('Request completed', {
      statusCode,
      duration,
      endTime: getCurrentTimestampMs()
    }, {
      component: 'http',
      operation: 'request_end'
    });

    // Record performance metrics
    this.metrics.requestDuration(duration, 'GET', '/api', statusCode);
  }

  /**
   * Monitor security events
   */
  public monitorSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    data?: any,
    options?: { userId?: string; ip?: string }
  ): void {
    // Log security event
    this.logger.securityEvent(event, data, {
      component: 'security',
      operation: event,
      userId: options?.userId
    });

    // Record security metrics
    this.metrics.securityEvent(event, {
      userId: options?.userId,
      ip: options?.ip,
      ...data
    });

    // Create security alert if needed
    if (severity === 'high' || severity === 'critical') {
      const alertSeverity = severity === 'high' ? AlertSeverity.HIGH : AlertSeverity.CRITICAL;
      this.alerting.securityAlert(alertSeverity, event, data, { userId: options?.userId });
    }
  }

  /**
   * Monitor authentication attempts
   */
  public monitorAuthentication(
    method: string,
    success: boolean,
    userId?: string,
    ip?: string,
    reason?: string
  ): void {
    // Record authentication metrics
    this.metrics.authenticationAttempt(success, method, { 
      userId: userId || 'unknown', 
      ip: ip || 'unknown' 
    });

    // Log authentication event
    const event = success ? 'authentication_success' : 'authentication_failure';
    this.logger.info(`Authentication ${success ? 'succeeded' : 'failed'}`, {
      method,
      userId,
      ip,
      reason
    }, {
      component: 'auth',
      operation: event
    });

    // Create alert for failures
    if (!success) {
      this.alerting.authenticationFailure(userId || 'unknown', ip || 'unknown', reason || 'Unknown reason');
    }
  }

  /**
   * Monitor encryption operations
   */
  public monitorEncryption(operation: string, algorithm: string, duration: number): void {
    // Start tracing
    const traceContext = this.tracer.traceEncryption(operation, algorithm);
    
    // Record encryption metrics
    this.metrics.encryptionOperation(operation, duration, { algorithm });

    // Log encryption event
    this.logger.info('Encryption operation completed', {
      operation,
      algorithm,
      duration
    }, {
      component: 'encryption',
      operation
    });

    // End tracing
    this.tracer.endSpan(traceContext.spanId, { operation, algorithm, duration });
  }

  /**
   * Monitor rate limiting
   */
  public monitorRateLimit(limit: string, ip: string, blocked: boolean): void {
    // Record rate limit metrics
    this.metrics.rateLimitHit(limit, { ip, blocked: blocked.toString() });

    // Log rate limit event
    this.logger.warn('Rate limit event', {
      limit,
      ip,
      blocked
    }, {
      component: 'rate_limit',
      operation: 'rate_limit_check'
    });

    // Create alert for blocks
    if (blocked) {
      this.alerting.securityAlert(AlertSeverity.MEDIUM, 'rate_limit_blocked', { limit, ip }, { ip });
    }
  }

  /**
   * Monitor configuration changes
   */
  public monitorConfigChange(component: string, action: string, data?: any): void {
    // Record config metrics
    this.metrics.configChange(component, action);

    // Log config change
    this.logger.audit(action, `${component}_config`, data);

    // Create alert for critical changes
    if (action === 'validation_failure') {
      this.alerting.configurationAlert(AlertSeverity.CRITICAL, component, 'Configuration validation failed', data);
    }
  }

  /**
   * Monitor errors
   */
  public monitorError(
    error: Error,
    component: string,
    operation?: string,
    context?: any
  ): void {
    // Record error metrics
    this.metrics.errorOccurred(error.name, component, { operation: operation || 'unknown' });

    // Log error
    this.logger.error('Error occurred', context, {
      component,
      operation,
      error
    });

    // Create error alert
    const severity = this.getErrorSeverity(error);
    this.alerting.errorAlert(severity, error, component, operation);
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    const counters = this.metrics.getCounters();
    const gauges = this.metrics.getGauges();
    
    return {
      requestCount: counters['requests_total'] || 0,
      requestDuration: this.metrics.getHistogramStats('request_duration')?.avg || 0,
      requestSize: 0, // Would need to be tracked separately
      responseSize: 0, // Would need to be tracked separately
      requestsPerSecond: 0, // Would need to be calculated from time series
      errorsPerSecond: 0, // Would need to be calculated from time series
      cpuUsage: gauges['cpu_usage'] || 0,
      memoryUsage: gauges['memory_usage_bytes'] || 0,
      diskUsage: gauges['disk_usage'] || 0,
      dbConnections: gauges['active_connections'] || 0,
      dbQueryDuration: this.metrics.getHistogramStats('database_query_duration')?.avg || 0,
      dbQueryCount: counters['database_queries_total'] || 0,
      cacheHitRate: gauges['cache_hit_rate'] || 0,
      cacheSize: gauges['cache_size'] || 0,
      cacheEvictions: counters['cache_evictions_total'] || 0,
      networkLatency: this.metrics.getHistogramStats('network_latency')?.avg || 0,
      bandwidthUsage: gauges['bandwidth_usage'] || 0,
      connectionCount: gauges['active_connections'] || 0
    };
  }

  /**
   * Get security metrics
   */
  public getSecurityMetrics(): SecurityMetrics {
    const counters = this.metrics.getCounters();
    
    return {
      authenticationAttempts: counters['authentication_attempts_total'] || 0,
      authenticationFailures: counters['authentication_attempts_total{success=false}'] || 0,
      authenticationSuccesses: counters['authentication_attempts_total{success=true}'] || 0,
      bruteForceAttempts: counters['security_events_total{event=brute_force_attempt}'] || 0,
      authorizationChecks: counters['authorization_checks_total'] || 0,
      authorizationFailures: counters['authorization_failures_total'] || 0,
      permissionDenials: counters['permission_denials_total'] || 0,
      rateLimitHits: counters['rate_limit_hits_total'] || 0,
      rateLimitBlocks: counters['rate_limit_blocks_total'] || 0,
      suspiciousActivities: counters['security_events_total{event=suspicious_activity}'] || 0,
      encryptionOperations: counters['encryption_operations_total'] || 0,
      encryptionFailures: counters['encryption_failures_total'] || 0,
      keyRotations: counters['key_rotations_total'] || 0,
      auditEvents: counters['audit_events_total'] || 0,
      auditFailures: counters['audit_failures_total'] || 0,
      complianceViolations: counters['compliance_violations_total'] || 0
    };
  }

  /**
   * Get system metrics
   */
  public getSystemMetrics(): SystemMetrics {
    const gauges = this.metrics.getGauges();
    
    return {
      uptime: process.uptime() * 1000, // Convert to milliseconds
      version: process.env.npm_package_version || 'unknown',
      buildNumber: process.env.BUILD_NUMBER || 'unknown',
      processId: process.pid,
      processUptime: process.uptime() * 1000,
      processMemory: process.memoryUsage().heapUsed,
      systemLoad: gauges['system_load'] || 0,
      systemMemory: gauges['system_memory_usage'] || 0,
      systemDisk: gauges['system_disk_usage'] || 0,
      heapUsage: process.memoryUsage().heapUsed,
      gcDuration: 0, // Would need GC monitoring
      gcCount: 0, // Would need GC monitoring
      customMetrics: {} // Would be populated by custom metrics
    };
  }

  /**
   * Get health check result
   */
  public getHealthCheck(): HealthCheckResult {
    const checks: HealthCheckResult['checks'] = {
      logger: {
        status: this.logger ? 'healthy' : 'unhealthy',
        message: this.logger ? 'Logger is operational' : 'Logger is not available'
      },
      metrics: {
        status: this.metrics ? 'healthy' : 'unhealthy',
        message: this.metrics ? 'Metrics collector is operational' : 'Metrics collector is not available'
      },
      tracer: {
        status: this.tracer ? 'healthy' : 'unhealthy',
        message: this.tracer ? 'Tracer is operational' : 'Tracer is not available'
      },
      alerting: {
        status: this.alerting ? 'healthy' : 'unhealthy',
        message: this.alerting ? 'Alerting system is operational' : 'Alerting system is not available'
      }
    };

    const summary = {
      total: Object.keys(checks).length,
      healthy: Object.values(checks).filter(c => c.status === 'healthy').length,
      unhealthy: Object.values(checks).filter(c => c.status === 'unhealthy').length,
      degraded: Object.values(checks).filter(c => c.status === 'degraded').length
    };

    const overallStatus = summary.unhealthy > 0 ? 'unhealthy' : 
                         summary.degraded > 0 ? 'degraded' : 'healthy';

    return {
      status: overallStatus,
      timestamp: getCurrentTimestampMs(),
      checks,
      summary
    };
  }

  /**
   * Export all observability data
   */
  public exportData(): {
    logs: any[];
    metrics: string;
    traces: any[];
    alerts: any[];
    health: HealthCheckResult;
  } {
    return {
      logs: this.logger.getLogs(),
      metrics: this.metrics.exportPrometheus(),
      traces: this.tracer.exportJaeger(),
      alerts: this.alerting.getAlerts(),
      health: this.getHealthCheck()
    };
  }

  /**
   * Clear all observability data (useful for testing)
   */
  public clear(): void {
    this.logger.clearLogs();
    this.metrics.clear();
    this.tracer.clear();
    this.alerting.clear();
    this.correlationContext = null;
  }

  // Private helper methods

  private getLogLevelForSeverity(severity: string): LogLevel {
    switch (severity) {
      case 'critical':
        return LogLevel.ERROR;
      case 'high':
        return LogLevel.ERROR;
      case 'medium':
        return LogLevel.WARN;
      case 'low':
        return LogLevel.INFO;
      default:
        return LogLevel.INFO;
    }
  }

  private recordEventMetrics(event: MonitoringEvent): void {
    // Record event-specific metrics based on type
    switch (event.type) {
      case 'security':
        this.metrics.securityEvent(event.operation, {
          severity: event.severity,
          component: event.component,
          ...event.data
        });
        break;
      case 'performance':
        if (event.data?.duration) {
          this.metrics.timing(`${event.component}_${event.operation}_duration`, event.data.duration);
        }
        break;
      case 'error':
        this.metrics.errorOccurred(event.operation, event.component, event.data);
        break;
    }
  }

  private checkEventAlerts(event: MonitoringEvent): void {
    // Check for alert conditions based on event
    if (event.severity === 'critical') {
      this.alerting.createAlert(
        AlertType.ERROR,
        AlertSeverity.CRITICAL,
        `Critical ${event.type} event`,
        event.operation,
        event.data,
        {
          component: event.component,
          operation: event.operation
        }
      );
    }
  }

  private getErrorSeverity(error: Error): AlertSeverity {
    // Determine error severity based on error type or message
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return AlertSeverity.MEDIUM;
    }
    if (errorMessage.includes('authentication') || errorMessage.includes('authorization')) {
      return AlertSeverity.HIGH;
    }
    if (errorMessage.includes('database') || errorMessage.includes('connection')) {
      return AlertSeverity.CRITICAL;
    }
    
    return AlertSeverity.MEDIUM;
  }
} 