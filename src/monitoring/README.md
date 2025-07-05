# CipherPay SDK Monitoring & Observability Package

A comprehensive monitoring and observability system for the CipherPay SDK, providing structured logging, metrics collection, distributed tracing, alerting, and health checks.

## 🏗️ Package Structure

```
src/monitoring/
├── README.md                    # This file
├── index.ts                     # Main package exports
├── HealthChecker.ts             # Health check system
├── HealthAPI.ts                 # Health check API
├── HealthServer.ts              # Health check server
└── observability/               # Observability components
    ├── index.ts                 # Observability exports
    ├── manager.ts               # Main observability manager
    ├── logger.ts                # Structured logging system
    ├── metrics.ts               # Metrics collection system
    ├── tracing.ts               # Distributed tracing system
    ├── alerting.ts              # Alerting system
    ├── types.ts                 # TypeScript type definitions
    └── utils.ts                 # Utility functions
```

## 🚀 Quick Start

### Basic Setup

```typescript
import { ObservabilityManager } from '@cipherpay/sdk/monitoring';

// Initialize observability with configuration
const observability = ObservabilityManager.getInstance({
  serviceName: 'my-service',
  environment: 'production',
  logger: {
    level: 'INFO',
    enableConsole: true,
    enableStructuredLogging: true
  },
  metrics: {
    enableMetrics: true,
    flushInterval: 60000
  },
  tracing: {
    enableTracing: true,
    samplingRate: 1.0
  },
  alerting: {
    enableAlerting: true
  }
});

// Initialize correlation context for a request
const context = observability.initializeContext({
  userId: 'user123',
  correlationId: 'corr-123'
});
```

### Request Monitoring

```typescript
// Start monitoring a request
const spanId = observability.startRequestMonitoring('POST', '/api/payment', '192.168.1.1');

try {
  // Your business logic here
  const result = await processPayment();
  
  // End monitoring with success
  observability.endRequestMonitoring(spanId, 200, Date.now() - startTime);
} catch (error) {
  // End monitoring with error
  observability.endRequestMonitoring(spanId, 500, Date.now() - startTime);
  observability.monitorError(error, 'payment', 'process_payment');
}
```

### Security Monitoring

```typescript
// Monitor authentication attempts
observability.monitorAuthentication('password', false, 'user123', '192.168.1.1', 'Invalid password');

// Monitor security events
observability.monitorSecurityEvent('brute_force_attempt', 'high', {
  attempts: 10,
  timeWindow: '5m'
}, { ip: '192.168.1.1' });

// Monitor encryption operations
observability.monitorEncryption('encrypt', 'AES-256', 150);
```

## 📊 Components

### 1. Structured Logging (`logger.ts`)

**Features:**
- Correlation ID tracking
- Request ID tracking
- Structured JSON logging
- Component and operation tagging
- Performance timing
- Security event logging
- Audit logging

**Usage:**
```typescript
import { Logger } from '@cipherpay/sdk/monitoring';

const logger = Logger.getInstance({
  level: 'INFO',
  enableStructuredLogging: true
});

logger.setCorrelationId('corr-123');
logger.info('Payment processed', { amount: 100 }, { component: 'payment', operation: 'process' });
```

### 2. Metrics Collection (`metrics.ts`)

**Features:**
- Counter, gauge, and histogram metrics
- Security-specific metrics
- Performance metrics
- Prometheus format export
- Automatic metric aggregation

**Usage:**
```typescript
import { MetricsCollector } from '@cipherpay/sdk/monitoring';

const metrics = MetricsCollector.getInstance();

// Record security metrics
metrics.authenticationAttempt(false, 'password', { userId: 'user123' });
metrics.securityEvent('brute_force_attempt', { ip: '192.168.1.1' });

// Record performance metrics
metrics.timing('request_duration', 150, { endpoint: '/api/payment' });

// Export Prometheus format
const prometheusMetrics = metrics.exportPrometheus();
```

### 3. Distributed Tracing (`tracing.ts`)

