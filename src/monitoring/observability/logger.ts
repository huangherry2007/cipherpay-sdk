export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  component?: string;
  operation?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile?: boolean;
  filePath?: string;
  enableStructuredLogging?: boolean;
  enableCorrelationIds?: boolean;
  enableMetrics?: boolean;
  serviceName?: string;
  environment?: string;
}

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private correlationId?: string;
  private requestId?: string;
  private sessionId?: string;
  private userId?: string;

  private constructor(config: LoggerConfig) {
    this.config = {
      enableStructuredLogging: true,
      enableCorrelationIds: true,
      enableMetrics: true,
      serviceName: 'cipherpay-sdk',
      environment: process.env.NODE_ENV || 'development',
      ...config
    };
  }

  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config || {
        level: LogLevel.INFO,
        enableConsole: true
      });
    }
    return Logger.instance;
  }

  public setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Correlation ID management
  public setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  public setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  public setUserId(userId: string): void {
    this.userId = userId;
  }

  public getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  public getRequestId(): string | undefined {
    return this.requestId;
  }

  private formatLogEntry(entry: LogEntry): string {
    if (this.config.enableStructuredLogging) {
      return JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        correlationId: entry.correlationId,
        requestId: entry.requestId,
        sessionId: entry.sessionId,
        userId: entry.userId,
        component: entry.component,
        operation: entry.operation,
        duration: entry.duration,
        service: this.config.serviceName,
        environment: this.config.environment,
        data: entry.data,
        error: entry.error
      });
    }

    return `[${entry.timestamp}] ${entry.level}: ${entry.message}${
      entry.data ? `\nData: ${JSON.stringify(entry.data, null, 2)}` : ''
    }`;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.config.enableFile || !this.config.filePath) {
      return;
    }

    try {
      const formattedEntry = this.formatLogEntry(entry) + '\n';
      // TODO: Implement file writing logic
      // This would typically use Node's fs module or a similar file system API
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  public log(level: LogLevel, message: string, data?: any, options?: {
    component?: string;
    operation?: string;
    duration?: number;
    error?: Error;
  }): void {
    if (this.getLogLevelValue(level) < this.getLogLevelValue(this.config.level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      correlationId: this.correlationId,
      requestId: this.requestId,
      sessionId: this.sessionId,
      userId: this.userId,
      component: options?.component,
      operation: options?.operation,
      duration: options?.duration,
      error: options?.error ? {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
        code: (options.error as any).code
      } : undefined
    };

    this.logBuffer.push(entry);

    if (this.config.enableConsole) {
      const formattedMessage = this.formatLogEntry(entry);
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
      }
    }

    if (this.config.enableFile) {
      this.writeToFile(entry);
    }

    // Emit metrics if enabled
    if (this.config.enableMetrics) {
      this.emitMetrics(entry);
    }
  }

  private emitMetrics(entry: LogEntry): void {
    // TODO: Implement metrics emission
    // This would typically send metrics to Prometheus, StatsD, or similar
    const metric = {
      name: `log_${entry.level.toLowerCase()}`,
      value: 1,
      labels: {
        component: entry.component || 'unknown',
        operation: entry.operation || 'unknown',
        service: this.config.serviceName,
        environment: this.config.environment
      }
    };
    
    // For now, just log the metric
    if (this.config.enableConsole) {
      console.log(`METRIC: ${JSON.stringify(metric)}`);
    }
  }

  private getLogLevelValue(level: LogLevel): number {
    switch (level) {
      case LogLevel.DEBUG:
        return 0;
      case LogLevel.INFO:
        return 1;
      case LogLevel.WARN:
        return 2;
      case LogLevel.ERROR:
        return 3;
      default:
        return 1;
    }
  }

  public debug(message: string, data?: any, options?: { component?: string; operation?: string }): void {
    this.log(LogLevel.DEBUG, message, data, options);
  }

  public info(message: string, data?: any, options?: { component?: string; operation?: string }): void {
    this.log(LogLevel.INFO, message, data, options);
  }

  public warn(message: string, data?: any, options?: { component?: string; operation?: string }): void {
    this.log(LogLevel.WARN, message, data, options);
  }

  public error(message: string, data?: any, options?: { 
    component?: string; 
    operation?: string; 
    error?: Error;
  }): void {
    this.log(LogLevel.ERROR, message, data, options);
  }

  // Performance logging
  public time(operation: string, component?: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info(`Operation completed: ${operation}`, { duration }, { component, operation });
    };
  }

  // Security event logging
  public securityEvent(event: string, data?: any, options?: { 
    component?: string; 
    operation?: string;
    userId?: string;
  }): void {
    this.warn(`SECURITY_EVENT: ${event}`, data, {
      component: options?.component || 'security',
      operation: options?.operation || event
    });
  }

  // Audit logging
  public audit(action: string, resource: string, data?: any, options?: {
    component?: string;
    operation?: string;
    userId?: string;
  }): void {
    this.info(`AUDIT: ${action} on ${resource}`, data, {
      component: options?.component || 'audit',
      operation: options?.operation || action
    });
  }

  public getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  public clearLogs(): void {
    this.logBuffer = [];
  }

  // Create a child logger with inherited context
  public child(options: {
    component?: string;
    correlationId?: string;
    requestId?: string;
    sessionId?: string;
    userId?: string;
  }): Logger {
    const childLogger = new Logger(this.config);
    if (this.correlationId) childLogger.setCorrelationId(this.correlationId);
    if (this.requestId) childLogger.setRequestId(this.requestId);
    if (this.sessionId) childLogger.setSessionId(this.sessionId);
    if (this.userId) childLogger.setUserId(this.userId);
    if (options.correlationId) childLogger.setCorrelationId(options.correlationId);
    if (options.requestId) childLogger.setRequestId(options.requestId);
    if (options.sessionId) childLogger.setSessionId(options.sessionId);
    if (options.userId) childLogger.setUserId(options.userId);
    
    // Override the info method to include the component
    if (options.component) {
      const originalInfo = childLogger.info.bind(childLogger);
      childLogger.info = (message: string, data?: any, infoOptions?: { component?: string; operation?: string }) => {
        originalInfo(message, data, { 
          component: options.component, 
          operation: infoOptions?.operation 
        });
      };
    }
    
    return childLogger;
  }
}
