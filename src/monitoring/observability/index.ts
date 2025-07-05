// Observability Package - Comprehensive Monitoring & Observability System
// This package provides structured logging, metrics collection, distributed tracing, and alerting

// Core Observability Components
export { Logger, LogLevel, type LogEntry, type LoggerConfig } from './logger';
export { MetricsCollector, type Metric, type MetricConfig } from './metrics';
export { Tracer, type TraceSpan, type TraceContext, type TracingConfig } from './tracing';
export { 
  AlertingSystem, 
  AlertType, 
  AlertSeverity, 
  type Alert, 
  type AlertRule, 
  type AlertingConfig 
} from './alerting';

// Observability Manager - Main entry point
export { ObservabilityManager } from './manager';

// Utility functions
export { generateCorrelationId, generateRequestId } from './utils';

// Types
export type {
  ObservabilityConfig,
  MonitoringEvent,
  PerformanceMetrics,
  SecurityMetrics,
  SystemMetrics
} from './types'; 