**Features:**
- Request tracing with spans
- Parent-child span relationships
- Span tagging and logging
- Jaeger and Zipkin format export
- Security operation tracing

**Usage:**
```typescript
import { Tracer } from '@cipherpay/sdk/monitoring';

const tracer = Tracer.getInstance();

// Start a trace
const context = tracer.traceRequest('POST', '/api/payment', '192.168.1.1');

// Create child spans
const childContext = tracer.createChildSpan(context, 'database_query');

// End spans
tracer.endSpan(childContext.spanId);
tracer.endSpan(context.spanId);

// Export traces
const jaegerTraces = tracer.exportJaeger();
```

### 4. Alerting System (`alerting.ts`)

**Features:**
- Configurable alert rules
- Multiple alert types (security, performance, error, configuration)
- Alert severity levels
- Cooldown periods
- Alert resolution tracking

**Usage:**
```typescript
import { AlertingSystem, AlertSeverity } from '@cipherpay/sdk/monitoring';

const alerting = AlertingSystem.getInstance();

// Create security alerts
alerting.authenticationFailure('user123', '192.168.1.1', 'Invalid password');
alerting.bruteForceAttempt('192.168.1.1', 10);

// Create performance alerts
alerting.performanceAlert('medium', 'response_time', 6000, 5000);

// Check alert rules
const alerts = alerting.checkRules({
  failedAttempts: 6,
  responseTime: 6000
});
```

### 5. Health Checks (`HealthChecker.ts`)

**Features:**
- Comprehensive health checks
- Custom health check providers
- Health status aggregation
- Health check API endpoints

**Usage:**
```typescript
import { HealthChecker } from '@cipherpay/sdk/monitoring';

const healthChecker = new HealthChecker();

// Add custom health checks
healthChecker.addCheck('database', async () => {
  // Check database connectivity
  return { status: 'healthy', message: 'Database is accessible' };
});

// Get health status
const health = await healthChecker.checkHealth();
```

## 🔧 Configuration

### Observability Configuration

```typescript
interface ObservabilityConfig {
  // Logger configuration
  logger?: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    enableConsole: boolean;
    enableFile?: boolean;
    filePath?: string;
    enableStructuredLogging?: boolean;
    enableCorrelationIds?: boolean;
    serviceName?: string;
    environment?: string;
  };

  // Metrics configuration
  metrics?: {
    enableMetrics: boolean;
    metricsEndpoint?: string;
    flushInterval?: number;
    serviceName?: string;
    environment?: string;
  };

  // Tracing configuration
  tracing?: {
    enableTracing: boolean;
    samplingRate: number; // 0.0 to 1.0
    maxSpansPerTrace: number;
    serviceName?: string;
    environment?: string;
  };

  // Alerting configuration
  alerting?: {
    enableAlerting: boolean;
    alertEndpoint?: string;
    webhookUrl?: string;
    emailConfig?: EmailConfig;
    slackConfig?: SlackConfig;
    serviceName?: string;
    environment?: string;
  };

  // Global settings
  serviceName?: string;
  environment?: string;
  enableCorrelationIds?: boolean;
  enableRequestIds?: boolean;
}
```

## 📈 Metrics & Monitoring

### Available Metrics

**Security Metrics:**
- Authentication attempts (success/failure)
- Authorization checks
- Rate limit hits
- Encryption operations
- Security events
- Audit events

**Performance Metrics:**
- Request duration
- Request count
- Error rates
- Database query performance
- Cache hit rates
- Memory usage

**System Metrics:**
- CPU usage
- Memory usage
- Disk usage
- Network latency
- Active connections
- Process uptime

### Prometheus Integration

The metrics system exports data in Prometheus format for easy integration with monitoring systems:

```bash
# Example Prometheus metrics output
authentication_attempts_total{success="false",method="password"} 15
request_duration_sum{method="POST",endpoint="/api/payment"} 1500
security_events_total{event="brute_force_attempt"} 3
```

