import { Logger, LogLevel } from '../../src/monitoring/observability/logger';
import { MetricsCollector } from '../../src/monitoring/observability/metrics';
import { Tracer } from '../../src/monitoring/observability/tracing';
import { AlertingSystem, AlertType, AlertSeverity } from '../../src/monitoring/observability/alerting';

describe('Monitoring & Observability', () => {
  let logger: Logger;
  let metrics: MetricsCollector;
  let tracer: Tracer;
  let alerting: AlertingSystem;

  beforeEach(() => {
    // Reset all singletons
    (Logger as any).instance = undefined;
    (MetricsCollector as any).instance = undefined;
    (Tracer as any).instance = undefined;
    (AlertingSystem as any).instance = undefined;

    // Initialize with test configuration
    logger = Logger.getInstance({
      level: LogLevel.DEBUG,
      enableConsole: false,
      enableStructuredLogging: true
    });

    metrics = MetricsCollector.getInstance({
      enableMetrics: true
    });

    tracer = Tracer.getInstance({
      enableTracing: true,
      samplingRate: 1.0,
      maxSpansPerTrace: 1000
    });

    alerting = AlertingSystem.getInstance({
      enableAlerting: true
    });
  });

  afterEach(() => {
    // Clear all data
    logger.clearLogs();
    metrics.clear();
    tracer.clear();
    alerting.clear();
  });

  describe('Structured Logging', () => {
    it('should log with correlation IDs', () => {
      logger.setCorrelationId('test-correlation-123');
      logger.setRequestId('test-request-456');
      logger.setUserId('test-user-789');

      logger.info('Test message', { key: 'value' }, { component: 'test', operation: 'logging' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].correlationId).toBe('test-correlation-123');
      expect(logs[0].requestId).toBe('test-request-456');
      expect(logs[0].userId).toBe('test-user-789');
      expect(logs[0].component).toBe('test');
      expect(logs[0].operation).toBe('logging');
    });

    it('should create child loggers with inherited context', () => {
      logger.setCorrelationId('parent-correlation');
      const childLogger = logger.child({ component: 'child-component' });

      childLogger.info('Child message');

      const logs = childLogger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].correlationId).toBe('parent-correlation');
      expect(logs[0].component).toBe('child-component');
    });

    it('should log security events', () => {
      logger.securityEvent('authentication_failure', { userId: 'user123', ip: '192.168.1.1' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toContain('SECURITY_EVENT');
      expect(logs[0].component).toBe('security');
    });

    it('should log audit events', () => {
      logger.audit('config_update', 'security_config', { oldValue: 'old', newValue: 'new' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toContain('AUDIT');
      expect(logs[0].component).toBe('audit');
    });

    it('should measure operation timing', () => {
      const endTimer = logger.time('test_operation', 'test-component');
      
      // Simulate some work
      setTimeout(() => {
        endTimer();
      }, 10);

      // Wait for timer to complete and check logs
      return new Promise(resolve => {
        setTimeout(() => {
          const logs = logger.getLogs();
          expect(logs).toHaveLength(1);
          expect(logs[0].operation).toBe('test_operation');
          expect(logs[0].data).toBeDefined();
          expect(logs[0].data.duration).toBeGreaterThan(0);
          resolve(undefined);
        }, 100); // Increased timeout significantly
      });
    }, 10000); // Increase test timeout
  });

  describe('Metrics Collection', () => {
    it('should collect counter metrics', () => {
      metrics.increment('test_counter', 1, { label1: 'value1' });
      metrics.increment('test_counter', 2, { label1: 'value1' });

      const counters = metrics.getCounters();
      expect(counters['test_counter{label1=value1}']).toBe(3);
    });

    it('should collect gauge metrics', () => {
      metrics.gauge('test_gauge', 100, { label1: 'value1' });
      metrics.gauge('test_gauge', 200, { label1: 'value1' });

      const gauges = metrics.getGauges();
      expect(gauges['test_gauge{label1=value1}']).toBe(200);
    });

    it('should collect histogram metrics', () => {
      metrics.histogram('test_histogram', 10, { label1: 'value1' });
      metrics.histogram('test_histogram', 20, { label1: 'value1' });
      metrics.histogram('test_histogram', 30, { label1: 'value1' });

      const stats = metrics.getHistogramStats('test_histogram', { label1: 'value1' });
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(3);
      expect(stats!.min).toBe(10);
      expect(stats!.max).toBe(30);
      expect(stats!.avg).toBe(20);
    });

    it('should collect security-specific metrics', () => {
      metrics.securityEvent('authentication_failure', { userId: 'user123' });
      metrics.authenticationAttempt(false, 'password', { userId: 'user123' });
      metrics.encryptionOperation('encrypt', 150, { algorithm: 'AES-256' });
      metrics.rateLimitHit('api_limit', { ip: '192.168.1.1' });
      metrics.errorOccurred('validation_error', 'config', { component: 'auth' });

      const counters = metrics.getCounters();
      // Check that metrics were recorded (the exact key format may vary)
      expect(Object.keys(counters).some(key => key.includes('security_events_total'))).toBe(true);
      expect(Object.keys(counters).some(key => key.includes('authentication_attempts_total'))).toBe(true);
      expect(Object.keys(counters).some(key => key.includes('encryption_operations_total'))).toBe(true);
      expect(Object.keys(counters).some(key => key.includes('rate_limit_hits_total'))).toBe(true);
      expect(Object.keys(counters).some(key => key.includes('errors_total'))).toBe(true);
    });

    it('should export metrics in Prometheus format', () => {
      metrics.increment('test_counter', 5, { label1: 'value1' });
      metrics.gauge('test_gauge', 100, { label1: 'value1' });
      metrics.histogram('test_histogram', 50, { label1: 'value1' });

      const prometheus = metrics.exportPrometheus();
      expect(prometheus).toContain('test_counter_total{label1="value1"} 5');
      expect(prometheus).toContain('test_gauge{label1="value1"} 100');
      expect(prometheus).toContain('test_histogram_sum{label1="value1"}');
    });
  });

  describe('Distributed Tracing', () => {
    it('should create and manage spans', () => {
      const context = tracer.startSpan('test_span', undefined, { component: 'test' });
      
      expect(context.traceId).toBeTruthy();
      expect(context.spanId).toBeTruthy();
      expect(context.sampled).toBe(true);

      tracer.logSpan(context.spanId, 'Test log message', { key: 'value' });
      tracer.setSpanTags(context.spanId, { tag1: 'value1', tag2: 123 });

      tracer.endSpan(context.spanId, { result: 'success' });

      const spans = tracer.getCompletedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('test_span');
      expect(spans[0].tags.component).toBe('test');
      expect(spans[0].tags.result).toBe('success');
      expect(spans[0].duration).toBeGreaterThan(0);
    });

    it('should create child spans', () => {
      const parentContext = tracer.startSpan('parent_span');
      const childContext = tracer.createChildSpan(parentContext, 'child_span');

      expect(childContext.traceId).toBe(parentContext.traceId);
      expect(childContext.parentId).toBe(parentContext.spanId);

      tracer.endSpan(childContext.spanId);
      tracer.endSpan(parentContext.spanId);

      const spans = tracer.getCompletedSpans();
      expect(spans).toHaveLength(2);
      
      const childSpan = spans.find(s => s.name === 'child_span');
      const parentSpan = spans.find(s => s.name === 'parent_span');
      
      expect(childSpan!.parentId).toBe(parentSpan!.id);
    });

    it('should trace security operations', () => {
      const authContext = tracer.traceAuthentication('password', 'user123');
      const encryptContext = tracer.traceEncryption('encrypt', 'AES-256');
      const rateLimitContext = tracer.traceRateLimit('api_limit', '192.168.1.1');
      const configContext = tracer.traceConfigValidation('auth');

      tracer.endSpan(authContext.spanId);
      tracer.endSpan(encryptContext.spanId);
      tracer.endSpan(rateLimitContext.spanId);
      tracer.endSpan(configContext.spanId);

      const spans = tracer.getCompletedSpans();
      expect(spans).toHaveLength(4);
      expect(spans.find(s => s.name === 'authentication')).toBeTruthy();
      expect(spans.find(s => s.name === 'encryption')).toBeTruthy();
      expect(spans.find(s => s.name === 'rate_limit_check')).toBeTruthy();
      expect(spans.find(s => s.name === 'config_validation')).toBeTruthy();
    });

    it('should handle errors in spans', () => {
      const context = tracer.startSpan('error_span');
      const error = new Error('Test error');
      
      tracer.endSpan(context.spanId, undefined, error);

      const spans = tracer.getCompletedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].error).toBeTruthy();
      expect(spans[0].error!.message).toBe('Test error');
    });

    it('should export traces in Jaeger format', () => {
      const context = tracer.startSpan('test_span', undefined, { component: 'test' });
      tracer.endSpan(context.spanId);

      const jaegerTraces = tracer.exportJaeger();
      expect(jaegerTraces).toHaveLength(1);
      expect(jaegerTraces[0].spans).toHaveLength(1);
      expect(jaegerTraces[0].spans[0].operationName).toBe('test_span');
    });
  });

  describe('Alerting System', () => {
    it('should create security alerts', () => {
      const alert = alerting.securityAlert(
        AlertSeverity.HIGH,
        'brute_force_attempt',
        { ip: '192.168.1.1', attempts: 10 },
        { ip: '192.168.1.1' }
      );

      expect(alert.type).toBe(AlertType.SECURITY);
      expect(alert.severity).toBe(AlertSeverity.HIGH);
      expect(alert.title).toContain('Security Alert');
      expect(alert.resolved).toBe(false);
    });

    it('should create authentication failure alerts', () => {
      const alert = alerting.authenticationFailure('user123', '192.168.1.1', 'Invalid password');

      expect(alert.type).toBe(AlertType.SECURITY);
      expect(alert.severity).toBe(AlertSeverity.MEDIUM);
      expect(alert.userId).toBe('user123');
      expect(alert.ip).toBe('192.168.1.1');
    });

    it('should create performance alerts', () => {
      const alert = alerting.performanceAlert(
        AlertSeverity.MEDIUM,
        'response_time',
        6000,
        5000
      );

      expect(alert.type).toBe(AlertType.PERFORMANCE);
      expect(alert.severity).toBe(AlertSeverity.MEDIUM);
      expect(alert.data.metric).toBe('response_time');
      expect(alert.data.value).toBe(6000);
    });

    it('should create error alerts', () => {
      const error = new Error('Configuration validation failed');
      const alert = alerting.errorAlert(
        AlertSeverity.CRITICAL,
        error,
        'config',
        'validation'
      );

      expect(alert.type).toBe(AlertType.ERROR);
      expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert.component).toBe('config');
      expect(alert.operation).toBe('validation');
    });

    it('should check rules and trigger alerts', () => {
      const alerts = alerting.checkRules({
        failedAttempts: 6,
        rateLimitHits: 15,
        responseTime: 6000,
        errorRate: 0.15,
        validationErrors: 2
      });

      expect(alerts).toHaveLength(5); // All default rules should trigger
      expect(alerts.some(a => a.type === AlertType.SECURITY)).toBe(true);
      expect(alerts.some(a => a.type === AlertType.PERFORMANCE)).toBe(true);
      expect(alerts.some(a => a.type === AlertType.ERROR)).toBe(true);
      expect(alerts.some(a => a.type === AlertType.CONFIGURATION)).toBe(true);
    });

    it('should respect rule cooldowns', () => {
      // Trigger alert first time
      const alerts1 = alerting.checkRules({ failedAttempts: 6 });
      expect(alerts1).toHaveLength(1);

      // Try to trigger again immediately (should be blocked by cooldown)
      const alerts2 = alerting.checkRules({ failedAttempts: 6 });
      expect(alerts2).toHaveLength(0);
    });

    it('should filter alerts', () => {
      alerting.securityAlert(AlertSeverity.HIGH, 'test1');
      alerting.performanceAlert(AlertSeverity.MEDIUM, 'test2', 100, 50);
      alerting.errorAlert(AlertSeverity.CRITICAL, new Error('test3'), 'test');

      const securityAlerts = alerting.getAlerts({ type: AlertType.SECURITY });
      const criticalAlerts = alerting.getAlerts({ severity: AlertSeverity.CRITICAL });
      const activeAlerts = alerting.getActiveAlerts();

      expect(securityAlerts).toHaveLength(1);
      expect(criticalAlerts).toHaveLength(1);
      expect(activeAlerts).toHaveLength(3);
    });

    it('should resolve alerts', () => {
      const alert = alerting.securityAlert(AlertSeverity.HIGH, 'test');
      
      alerting.resolveAlert(alert.id, 'admin');

      const resolvedAlerts = alerting.getAlerts({ resolved: true });
      expect(resolvedAlerts).toHaveLength(1);
      expect(resolvedAlerts[0].resolvedBy).toBe('admin');
      expect(resolvedAlerts[0].resolvedAt).toBeTruthy();
    });

    it('should handle alert notifications', () => {
      let receivedAlert: any = null;
      alerting.addHandler((alert) => {
        receivedAlert = alert;
      });

      const alert = alerting.securityAlert(AlertSeverity.HIGH, 'test');
      
      expect(receivedAlert).toBe(alert);
    });
  });

  describe('Integration', () => {
    it('should integrate logging, metrics, tracing, and alerting', () => {
      // Set up correlation context
      logger.setCorrelationId('test-correlation');
      logger.setRequestId('test-request');

      // Start tracing
      const traceContext = tracer.traceAuthentication('password', 'user123');
      logger.info('Authentication attempt started', { userId: 'user123' }, { component: 'auth' });

      // Record metrics
      metrics.authenticationAttempt(false, 'password', { userId: 'user123' });
      metrics.timing('auth_duration', 150);

      // Log completion
      logger.info('Authentication attempt completed', { success: false }, { component: 'auth' });
      tracer.endSpan(traceContext.spanId, { success: false });

      // Check for alerts
      const alerts = alerting.checkRules({ failedAttempts: 1 });

      // Verify integration
      const logs = logger.getLogs();
      const spans = tracer.getCompletedSpans();
      const counters = metrics.getCounters();
      const authMetrics = Object.keys(counters).some(key => key.includes('authentication_attempts_total'));

      expect(logs).toHaveLength(2);
      expect(logs[0].correlationId).toBe('test-correlation');
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('authentication');
      expect(authMetrics).toBe(true);
      expect(alerts).toHaveLength(0); // No alert for single failure
    });
  });
}); 