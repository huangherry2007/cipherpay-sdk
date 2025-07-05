export interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface MetricConfig {
  enableMetrics: boolean;
  metricsEndpoint?: string;
  flushInterval?: number;
  serviceName?: string;
  environment?: string;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private config: MetricConfig;
  private metrics: Metric[] = [];
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  private constructor(config: MetricConfig) {
    this.config = {
      flushInterval: 60000, // 1 minute
      serviceName: 'cipherpay-sdk',
      environment: process.env.NODE_ENV || 'development',
      ...config
    };

    if (this.config.enableMetrics) {
      this.startFlushTimer();
    }
  }

  public static getInstance(config?: MetricConfig): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector(config || { enableMetrics: true });
    }
    return MetricsCollector.instance;
  }

  // Counter metrics (increment only)
  public increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    if (!this.config.enableMetrics) return;

    const key = this.getMetricKey(name, labels);
    const currentValue = this.counters.get(key) || 0;
    this.counters.set(key, currentValue + value);

    this.metrics.push({
      name,
      value: currentValue + value,
      type: 'counter',
      labels,
      timestamp: Date.now()
    });
  }

  // Gauge metrics (can go up or down)
  public gauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enableMetrics) return;

    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);

    this.metrics.push({
      name,
      value,
      type: 'gauge',
      labels,
      timestamp: Date.now()
    });
  }

  // Histogram metrics (for measuring distributions)
  public histogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enableMetrics) return;

    const key = this.getMetricKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);

    this.metrics.push({
      name,
      value,
      type: 'histogram',
      labels,
      timestamp: Date.now()
    });
  }

  // Timing metrics
  public timing(name: string, duration: number, labels?: Record<string, string>): void {
    this.histogram(name, duration, labels);
  }

  // Security-specific metrics
  public securityEvent(event: string, labels?: Record<string, string>): void {
    this.increment('security_events_total', 1, { event, ...labels });
  }

  public authenticationAttempt(success: boolean, method: string, labels?: Record<string, string>): void {
    this.increment('authentication_attempts_total', 1, { 
      success: success.toString(), 
      method, 
      ...labels 
    });
  }

  public encryptionOperation(operation: string, duration: number, labels?: Record<string, string>): void {
    this.timing('encryption_operations_duration', duration, { operation, ...labels });
    this.increment('encryption_operations_total', 1, { operation, ...labels });
  }

  public rateLimitHit(limit: string, labels?: Record<string, string>): void {
    this.increment('rate_limit_hits_total', 1, { limit, ...labels });
  }

  public errorOccurred(errorType: string, component: string, labels?: Record<string, string>): void {
    this.increment('errors_total', 1, { error_type: errorType, component, ...labels });
  }

  // Performance metrics
  public requestDuration(duration: number, method: string, endpoint: string, statusCode: number): void {
    this.timing('request_duration', duration, { 
      method, 
      endpoint, 
      status_code: statusCode.toString() 
    });
  }

  public requestCount(method: string, endpoint: string, statusCode: number): void {
    this.increment('requests_total', 1, { 
      method, 
      endpoint, 
      status_code: statusCode.toString() 
    });
  }

  // Configuration metrics
  public configChange(component: string, action: string): void {
    this.increment('config_changes_total', 1, { component, action });
  }

  public configValidationError(component: string, errorType: string): void {
    this.increment('config_validation_errors_total', 1, { component, error_type: errorType });
  }

  // Memory and resource metrics
  public memoryUsage(bytes: number): void {
    this.gauge('memory_usage_bytes', bytes);
  }

  public activeConnections(count: number): void {
    this.gauge('active_connections', count);
  }

  // Get current metrics
  public getMetrics(): Metric[] {
    return [...this.metrics];
  }

  // Get current counters
  public getCounters(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.counters.entries()) {
      result[key] = value;
    }
    return result;
  }

  // Get current gauges
  public getGauges(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.gauges.entries()) {
      result[key] = value;
    }
    return result;
  }

  // Get histogram statistics
  public getHistogramStats(name: string, labels?: Record<string, string>): {
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
  } | null {
    const key = this.getMetricKey(name, labels);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) {
      return null;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length
    };
  }

  // Clear metrics (useful for testing)
  public clear(): void {
    this.metrics = [];
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // Export metrics in Prometheus format
  public exportPrometheus(): string {
    if (!this.config.enableMetrics) return '';

    let output = '';
    
    // Export counters
    for (const [key, value] of this.counters.entries()) {
      const [name, labels] = this.parseMetricKey(key);
      const labelString = labels ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : '';
      output += `${name}_total${labelString} ${value}\n`;
    }

    // Export gauges
    for (const [key, value] of this.gauges.entries()) {
      const [name, labels] = this.parseMetricKey(key);
      const labelString = labels ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : '';
      output += `${name}${labelString} ${value}\n`;
    }

    // Export histogram summaries
    for (const [key, values] of this.histograms.entries()) {
      const [name, labels] = this.parseMetricKey(key);
      const labelString = labels ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : '';
      
      const sum = values.reduce((a, b) => a + b, 0);
      const count = values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      output += `${name}_sum${labelString} ${sum}\n`;
      output += `${name}_count${labelString} ${count}\n`;
      output += `${name}_min${labelString} ${min}\n`;
      output += `${name}_max${labelString} ${max}\n`;
    }

    return output;
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const sortedLabels = Object.keys(labels).sort().map(key => `${key}=${labels[key]}`).join(',');
    return `${name}{${sortedLabels}}`;
  }

  private parseMetricKey(key: string): [string, Record<string, string> | undefined] {
    const match = key.match(/^(.+?)(?:\{(.+)\})?$/);
    if (!match) return [key, undefined];

    const name = match[1];
    const labelsString = match[2];
    
    if (!labelsString) return [name, undefined];

    const labels: Record<string, string> = {};
    const labelPairs = labelsString.split(',');
    
    for (const pair of labelPairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        labels[key] = value.replace(/"/g, '');
      }
    }

    return [name, labels];
  }

  private startFlushTimer(): void {
    if (this.config.flushInterval) {
      setInterval(() => {
        this.flush();
      }, this.config.flushInterval);
    }
  }

  private flush(): void {
    // TODO: Implement metrics flushing to external systems
    // This could send metrics to Prometheus, StatsD, or other monitoring systems
    
    if (this.config.metricsEndpoint) {
      // Send metrics to configured endpoint
      console.log('Flushing metrics to:', this.config.metricsEndpoint);
      console.log('Metrics:', this.exportPrometheus());
    }
  }
}

// Export singleton instance
export const metrics = MetricsCollector.getInstance(); 