import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface ResourceQuota {
  name: string;
  type: 'memory' | 'cpu' | 'connections' | 'requests' | 'storage' | 'custom';
  limit: number;
  current: number;
  unit: string;
  resetInterval: number; // milliseconds
  lastReset: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  enforceLimit: boolean;
  autoScale: boolean;
  scaleThreshold: number; // percentage
  scaleFactor: number;
}

export interface ResourceUsage {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    cores: number;
    load: number;
  };
  connections: {
    active: number;
    max: number;
    percentage: number;
  };
  requests: {
    perSecond: number;
    total: number;
    averageResponseTime: number;
  };
  storage: {
    used: number;
    total: number;
    percentage: number;
  };
  custom: Record<string, number>;
}

export interface ResourceConfig {
  enableMonitoring: boolean;
  monitoringInterval: number;
  enableQuotas: boolean;
  enableAutoScaling: boolean;
  enableAlerts: boolean;
  alertThresholds: {
    memory: number;
    cpu: number;
    connections: number;
    storage: number;
  };
  quotas: ResourceQuota[];
  maxMemoryUsage: number;
  maxCpuUsage: number;
  maxConnections: number;
  maxStorageUsage: number;
}

export interface ResourceMetrics {
  usage: ResourceUsage;
  quotas: ResourceQuota[];
  alerts: ResourceAlert[];
  scalingEvents: ScalingEvent[];
  timestamp: number;
}

export interface ResourceAlert {
  id: string;
  type: 'warning' | 'critical' | 'error';
  resource: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  acknowledged: boolean;
}

export interface ScalingEvent {
  id: string;
  type: 'scale-up' | 'scale-down';
  resource: string;
  reason: string;
  oldValue: number;
  newValue: number;
  timestamp: number;
}

export class ResourceManager {
  private config: ResourceConfig;
  private quotas: Map<string, ResourceQuota> = new Map();
  private alerts: Map<string, ResourceAlert> = new Map();
  private scalingEvents: ScalingEvent[] = [];
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: ResourceMetrics;
  private monitoringInterval?: NodeJS.Timeout;
  private alertCounter = 0;
  private scalingCounter = 0;