## 🔍 Distributed Tracing

### Trace Propagation

The tracing system supports trace context propagation across service boundaries:

```typescript
// Extract trace context from headers
const context = tracer.parseTraceContext(headers);

// Create child spans in downstream services
const childSpan = tracer.createChildSpan(context, 'downstream_operation');
```

### Trace Export Formats

**Jaeger Format:**
```typescript
const jaegerTraces = tracer.exportJaeger();
// Compatible with Jaeger UI and backend
```

**Zipkin Format:**
```typescript
const zipkinTraces = tracer.exportZipkin();
// Compatible with Zipkin UI and backend
```

## 🚨 Alerting Rules

### Default Alert Rules

The system includes pre-configured alert rules:

1. **Authentication Failure Threshold** - Triggers when 5+ failed attempts
2. **Rate Limit Exceeded** - Triggers when rate limit hit 10+ times
3. **Response Time Threshold** - Triggers when response time > 5s
4. **Error Rate Threshold** - Triggers when error rate > 10%
5. **Configuration Validation Failure** - Triggers on config validation errors

### Custom Alert Rules

```typescript
alerting.addRule({
  id: 'custom_rule',
  name: 'Custom Business Rule',
  type: 'business',
  severity: 'medium',
  condition: (data) => data.businessMetric > 1000,
  message: 'Business metric exceeded threshold',
  enabled: true,
  cooldown: 300000 // 5 minutes
});
```

## 🧪 Testing

### Running Tests

```bash
# Run all monitoring tests
npm test -- --testNamePattern="Monitoring"

# Run specific test suites
npm test -- --testNamePattern="Structured Logging"
npm test -- --testNamePattern="Metrics Collection"
npm test -- --testNamePattern="Distributed Tracing"
npm test -- --testNamePattern="Alerting System"
```

### Test Utilities

The package includes utilities for testing:

```typescript
// Clear all observability data
observability.clear();

// Reset singleton instances
ObservabilityManager.resetInstance();
Logger.getInstance().clearLogs();
MetricsCollector.getInstance().clear();
Tracer.getInstance().clear();
AlertingSystem.getInstance().clear();
```

## 🔒 Security Considerations

### Data Sanitization

The logging system automatically sanitizes sensitive data:

```typescript
// Sensitive data is automatically redacted
logger.info('User login', { 
  userId: 'user123',
  password: 'secret123', // Will be redacted as [REDACTED]
  token: 'jwt-token'     // Will be redacted as [REDACTED]
});
```

### Correlation ID Security

Correlation IDs are generated securely and don't contain sensitive information:

```typescript
// Generated correlation ID format: corr_1234567890_abc123def
const correlationId = generateCorrelationId();
```

## 📚 API Reference

### ObservabilityManager

**Main Methods:**
- `getInstance(config?)` - Get singleton instance
- `initializeContext(context?)` - Initialize correlation context
- `startRequestMonitoring(method, endpoint, ip)` - Start request monitoring
- `endRequestMonitoring(spanId, statusCode, duration)` - End request monitoring
- `monitorSecurityEvent(event, severity, data, options)` - Monitor security events
- `monitorAuthentication(method, success, userId, ip, reason)` - Monitor auth attempts
- `monitorEncryption(operation, algorithm, duration)` - Monitor encryption operations
- `monitorRateLimit(limit, ip, blocked)` - Monitor rate limiting
- `monitorConfigChange(component, action, data)` - Monitor config changes
- `monitorError(error, component, operation, context)` - Monitor errors
- `getPerformanceMetrics()` - Get performance metrics
- `getSecurityMetrics()` - Get security metrics
- `getSystemMetrics()` - Get system metrics
- `getHealthCheck()` - Get health check result
- `exportData()` - Export all observability data
- `clear()` - Clear all data (for testing)

### Utility Functions

**ID Generation:**
- `generateCorrelationId()` - Generate correlation ID
- `generateRequestId()` - Generate request ID
- `generateSessionId()` - Generate session ID
- `generateTraceId()` - Generate trace ID
- `generateSpanId()` - Generate span ID

