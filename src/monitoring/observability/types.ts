import { LogLevel } from './logger';
import { AlertType, AlertSeverity } from './alerting';

// Main observability configuration
export interface ObservabilityConfig {
  // Logger configuration
  logger?: {
    level: LogLevel;
    enableConsole: boolean;
    enableFile?: boolean;
    filePath?: string;
    enableStructuredLogging?: boolean;
    enableCorrelationIds?: boolean;
    enableMetrics?: boolean;
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
    samplingRate: number;
    maxSpansPerTrace: number;
    serviceName?: string;
    environment?: string;
  };

  // Alerting configuration
  alerting?: {
    enableAlerting: boolean;
    alertEndpoint?: string;
    webhookUrl?: string;
    emailConfig?: {
      smtpHost: string;
      smtpPort: number;
      username: string;
      password: string;
      fromEmail: string;
      toEmails: string[];
    };
    slackConfig?: {
      webhookUrl: string;
      channel: string;
    };
    serviceName?: string;
    environment?: string;
  };

  // Global settings
  serviceName?: string;
  environment?: string;
  enableCorrelationIds?: boolean;
  enableRequestIds?: boolean;
}

// Monitoring events
export interface MonitoringEvent {
  id: string;
  timestamp: number;
  type: 'security' | 'performance' | 'error' | 'system' | 'business';
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  operation: string;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  data?: any;
  metadata?: Record<string, any>;
}

// Performance metrics
export interface PerformanceMetrics {
  // Request metrics
  requestCount: number;
  requestDuration: number;
  requestSize: number;
  responseSize: number;
  
  // Throughput metrics
  requestsPerSecond: number;
  errorsPerSecond: number;
  
  // Resource metrics
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  
  // Database metrics
  dbConnections: number;
  dbQueryDuration: number;
  dbQueryCount: number;
  
  // Cache metrics
  cacheHitRate: number;
  cacheSize: number;
  cacheEvictions: number;
  
  // Network metrics
  networkLatency: number;
  bandwidthUsage: number;
  connectionCount: number;
}

// Security metrics
export interface SecurityMetrics {
  // Authentication metrics
  authenticationAttempts: number;
  authenticationFailures: number;
  authenticationSuccesses: number;
  bruteForceAttempts: number;
  
  // Authorization metrics
  authorizationChecks: number;
  authorizationFailures: number;
  permissionDenials: number;
  
  // Rate limiting metrics
  rateLimitHits: number;
  rateLimitBlocks: number;
  suspiciousActivities: number;
  
  // Encryption metrics
  encryptionOperations: number;
  encryptionFailures: number;
  keyRotations: number;
  
  // Audit metrics
  auditEvents: number;
  auditFailures: number;
  complianceViolations: number;
}

// System metrics
export interface SystemMetrics {
  // Application metrics
  uptime: number;
  version: string;
  buildNumber: string;
  
  // Process metrics
  processId: number;
  processUptime: number;
  processMemory: number;
  
  // System metrics
  systemLoad: number;
  systemMemory: number;
  systemDisk: number;
  
  // JVM/Node.js metrics
  heapUsage: number;
  gcDuration: number;
  gcCount: number;
  
  // Custom metrics
  customMetrics: Record<string, number>;
}

// Health check result
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  checks: {
    [key: string]: {
      status: 'healthy' | 'unhealthy' | 'degraded';
      message?: string;
      data?: any;
      duration?: number;
    };
  };
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

// Alert notification
export interface AlertNotification {
  id: string;
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: number;
  channel: 'email' | 'slack' | 'webhook' | 'sms';
  status: 'pending' | 'sent' | 'failed';
  retryCount: number;
  data?: any;
}

// Correlation context
export interface CorrelationContext {
  correlationId: string;
  requestId: string;
  sessionId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  metadata?: Record<string, any>;
}

// Monitoring dashboard data
export interface DashboardData {
  // Real-time metrics
  currentMetrics: {
    performance: PerformanceMetrics;
    security: SecurityMetrics;
    system: SystemMetrics;
  };
  
  // Historical data
  historicalData: {
    performance: Array<{ timestamp: number; metrics: PerformanceMetrics }>;
    security: Array<{ timestamp: number; metrics: SecurityMetrics }>;
    system: Array<{ timestamp: number; metrics: SystemMetrics }>;
  };
  
  // Active alerts
  activeAlerts: Array<{
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    timestamp: number;
  }>;
  
  // Health status
  healthStatus: HealthCheckResult;
} 