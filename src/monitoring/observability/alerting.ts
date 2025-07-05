export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AlertType {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  ERROR = 'error',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system'
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: number;
  component?: string;
  operation?: string;
  userId?: string;
  ip?: string;
  data?: any;
  resolved?: boolean;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  condition: (data: any) => boolean;
  message: string;
  enabled: boolean;
  cooldown?: number; // milliseconds
  lastTriggered?: number;
}

export interface AlertingConfig {
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
}

export class AlertingSystem {
  private static instance: AlertingSystem;
  private config: AlertingConfig;
  private alerts: Alert[] = [];
  private rules: AlertRule[] = [];
  private alertHandlers: Array<(alert: Alert) => void> = [];

  private constructor(config: AlertingConfig) {
    this.config = {
      serviceName: 'cipherpay-sdk',
      environment: process.env.NODE_ENV || 'development',
      ...config
    };

    this.initializeDefaultRules();
  }

  public static getInstance(config?: AlertingConfig): AlertingSystem {
    if (!AlertingSystem.instance) {
      AlertingSystem.instance = new AlertingSystem(config || { enableAlerting: true });
    }
    return AlertingSystem.instance;
  }

  // Initialize default alert rules
  private initializeDefaultRules(): void {
    // Security alert rules
    this.addRule({
      id: 'auth_failure_threshold',
      name: 'Authentication Failure Threshold',
      type: AlertType.SECURITY,
      severity: AlertSeverity.HIGH,
      condition: (data) => data.failedAttempts >= 5,
      message: 'Multiple authentication failures detected',
      enabled: true,
      cooldown: 300000 // 5 minutes
    });

    this.addRule({
      id: 'rate_limit_exceeded',
      name: 'Rate Limit Exceeded',
      type: AlertType.SECURITY,
      severity: AlertSeverity.MEDIUM,
      condition: (data) => data.rateLimitHits > 10,
      message: 'Rate limit exceeded multiple times',
      enabled: true,
      cooldown: 600000 // 10 minutes
    });

    // Performance alert rules
    this.addRule({
      id: 'response_time_threshold',
      name: 'Response Time Threshold',
      type: AlertType.PERFORMANCE,
      severity: AlertSeverity.MEDIUM,
      condition: (data) => data.responseTime > 5000,
      message: 'Response time exceeded threshold',
      enabled: true,
      cooldown: 300000 // 5 minutes
    });

    // Error alert rules
    this.addRule({
      id: 'error_rate_threshold',
      name: 'Error Rate Threshold',
      type: AlertType.ERROR,
      severity: AlertSeverity.HIGH,
      condition: (data) => data.errorRate > 0.1, // 10% error rate
      message: 'High error rate detected',
      enabled: true,
      cooldown: 300000 // 5 minutes
    });

    // Configuration alert rules
    this.addRule({
      id: 'config_validation_failure',
      name: 'Configuration Validation Failure',
      type: AlertType.CONFIGURATION,
      severity: AlertSeverity.CRITICAL,
      condition: (data) => data.validationErrors > 0,
      message: 'Configuration validation failed',
      enabled: true,
      cooldown: 60000 // 1 minute
    });
  }