**Data Formatting:**
- `formatDuration(durationMs)` - Format duration
- `formatBytes(bytes)` - Format bytes
- `calculatePercentage(value, total)` - Calculate percentage
- `calculateMovingAverage(values, window)` - Calculate moving average
- `calculatePercentile(values, percentile)` - Calculate percentile

**Data Sanitization:**
- `sanitizeData(data, sensitiveKeys)` - Sanitize sensitive data
- `extractIpAddress(headers)` - Extract IP from headers
- `isValidIpAddress(ip)` - Validate IP address

## 🤝 Integration Examples

### Express.js Middleware

```typescript
import { ObservabilityManager } from '@cipherpay/sdk/monitoring';

const observability = ObservabilityManager.getInstance();

app.use((req, res, next) => {
  // Initialize correlation context
  const context = observability.initializeContext({
    correlationId: req.headers['x-correlation-id'],
    requestId: req.headers['x-request-id'],
    userId: req.user?.id
  });

  // Start request monitoring
  const startTime = Date.now();
  const spanId = observability.startRequestMonitoring(
    req.method,
    req.path,
    req.ip
  );

  // Store context in request
  req.observabilityContext = context;
  req.spanId = spanId;
  req.startTime = startTime;

  next();
});

app.use((req, res, next) => {
  // End request monitoring
  const duration = Date.now() - req.startTime;
  observability.endRequestMonitoring(req.spanId, res.statusCode, duration);
  next();
});
```

### Error Handling

```typescript
app.use((error, req, res, next) => {
  // Monitor errors
  observability.monitorError(
    error,
    'http',
    `${req.method} ${req.path}`,
    {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }
  );

  next(error);
});
```

## 📊 Dashboard Integration

The observability system provides data that can be integrated with various monitoring dashboards:

- **Grafana** - Using Prometheus metrics
- **Jaeger** - Using distributed traces
- **Kibana** - Using structured logs
- **Custom Dashboards** - Using exported data

## 🔄 Migration Guide

### From Old Utils

If you were using the old utils-based monitoring:

```typescript
// Old way
import { Logger } from '../utils/logger';
import { MetricsCollector } from '../utils/metrics';

// New way
import { ObservabilityManager } from '@cipherpay/sdk/monitoring';

const observability = ObservabilityManager.getInstance();
```

### Configuration Migration

```typescript
// Old configuration
const logger = Logger.getInstance({ level: 'INFO' });
const metrics = MetricsCollector.getInstance({ enableMetrics: true });

// New unified configuration
const observability = ObservabilityManager.getInstance({
  logger: { level: 'INFO' },
  metrics: { enableMetrics: true }
});
```

## 🆘 Troubleshooting

### Common Issues

1. **Correlation IDs not propagating**
   - Ensure `enableCorrelationIds: true` in config
   - Check that `initializeContext()` is called early in request lifecycle

2. **Metrics not appearing**
   - Verify `enableMetrics: true` in config
   - Check that metrics are being flushed (default: 60s)

3. **Traces not showing in Jaeger**
   - Ensure `enableTracing: true` in config
   - Check sampling rate (default: 1.0 for all traces)
   - Verify trace export format matches Jaeger expectations

4. **Alerts not triggering**
   - Check that `enableAlerting: true` in config
   - Verify alert rules are enabled
   - Check cooldown periods

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
const observability = ObservabilityManager.getInstance({
  logger: {
    level: 'DEBUG',
    enableConsole: true
  }
});
```

## 📝 Changelog

### v1.0.0
- Initial release of monitoring package
- Structured logging with correlation IDs
- Metrics collection with Prometheus export
- Distributed tracing with Jaeger/Zipkin support
- Alerting system with configurable rules
- Health check system
- Comprehensive TypeScript types
- Full test coverage

## 📄 License

This package is part of the CipherPay SDK and follows the same license terms. 