  constructor(config: Partial<ResourceConfig> = {}) {
    this.config = {
      enableMonitoring: true,
      monitoringInterval: 10000, // 10 seconds
      enableQuotas: true,
      enableAutoScaling: true,
      enableAlerts: true,
      alertThresholds: {
        memory: 80,
        cpu: 80,
        connections: 90,
        storage: 85
      },
      quotas: [],
      maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
      maxCpuUsage: 100,
      maxConnections: 1000,
      maxStorageUsage: 10 * 1024 * 1024 * 1024, // 10GB
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    // Initialize quotas
    this.config.quotas.forEach(quota => {
      this.quotas.set(quota.name, { ...quota, lastReset: Date.now() });
    });

    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Checks if a resource operation is allowed
   */
  async checkQuota(quotaName: string, amount: number = 1): Promise<boolean> {
    const quota = this.quotas.get(quotaName);
    if (!quota) {
      return true; // No quota defined, allow operation
    }

    // Check if quota needs reset
    if (Date.now() - quota.lastReset > quota.resetInterval) {
      quota.current = 0;
      quota.lastReset = Date.now();
    }

    // Check if operation would exceed limit
    if (quota.current + amount > quota.limit) {
      if (quota.enforceLimit) {
        this.logger.warn('Quota exceeded', {
          quotaName,
          current: quota.current,
          limit: quota.limit,
          requested: amount
        });
        return false;
      } else {
        this.logger.warn('Quota exceeded but not enforced', {
          quotaName,
          current: quota.current,
          limit: quota.limit,
          requested: amount
        });
      }
    }

    return true;
  }

  /**
   * Consumes a resource quota
   */
  async consumeQuota(quotaName: string, amount: number = 1): Promise<void> {
    const quota = this.quotas.get(quotaName);
    if (!quota) {
      return; // No quota defined
    }

    // Check if quota needs reset
    if (Date.now() - quota.lastReset > quota.resetInterval) {
      quota.current = 0;
      quota.lastReset = Date.now();
    }

    quota.current += amount;

    // Check if auto-scaling is needed
    if (quota.autoScale && quota.current / quota.limit > quota.scaleThreshold) {
      await this.autoScale(quota);
    }

    this.logger.debug('Quota consumed', {
      quotaName,
      amount,
      current: quota.current,
      limit: quota.limit
    });
  }

  /**
   * Releases a resource quota
   */
  releaseQuota(quotaName: string, amount: number = 1): void {
    const quota = this.quotas.get(quotaName);
    if (!quota) {
      return; // No quota defined
    }

    quota.current = Math.max(0, quota.current - amount);

    this.logger.debug('Quota released', {
      quotaName,
      amount,
      current: quota.current,
      limit: quota.limit
    });
  }

  /**
   * Gets current resource usage
   */
  getResourceUsage(): ResourceUsage {
    return this.metrics.usage;
  }

  /**
   * Gets resource metrics
   */
  getMetrics(): ResourceMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets all alerts
   */
  getAlerts(): ResourceAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Acknowledges an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Gets scaling events
   */
  getScalingEvents(limit?: number): ScalingEvent[] {
    const events = [...this.scalingEvents].reverse(); // Most recent first
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Adds a custom quota
   */
  addQuota(quota: ResourceQuota): void {
    this.quotas.set(quota.name, { ...quota, lastReset: Date.now() });
    
    this.logger.info('Custom quota added', {
      quotaName: quota.name,
      limit: quota.limit,
      unit: quota.unit
    });
  }

  /**
   * Updates a quota limit
   */
  updateQuotaLimit(quotaName: string, newLimit: number): boolean {
    const quota = this.quotas.get(quotaName);
    if (!quota) {
      return false;
    }

    const oldLimit = quota.limit;
    quota.limit = newLimit;

    this.logger.info('Quota limit updated', {
      quotaName,
      oldLimit,
      newLimit
    });

    return true;
  }

  /**
   * Resets a quota
   */
  resetQuota(quotaName: string): boolean {
    const quota = this.quotas.get(quotaName);
    if (!quota) {
      return false;
    }

    quota.current = 0;
    quota.lastReset = Date.now();

    this.logger.info('Quota reset', { quotaName });
    return true;
  }

  /**
   * Gets quota information
   */
  getQuota(quotaName: string): ResourceQuota | undefined {
    return this.quotas.get(quotaName);
  }

  /**
   * Gets all quotas
   */
  getAllQuotas(): ResourceQuota[] {
    return Array.from(this.quotas.values());
  }

  /**
   * Starts resource monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateResourceUsage();
      this.checkAlerts();
      this.performAutoScaling();
    }, this.config.monitoringInterval);
  }

  /**
   * Updates current resource usage
   */
  private updateResourceUsage(): void {
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const totalMemory = this.config.maxMemoryUsage;
    const memoryPercentage = (memoryUsage.heapUsed / totalMemory) * 100;

    // Get CPU usage (simplified - in real implementation, you'd use system metrics)
    const cpuUsage = Math.random() * 100; // Placeholder
    const cpuCores = require('os').cpus().length;
    const cpuLoad = cpuUsage / cpuCores;

    // Get connection count (simplified)
    const activeConnections = Math.floor(Math.random() * this.config.maxConnections);
    const connectionPercentage = (activeConnections / this.config.maxConnections) * 100;

    // Get storage usage (simplified)
    const storageUsed = Math.random() * this.config.maxStorageUsage;
    const storagePercentage = (storageUsed / this.config.maxStorageUsage) * 100;

    // Calculate requests per second (simplified)
    const requestsPerSecond = Math.random() * 100;
    const averageResponseTime = Math.random() * 1000;

    this.metrics.usage = {
      memory: {
        used: memoryUsage.heapUsed,
        total: totalMemory,
        percentage: memoryPercentage
      },
      cpu: {
        usage: cpuUsage,
        cores: cpuCores,
        load: cpuLoad
      },
      connections: {
        active: activeConnections,
        max: this.config.maxConnections,
        percentage: connectionPercentage
      },
      requests: {
        perSecond: requestsPerSecond,
        total: Math.floor(requestsPerSecond * 60), // Estimate total
        averageResponseTime
      },
      storage: {
        used: storageUsed,
        total: this.config.maxStorageUsage,
        percentage: storagePercentage
      },
      custom: {}
    };

    // Update quotas
    this.metrics.quotas = Array.from(this.quotas.values());

    this.metrics.timestamp = Date.now();
  }

  /**
   * Checks for resource alerts
   */
  private checkAlerts(): void {
    const usage = this.metrics.usage;
    const thresholds = this.config.alertThresholds;

    // Check memory usage
    if (usage.memory.percentage > thresholds.memory) {
      this.createAlert('memory', 'warning', 
        `Memory usage is ${usage.memory.percentage.toFixed(1)}%`, 
        usage.memory.percentage, thresholds.memory);
    }

    // Check CPU usage
    if (usage.cpu.usage > thresholds.cpu) {
      this.createAlert('cpu', 'warning',
        `CPU usage is ${usage.cpu.usage.toFixed(1)}%`,
        usage.cpu.usage, thresholds.cpu);
    }

    // Check connection usage
    if (usage.connections.percentage > thresholds.connections) {
      this.createAlert('connections', 'warning',
        `Connection usage is ${usage.connections.percentage.toFixed(1)}%`,
        usage.connections.percentage, thresholds.connections);
    }

    // Check storage usage
    if (usage.storage.percentage > thresholds.storage) {
      this.createAlert('storage', 'warning',
        `Storage usage is ${usage.storage.percentage.toFixed(1)}%`,
        usage.storage.percentage, thresholds.storage);
    }

    // Check for critical levels
    if (usage.memory.percentage > 95) {
      this.createAlert('memory', 'critical',
        `Memory usage is critically high: ${usage.memory.percentage.toFixed(1)}%`,
        usage.memory.percentage, 95);
    }

    if (usage.cpu.usage > 95) {
      this.createAlert('cpu', 'critical',
        `CPU usage is critically high: ${usage.cpu.usage.toFixed(1)}%`,
        usage.cpu.usage, 95);
    }
  }

  /**
   * Creates a resource alert
   */
  private createAlert(
    resource: string,
    type: 'warning' | 'critical' | 'error',
    message: string,
    value: number,
    threshold: number
  ): void {
    const alertId = `alert-${++this.alertCounter}`;
    const alert: ResourceAlert = {
      id: alertId,
      type,
      resource,
      message,
      value,
      threshold,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.set(alertId, alert);
    this.metrics.alerts = Array.from(this.alerts.values());

    this.logger.warn('Resource alert created', {
      alertId,
      resource,
      type,
      message,
      value,
      threshold
    });
  }

  /**
   * Performs auto-scaling based on resource usage
   */
  private async performAutoScaling(): Promise<void> {
    if (!this.config.enableAutoScaling) {
      return;
    }

    const usage = this.metrics.usage;

    // Scale up if resources are heavily used
    if (usage.memory.percentage > 80 || usage.cpu.usage > 80) {
      await this.scaleUp('system', 'High resource usage detected');
    }

    // Scale down if resources are underutilized
    if (usage.memory.percentage < 30 && usage.cpu.usage < 30) {
      await this.scaleDown('system', 'Low resource usage detected');
    }
  }

  /**
   * Performs auto-scaling for a specific quota
   */
  private async autoScale(quota: ResourceQuota): Promise<void> {
    const newLimit = Math.ceil(quota.limit * quota.scaleFactor);
    
    await this.scaleUp(quota.name, `Quota ${quota.name} exceeded threshold`, {
      oldValue: quota.limit,
      newValue: newLimit
    });

    quota.limit = newLimit;
  }

  /**
   * Scales up resources
   */
  private async scaleUp(resource: string, reason: string, details?: { oldValue: number; newValue: number }): Promise<void> {
    const eventId = `scale-${++this.scalingCounter}`;
    const event: ScalingEvent = {
      id: eventId,
      type: 'scale-up',
      resource,
      reason,
      oldValue: details?.oldValue || 0,
      newValue: details?.newValue || 0,
      timestamp: Date.now()
    };

    this.scalingEvents.push(event);
    this.metrics.scalingEvents = this.scalingEvents;

    this.logger.info('Resource scaled up', {
      eventId,
      resource,
      reason,
      oldValue: event.oldValue,
      newValue: event.newValue
    });
  }

  /**
   * Scales down resources
   */
  private async scaleDown(resource: string, reason: string, details?: { oldValue: number; newValue: number }): Promise<void> {
    const eventId = `scale-${++this.scalingCounter}`;
    const event: ScalingEvent = {
      id: eventId,
      type: 'scale-down',
      resource,
      reason,
      oldValue: details?.oldValue || 0,
      newValue: details?.newValue || 0,
      timestamp: Date.now()
    };

    this.scalingEvents.push(event);
    this.metrics.scalingEvents = this.scalingEvents;

    this.logger.info('Resource scaled down', {
      eventId,
      resource,
      reason,
      oldValue: event.oldValue,
      newValue: event.newValue
    });
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): ResourceMetrics {
    return {
      usage: {
        memory: { used: 0, total: 0, percentage: 0 },
        cpu: { usage: 0, cores: 0, load: 0 },
        connections: { active: 0, max: 0, percentage: 0 },
        requests: { perSecond: 0, total: 0, averageResponseTime: 0 },
        storage: { used: 0, total: 0, percentage: 0 },
        custom: {}
      },
      quotas: [],
      alerts: [],
      scalingEvents: [],
      timestamp: Date.now()
    };
  }

  /**
   * Closes the resource manager
   */
  async close(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.logger.info('Resource manager closed', {
      totalAlerts: this.alerts.size,
      totalScalingEvents: this.scalingEvents.length
    });
  }
}

/**
 * Resource Manager for managing multiple resource managers
 */
export class ResourceManagerManager {
  private static instance: ResourceManagerManager;
  private managers: Map<string, ResourceManager> = new Map();
  private logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): ResourceManagerManager {
    if (!ResourceManagerManager.instance) {
      ResourceManagerManager.instance = new ResourceManagerManager();
    }
    return ResourceManagerManager.instance;
  }

  /**
   * Creates or gets a resource manager
   */
  createManager(name: string, config?: Partial<ResourceConfig>): ResourceManager {
    if (this.managers.has(name)) {
      return this.managers.get(name)!;
    }

    const manager = new ResourceManager(config);
    this.managers.set(name, manager);

    this.logger.info('Resource manager created', {
      managerName: name,
      config
    });

    return manager;
  }

  /**
   * Gets a resource manager
   */
  getManager(name: string): ResourceManager | undefined {
    return this.managers.get(name);
  }

  /**
   * Gets all resource managers
   */
  getAllManagers(): Map<string, ResourceManager> {
    return new Map(this.managers);
  }

  /**
   * Closes all resource managers
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.managers.values()).map(manager => manager.close());
    await Promise.allSettled(closePromises);
    this.managers.clear();

    this.logger.info('All resource managers closed');
  }
} 