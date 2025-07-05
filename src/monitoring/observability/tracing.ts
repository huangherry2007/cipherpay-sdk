export interface TraceSpan {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string | number | boolean>;
  logs: Array<{
    timestamp: number;
    message: string;
    data?: any;
  }>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentId?: string;
  sampled: boolean;
}

export interface TracingConfig {
  enableTracing: boolean;
  samplingRate: number; // 0.0 to 1.0
  maxSpansPerTrace: number;
  serviceName?: string;
  environment?: string;
}

export class Tracer {
  private static instance: Tracer;
  private config: TracingConfig;
  private activeSpans: Map<string, TraceSpan> = new Map();
  private completedSpans: TraceSpan[] = [];
  private traceIdCounter = 0;
  private spanIdCounter = 0;

  private constructor(config: TracingConfig) {
    this.config = {
      serviceName: 'cipherpay-sdk',
      environment: process.env.NODE_ENV || 'development',
      ...config
    };
  }

  public static getInstance(config?: TracingConfig): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer(config || { 
        enableTracing: true, 
        samplingRate: 1.0, 
        maxSpansPerTrace: 1000 
      });
    }
    return Tracer.instance;
  }

  // Generate unique IDs
  private generateTraceId(): string {
    this.traceIdCounter++;
    return `trace_${Date.now()}_${this.traceIdCounter}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSpanId(): string {
    this.spanIdCounter++;
    return `span_${Date.now()}_${this.spanIdCounter}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Start a new span
  public startSpan(name: string, parentContext?: TraceContext, tags?: Record<string, string | number | boolean>): TraceContext {
    if (!this.config.enableTracing) {
      return { traceId: '', spanId: '', sampled: false };
    }

    const traceId = parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const sampled = this.shouldSample();

    const span: TraceSpan = {
      id: spanId,
      traceId,
      parentId: parentContext?.spanId,
      name,
      startTime: Date.now(),
      tags: {
        service: this.config.serviceName || 'unknown',
        environment: this.config.environment || 'unknown',
        ...tags
      },
      logs: []
    };

    this.activeSpans.set(spanId, span);

    return {
      traceId,
      spanId,
      parentId: parentContext?.spanId,
      sampled
    };
  }

  // End a span
  public endSpan(spanId: string, tags?: Record<string, string | number | boolean>, error?: Error): void {
    if (!this.config.enableTracing) return;

    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    if (tags) {
      span.tags = { ...span.tags, ...tags };
    }

    if (error) {
      span.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      };
    }

    this.activeSpans.delete(spanId);
    this.completedSpans.push(span);

    // Limit the number of completed spans
    if (this.completedSpans.length > this.config.maxSpansPerTrace) {
      this.completedSpans = this.completedSpans.slice(-this.config.maxSpansPerTrace);
    }
  }

  // Add a log to a span
  public logSpan(spanId: string, message: string, data?: any): void {
    if (!this.config.enableTracing) return;

    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.logs.push({
      timestamp: Date.now(),
      message,
      data
    });
  }

  // Add tags to a span
  public setSpanTags(spanId: string, tags: Record<string, string | number | boolean>): void {
    if (!this.config.enableTracing) return;

    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.tags = { ...span.tags, ...tags };
  }

  // Create a child span
  public createChildSpan(parentContext: TraceContext, name: string, tags?: Record<string, string | number | boolean>): TraceContext {
    return this.startSpan(name, parentContext, tags);
  }

  // Security-specific tracing
  public traceAuthentication(method: string, userId?: string): TraceContext {
    return this.startSpan('authentication', undefined, {
      method,
      userId: userId || 'unknown',
      component: 'auth'
    });
  }

  public traceEncryption(operation: string, algorithm: string): TraceContext {
    return this.startSpan('encryption', undefined, {
      operation,
      algorithm,
      component: 'encryption'
    });
  }

  public traceRateLimit(limit: string, ip: string): TraceContext {
    return this.startSpan('rate_limit_check', undefined, {
      limit,
      ip,
      component: 'rate_limit'
    });
  }

  public traceConfigValidation(component: string): TraceContext {
    return this.startSpan('config_validation', undefined, {
      component,
      operation: 'validation'
    });
  }

  // Performance tracing
  public traceRequest(method: string, endpoint: string, ip: string): TraceContext {
    return this.startSpan('request', undefined, {
      method,
      endpoint,
      ip,
      component: 'http'
    });
  }

  public traceDatabase(operation: string, table: string): TraceContext {
    return this.startSpan('database', undefined, {
      operation,
      table,
      component: 'database'
    });
  }

  // Get all completed spans for a trace
  public getTraceSpans(traceId: string): TraceSpan[] {
    return this.completedSpans.filter(span => span.traceId === traceId);
  }

  // Get all active spans
  public getActiveSpans(): TraceSpan[] {
    return Array.from(this.activeSpans.values());
  }

  // Get all completed spans
  public getCompletedSpans(): TraceSpan[] {
    return [...this.completedSpans];
  }

  // Clear all spans (useful for testing)
  public clear(): void {
    this.activeSpans.clear();
    this.completedSpans = [];
  }

  // Export traces in Jaeger format
  public exportJaeger(): any[] {
    if (!this.config.enableTracing) return [];

    const traces: any[] = [];
    const traceGroups = new Map<string, TraceSpan[]>();

    // Group spans by trace ID
    for (const span of this.completedSpans) {
      if (!traceGroups.has(span.traceId)) {
        traceGroups.set(span.traceId, []);
      }
      traceGroups.get(span.traceId)!.push(span);
    }

    // Convert to Jaeger format
    for (const [traceId, spans] of traceGroups) {
      const jaegerSpans = spans.map(span => ({
        traceID: traceId,
        spanID: span.id,
        operationName: span.name,
        references: span.parentId ? [{
          refType: 'CHILD_OF',
          traceID: traceId,
          spanID: span.parentId
        }] : [],
        startTime: span.startTime * 1000, // Convert to microseconds
        duration: (span.duration || 0) * 1000, // Convert to microseconds
        tags: Object.entries(span.tags).map(([key, value]) => ({
          key,
          type: typeof value === 'number' ? 'float64' : 'string',
          value: value.toString()
        })),
        logs: span.logs.map(log => ({
          timestamp: log.timestamp * 1000,
          fields: [
            { key: 'message', type: 'string', value: log.message },
            ...(log.data ? [{ key: 'data', type: 'string', value: JSON.stringify(log.data) }] : [])
          ]
        })),
        ...(span.error && {
          tags: [
            ...Object.entries(span.tags).map(([key, value]) => ({
              key,
              type: typeof value === 'number' ? 'float64' : 'string',
              value: value.toString()
            })),
            { key: 'error', type: 'bool', value: 'true' },
            { key: 'error.message', type: 'string', value: span.error.message }
          ]
        })
      }));

      traces.push({
        traceID: traceId,
        spans: jaegerSpans
      });
    }

    return traces;
  }

  // Export traces in Zipkin format
  public exportZipkin(): any[] {
    if (!this.config.enableTracing) return [];

    return this.completedSpans.map(span => ({
      traceId: span.traceId,
      id: span.id,
      parentId: span.parentId,
      name: span.name,
      timestamp: span.startTime * 1000, // Convert to microseconds
      duration: (span.duration || 0) * 1000, // Convert to microseconds
      tags: span.tags,
      annotations: span.logs.map(log => ({
        timestamp: log.timestamp * 1000,
        value: log.message
      }))
    }));
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }
}

// Export singleton instance
export const tracer = Tracer.getInstance(); 