  // Add a new alert rule
  public addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  // Remove an alert rule
  public removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.id !== ruleId);
  }

  // Enable/disable a rule
  public setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  // Create an alert
  public createAlert(
    type: AlertType,
    severity: AlertSeverity,
    title: string,
    message: string,
    data?: any,
    options?: {
      component?: string;
      operation?: string;
      userId?: string;
      ip?: string;
    }
  ): Alert {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      title,
      message,
      timestamp: Date.now(),
      component: options?.component,
      operation: options?.operation,
      userId: options?.userId,
      ip: options?.ip,
      data,
      resolved: false
    };

    this.alerts.push(alert);
    this.notifyHandlers(alert);

    return alert;
  }

  // Security-specific alerts
  public securityAlert(
    severity: AlertSeverity,
    event: string,
    data?: any,
    options?: { userId?: string; ip?: string }
  ): Alert {
    return this.createAlert(
      AlertType.SECURITY,
      severity,
      `Security Alert: ${event}`,
      `Security event detected: ${event}`,
      data,
      { component: 'security', operation: event, ...options }
    );
  }

  public authenticationFailure(userId: string, ip: string, reason: string): Alert {
    return this.securityAlert(
      AlertSeverity.MEDIUM,
      'Authentication Failure',
      { userId, ip, reason },
      { userId, ip }
    );
  }

  public bruteForceAttempt(ip: string, attempts: number): Alert {
    return this.securityAlert(
      AlertSeverity.HIGH,
      'Brute Force Attempt',
      { ip, attempts },
      { ip }
    );
  }

  public suspiciousActivity(userId: string, activity: string, data?: any): Alert {
    return this.securityAlert(
      AlertSeverity.MEDIUM,
      'Suspicious Activity',
      { userId, activity, ...data },
      { userId }
    );
  }

  // Performance alerts
  public performanceAlert(
    severity: AlertSeverity,
    metric: string,
    value: number,
    threshold: number
  ): Alert {
    return this.createAlert(
      AlertType.PERFORMANCE,
      severity,
      `Performance Alert: ${metric}`,
      `${metric} exceeded threshold (${value} > ${threshold})`,
      { metric, value, threshold },
      { component: 'performance', operation: metric }
    );
  }

  // Error alerts
  public errorAlert(
    severity: AlertSeverity,
    error: Error,
    component: string,
    operation?: string
  ): Alert {
    return this.createAlert(
      AlertType.ERROR,
      severity,
      `Error Alert: ${error.name}`,
      error.message,
      { error: { name: error.name, message: error.message, stack: error.stack } },
      { component, operation }
    );
  }

  // Configuration alerts
  public configurationAlert(
    severity: AlertSeverity,
    component: string,
    issue: string,
    data?: any
  ): Alert {
    return this.createAlert(
      AlertType.CONFIGURATION,
      severity,
      `Configuration Alert: ${component}`,
      issue,
      data,
      { component, operation: 'configuration' }
    );
  }

  // System alerts
  public systemAlert(
    severity: AlertSeverity,
    issue: string,
    data?: any
  ): Alert {
    return this.createAlert(
      AlertType.SYSTEM,
      severity,
      `System Alert`,
      issue,
      data,
      { component: 'system' }
    );
  }

  // Check rules and trigger alerts
  public checkRules(data: any): Alert[] {
    if (!this.config.enableAlerting) return [];

    const triggeredAlerts: Alert[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // Check cooldown
      if (rule.cooldown && rule.lastTriggered) {
        const timeSinceLastTrigger = Date.now() - rule.lastTriggered;
        if (timeSinceLastTrigger < rule.cooldown) continue;
      }

      // Check condition
      if (rule.condition(data)) {
        const alert = this.createAlert(
          rule.type,
          rule.severity,
          rule.name,
          rule.message,
          data,
          { component: 'rule', operation: rule.id }
        );

        triggeredAlerts.push(alert);
        rule.lastTriggered = Date.now();
      }
    }

    return triggeredAlerts;
  }

  // Resolve an alert
  public resolveAlert(alertId: string, resolvedBy: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      alert.resolvedBy = resolvedBy;
    }
  }

  // Get all alerts
  public getAlerts(filters?: {
    type?: AlertType;
    severity?: AlertSeverity;
    resolved?: boolean;
    component?: string;
    since?: number;
  }): Alert[] {
    let filteredAlerts = [...this.alerts];

    if (filters?.type) {
      filteredAlerts = filteredAlerts.filter(a => a.type === filters.type);
    }

    if (filters?.severity) {
      filteredAlerts = filteredAlerts.filter(a => a.severity === filters.severity);
    }

    if (filters?.resolved !== undefined) {
      filteredAlerts = filteredAlerts.filter(a => a.resolved === filters.resolved);
    }

    if (filters?.component) {
      filteredAlerts = filteredAlerts.filter(a => a.component === filters.component);
    }

    if (filters?.since) {
      filteredAlerts = filteredAlerts.filter(a => a.timestamp >= filters.since!);
    }

    return filteredAlerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get active (unresolved) alerts
  public getActiveAlerts(): Alert[] {
    return this.getAlerts({ resolved: false });
  }

  // Get critical alerts
  public getCriticalAlerts(): Alert[] {
    return this.getAlerts({ severity: AlertSeverity.CRITICAL, resolved: false });
  }

  // Add alert handler
  public addHandler(handler: (alert: Alert) => void): void {
    this.alertHandlers.push(handler);
  }

  // Remove alert handler
  public removeHandler(handler: (alert: Alert) => void): void {
    this.alertHandlers = this.alertHandlers.filter(h => h !== handler);
  }

  // Notify all handlers
  private notifyHandlers(alert: Alert): void {
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error('Error in alert handler:', error);
      }
    }
  }

  // Clear all alerts (useful for testing)
  public clear(): void {
    this.alerts = [];
  }

  // Export alerts in JSON format
  public exportAlerts(): string {
    return JSON.stringify(this.alerts, null, 2);
  }
}

// Export singleton instance
export const alerting = AlertingSystem.getInstance(); 