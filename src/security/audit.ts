import { createHash, randomBytes } from 'crypto';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from '../monitoring/observability/logger';
import { ethers } from 'ethers';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'authentication' | 'authorization' | 'financial' | 'security' | 'system' | 'data';
  metadata?: Record<string, any>;
}

export interface AuditFilter {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: string;
  resource?: string;
  severity?: AuditEvent['severity'];
  category?: AuditEvent['category'];
  success?: boolean;
}

export interface AuditStats {
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByAction: Record<string, number>;
  successRate: number;
  recentEvents: AuditEvent[];
}

export class AuditLogger {
  private static instance: AuditLogger;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private auditEvents: AuditEvent[];
  private maxEvents: number;
  private retentionDays: number;
  private sensitiveFields: Set<string>;

  private constructor() {
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.auditEvents = [];
    this.maxEvents = parseInt(process.env.AUDIT_MAX_EVENTS || '10000');
    this.retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90');
    this.sensitiveFields = new Set([
      'password', 'token', 'secret', 'key', 'privateKey', 'seed', 'mnemonic',
      'creditCard', 'ssn', 'socialSecurity', 'accountNumber', 'routingNumber'
    ]);

    // Clean up old events periodically
    setInterval(() => this.cleanupOldEvents(), 24 * 60 * 60 * 1000); // Daily
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Logs an audit event
   */
  logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): string {
    try {
      const auditEvent: AuditEvent = {
        ...event,
        id: this.generateEventId(),
        timestamp: new Date()
      };

      // Sanitize sensitive data
      auditEvent.details = this.sanitizeSensitiveData(auditEvent.details);

      // Add to audit log
      this.auditEvents.push(auditEvent);

      // Maintain max events limit
      if (this.auditEvents.length > this.maxEvents) {
        this.auditEvents = this.auditEvents.slice(-this.maxEvents);
      }

      // Log to standard logger based on severity
      this.logToStandardLogger(auditEvent);

      return auditEvent.id;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'AuditLogger.logEvent',
        data: { action: event.action, resource: event.resource }
      });
      return '';
    }
  }

  /**
   * Logs authentication events
   */
  logAuthentication(
    userId: string,
    action: 'login' | 'logout' | 'login_failed' | 'password_change' | 'password_reset',
    success: boolean,
    details: Record<string, any> = {},
    ipAddress?: string,
    userAgent?: string,
    errorCode?: string,
    errorMessage?: string
  ): string {
    const severity = this.getAuthenticationSeverity(action, success);
    
    return this.logEvent({
      userId,
      action,
      resource: 'authentication',
      details: {
        ...details,
        ipAddress,
        userAgent
      },
      ipAddress,
      userAgent,
      success,
      errorCode,
      errorMessage,
      severity,
      category: 'authentication'
    });
  }

  /**
   * Logs authorization events
   */
  logAuthorization(
    userId: string,
    action: 'permission_check' | 'access_denied' | 'role_change' | 'permission_granted' | 'permission_revoked',
    resource: string,
    resourceId: string | undefined,
    success: boolean,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
    errorCode?: string,
    errorMessage?: string
  ): string {
    const severity = this.getAuthorizationSeverity(action, success);
    
    return this.logEvent({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      success,
      errorCode,
      errorMessage,
      severity,
      category: 'authorization'
    });
  }

  /**
   * Logs financial events
   */
  logFinancial(
    userId: string,
    action: 'transfer_created' | 'transfer_completed' | 'transfer_failed' | 'transfer_cancelled' | 'wallet_created' | 'note_created',
    resource: string,
    resourceId: string | undefined,
    success: boolean,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
    errorCode?: string,
    errorMessage?: string
  ): string {
    const severity = this.getFinancialSeverity(action, success, details);
    
    return this.logEvent({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      success,
      errorCode,
      errorMessage,
      severity,
      category: 'financial'
    });
  }

  /**
   * Logs security events
   */
  logSecurity(
    userId: string,
    action: 'key_generated' | 'key_rotated' | 'key_deleted' | 'suspicious_activity' | 'rate_limit_exceeded' | 'invalid_input',
    resource: string,
    resourceId: string | undefined,
    success: boolean,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
    errorCode?: string,
    errorMessage?: string
  ): string {
    const severity = this.getSecuritySeverity(action, success);
    
    return this.logEvent({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      success,
      errorCode,
      errorMessage,
      severity,
      category: 'security'
    });
  }

  /**
   * Logs system events
   */
  logSystem(
    action: 'startup' | 'shutdown' | 'health_check' | 'backup' | 'maintenance' | 'error',
    resource: string,
    success: boolean,
    details: Record<string, any>,
    errorCode?: string,
    errorMessage?: string
  ): string {
    const severity = this.getSystemSeverity(action, success);
    
    return this.logEvent({
      action,
      resource,
      details,
      success,
      errorCode,
      errorMessage,
      severity,
      category: 'system'
    });
  }

  /**
   * Logs data access events
   */
  logDataAccess(
    userId: string,
    action: 'data_read' | 'data_write' | 'data_delete' | 'data_export' | 'data_import',
    resource: string,
    resourceId: string | undefined,
    success: boolean,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
    errorCode?: string,
    errorMessage?: string
  ): string {
    const severity = this.getDataAccessSeverity(action, success);
    
    return this.logEvent({
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
      success,
      errorCode,
      errorMessage,
      severity,
      category: 'data'
    });
  }

  /**
   * Retrieves audit events with filtering
   */
  getEvents(filter?: AuditFilter): AuditEvent[] {
    let events = [...this.auditEvents];

    if (filter?.startDate) {
      events = events.filter(event => event.timestamp >= filter.startDate!);
    }

    if (filter?.endDate) {
      events = events.filter(event => event.timestamp <= filter.endDate!);
    }

    if (filter?.userId) {
      events = events.filter(event => event.userId === filter.userId);
    }

    if (filter?.action) {
      events = events.filter(event => event.action === filter.action);
    }

    if (filter?.resource) {
      events = events.filter(event => event.resource === filter.resource);
    }

    if (filter?.severity) {
      events = events.filter(event => event.severity === filter.severity);
    }

    if (filter?.category) {
      events = events.filter(event => event.category === filter.category);
    }

    if (filter?.success !== undefined) {
      events = events.filter(event => event.success === filter.success);
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Gets audit statistics
   */
  getStats(timeRange?: { startDate: Date; endDate: Date }): AuditStats {
    const events = timeRange ? this.getEvents(timeRange) : this.auditEvents;
    
    const stats: AuditStats = {
      totalEvents: events.length,
      eventsByCategory: {},
      eventsBySeverity: {},
      eventsByAction: {},
      successRate: 0,
      recentEvents: events.slice(0, 100) // Last 100 events
    };

    let successCount = 0;

    for (const event of events) {
      // Count by category
      stats.eventsByCategory[event.category] = (stats.eventsByCategory[event.category] || 0) + 1;
      
      // Count by severity
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
      
      // Count by action
      stats.eventsByAction[event.action] = (stats.eventsByAction[event.action] || 0) + 1;
      
      // Count successes
      if (event.success) {
        successCount++;
      }
    }

    stats.successRate = events.length > 0 ? successCount / events.length : 0;

    return stats;
  }

  /**
   * Exports audit events for compliance
   */
  exportEvents(filter?: AuditFilter): string {
    const events = this.getEvents(filter);
    const exportData = {
      exportDate: new Date().toISOString(),
      totalEvents: events.length,
      filter,
      events: events.map(event => ({
        ...event,
        timestamp: event.timestamp.toISOString()
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Searches audit events
   */
  searchEvents(query: string): AuditEvent[] {
    const events = [...this.auditEvents];
    const searchTerm = query.toLowerCase();

    return events.filter(event => 
      event.action.toLowerCase().includes(searchTerm) ||
      event.resource.toLowerCase().includes(searchTerm) ||
      event.userId?.toLowerCase().includes(searchTerm) ||
      event.resourceId?.toLowerCase().includes(searchTerm) ||
      JSON.stringify(event.details).toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Generates a unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Sanitizes sensitive data in audit events
   */
  private sanitizeSensitiveData(data: Record<string, any>): Record<string, any> {
    const sanitized = { ...data };

    for (const [key, value] of Object.entries(sanitized)) {
      if (this.sensitiveFields.has(key.toLowerCase())) {
        if (typeof value === 'string' && value.length > 0) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = '[REDACTED_OBJECT]';
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeSensitiveData(value);
      }
    }

    return sanitized;
  }

  /**
   * Logs to standard logger based on severity
   */
  private logToStandardLogger(event: AuditEvent): void {
    const logData = {
      auditId: event.id,
      userId: event.userId,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      success: event.success,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent
    };

    switch (event.severity) {
      case 'critical':
        this.logger.error(`AUDIT CRITICAL: ${event.action}`, logData);
        break;
      case 'high':
        this.logger.warn(`AUDIT HIGH: ${event.action}`, logData);
        break;
      case 'medium':
        this.logger.info(`AUDIT MEDIUM: ${event.action}`, logData);
        break;
      case 'low':
        this.logger.debug(`AUDIT LOW: ${event.action}`, logData);
        break;
    }
  }

  /**
   * Gets severity for authentication events
   */
  private getAuthenticationSeverity(action: string, success: boolean): AuditEvent['severity'] {
    if (!success) {
      switch (action) {
        case 'login_failed':
          return 'medium';
        case 'password_change':
        case 'password_reset':
          return 'high';
        default:
          return 'low';
      }
    }

    switch (action) {
      case 'login':
        return 'low';
      case 'logout':
        return 'low';
      case 'password_change':
      case 'password_reset':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Gets severity for authorization events
   */
  private getAuthorizationSeverity(action: string, success: boolean): AuditEvent['severity'] {
    if (!success) {
      return 'high'; // Access denied is always high severity
    }

    switch (action) {
      case 'permission_check':
        return 'low';
      case 'role_change':
        return 'high';
      case 'permission_granted':
      case 'permission_revoked':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Gets severity for financial events
   */
  private getFinancialSeverity(action: string, success: boolean, details: Record<string, any>): AuditEvent['severity'] {
    if (!success) {
      return 'high'; // Financial failures are high severity
    }

    // Check amount for transfer events
    if (action.includes('transfer') && details.amount) {
      const amount = parseFloat(details.amount);
      if (amount > 10000) {
        return 'high';
      } else if (amount > 1000) {
        return 'medium';
      }
    }

    switch (action) {
      case 'transfer_created':
      case 'transfer_completed':
        return 'medium';
      case 'transfer_failed':
      case 'transfer_cancelled':
        return 'high';
      case 'wallet_created':
        return 'medium';
      case 'note_created':
        return 'low';
      default:
        return 'low';
    }
  }

  /**
   * Gets severity for security events
   */
  private getSecuritySeverity(action: string, success: boolean): AuditEvent['severity'] {
    if (!success) {
      return 'high'; // Security failures are high severity
    }

    switch (action) {
      case 'key_generated':
      case 'key_rotated':
        return 'medium';
      case 'key_deleted':
        return 'high';
      case 'suspicious_activity':
        return 'critical';
      case 'rate_limit_exceeded':
        return 'medium';
      case 'invalid_input':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Gets severity for system events
   */
  private getSystemSeverity(action: string, success: boolean): AuditEvent['severity'] {
    if (!success) {
      return 'high'; // System failures are high severity
    }

    switch (action) {
      case 'startup':
      case 'shutdown':
        return 'medium';
      case 'health_check':
        return 'low';
      case 'backup':
        return 'medium';
      case 'maintenance':
        return 'low';
      case 'error':
        return 'high';
      default:
        return 'low';
    }
  }

  /**
   * Gets severity for data access events
   */
  private getDataAccessSeverity(action: string, success: boolean): AuditEvent['severity'] {
    if (!success) {
      return 'high'; // Data access failures are high severity
    }

    switch (action) {
      case 'data_read':
        return 'low';
      case 'data_write':
        return 'medium';
      case 'data_delete':
        return 'high';
      case 'data_export':
      case 'data_import':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Cleans up old audit events
   */
  private cleanupOldEvents(): void {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const originalCount = this.auditEvents.length;
    
    this.auditEvents = this.auditEvents.filter(event => event.timestamp > cutoffDate);
    
    const removedCount = originalCount - this.auditEvents.length;
    if (removedCount > 0) {
      this.logger.info('Cleaned up old audit events', { 
        removedCount, 
        retentionDays: this.retentionDays 
      });
    }
  }
} 