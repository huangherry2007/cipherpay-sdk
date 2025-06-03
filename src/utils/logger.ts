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
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile?: boolean;
  filePath?: string;
}

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];

  private constructor(config: LoggerConfig) {
    this.config = config;
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

  private formatLogEntry(entry: LogEntry): string {
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

  private log(level: LogLevel, message: string, data?: any): void {
    if (this.getLogLevelValue(level) < this.getLogLevelValue(this.config.level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
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

  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  public error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  public getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  public clearLogs(): void {
    this.logBuffer = [];
  }
}
