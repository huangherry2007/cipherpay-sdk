import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface ConsistencyRule {
  name: string;
  description: string;
  validate: (data: any) => boolean | Promise<boolean>;
  repair?: (data: any) => any | Promise<any>;
  severity: 'critical' | 'warning' | 'info';
  autoRepair: boolean;
}

export interface ConsistencyCheck {
  ruleName: string;
  passed: boolean;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: number;
  data?: any;
  repairAttempted?: boolean;
  repairSuccessful?: boolean;
}

export interface ConsistencyReport {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  criticalFailures: number;
  warnings: number;
  checks: ConsistencyCheck[];
  timestamp: number;
  duration: number;
}

export interface ConsistencyConfig {
  enableAutoRepair: boolean;
  enableValidation: boolean;
  checkInterval: number;
  maxRepairAttempts: number;
  backupBeforeRepair: boolean;
  logAllChecks: boolean;
}

export class DataConsistencyChecker {
  private config: ConsistencyConfig;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private rules: Map<string, ConsistencyRule> = new Map();
  private checkHistory: ConsistencyCheck[] = [];
  private repairHistory: Map<string, number> = new Map();

  constructor(config: Partial<ConsistencyConfig> = {}) {
    this.config = {
      enableAutoRepair: true,
      enableValidation: true,
      checkInterval: 60000, // 1 minute
      maxRepairAttempts: 3,
      backupBeforeRepair: true,
      logAllChecks: false,
      ...config
    };
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Registers a consistency rule
   */
  registerRule(rule: ConsistencyRule): void {
    this.rules.set(rule.name, rule);
    
    this.logger.info('Consistency rule registered', {
      ruleName: rule.name,
      description: rule.description,
      severity: rule.severity,
      autoRepair: rule.autoRepair
    });
  }

  /**
   * Validates data against all registered rules
   */
  async validateData(data: any, context: Record<string, any> = {}): Promise<ConsistencyReport> {
    const startTime = Date.now();
    const checks: ConsistencyCheck[] = [];
    let criticalFailures = 0;
    let warnings = 0;
    let failedChecks = 0;

    this.logger.debug('Starting data consistency validation', {
      dataType: typeof data,
      ruleCount: this.rules.size,
      context
    });

    for (const [ruleName, rule] of this.rules.entries()) {
      const checkStartTime = Date.now();
      
      try {
        const isValid = await rule.validate(data);
        const check: ConsistencyCheck = {
          ruleName,
          passed: isValid,
          message: isValid ? 'Validation passed' : 'Validation failed',
          severity: rule.severity,
          timestamp: Date.now(),
          data: this.config.logAllChecks ? data : undefined
        };

        if (!isValid) {
          failedChecks++;
          if (rule.severity === 'critical') {
            criticalFailures++;
          } else if (rule.severity === 'warning') {
            warnings++;
          }

          // Attempt auto-repair if enabled
          if (this.config.enableAutoRepair && rule.autoRepair && rule.repair) {
            const repairResult = await this.attemptRepair(rule, data, context);
            check.repairAttempted = true;
            check.repairSuccessful = repairResult.success;
            
            if (repairResult.success) {
              check.message = 'Validation failed but auto-repair successful';
              check.passed = true;
              failedChecks--;
              if (rule.severity === 'critical') {
                criticalFailures--;
              } else if (rule.severity === 'warning') {
                warnings--;
              }
            } else {
              check.message = `Validation failed and auto-repair failed: ${repairResult.error}`;
            }
          }
        }

        checks.push(check);
        
        this.logger.debug('Consistency check completed', {
          ruleName,
          passed: check.passed,
          duration: Date.now() - checkStartTime,
          repairAttempted: check.repairAttempted,
          repairSuccessful: check.repairSuccessful
        });
      } catch (error) {
        const check: ConsistencyCheck = {
          ruleName,
          passed: false,
          message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: rule.severity,
          timestamp: Date.now(),
          data: this.config.logAllChecks ? data : undefined
        };

        checks.push(check);
        failedChecks++;
        if (rule.severity === 'critical') {
          criticalFailures++;
        }

        this.logger.error('Consistency check error', {
          ruleName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Store checks in history
    this.checkHistory.push(...checks);

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'critical';
    if (criticalFailures > 0) {
      overallStatus = 'critical';
    } else if (failedChecks > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const report: ConsistencyReport = {
      overallStatus,
      totalChecks: checks.length,
      passedChecks: checks.length - failedChecks,
      failedChecks,
      criticalFailures,
      warnings,
      checks,
      timestamp: Date.now(),
      duration: Date.now() - startTime
    };

    this.logger.info('Data consistency validation completed', {
      overallStatus,
      totalChecks: report.totalChecks,
      passedChecks: report.passedChecks,
      failedChecks: report.failedChecks,
      criticalFailures: report.criticalFailures,
      duration: report.duration
    });

    return report;
  }

  /**
   * Attempts to repair data using the rule's repair function
   */
  private async attemptRepair(rule: ConsistencyRule, data: any, context: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    if (!rule.repair) {
      return { success: false, error: 'No repair function available' };
    }

    const repairCount = this.repairHistory.get(rule.name) || 0;
    if (repairCount >= this.config.maxRepairAttempts) {
      return { success: false, error: 'Maximum repair attempts exceeded' };
    }

    try {
      // Create backup if enabled
      let backup: any = null;
      if (this.config.backupBeforeRepair) {
        backup = JSON.parse(JSON.stringify(data));
      }

      // Attempt repair
      const repairedData = await rule.repair(data);
      
      // Validate repaired data
      const isValid = await rule.validate(repairedData);
      
      if (isValid) {
        // Update repair count
        this.repairHistory.set(rule.name, repairCount + 1);
        
        this.logger.info('Data repair successful', {
          ruleName: rule.name,
          repairCount: repairCount + 1
        });
        
        return { success: true };
      } else {
        // Restore backup if repair failed
        if (backup) {
          Object.assign(data, backup);
        }
        
        this.logger.warn('Data repair failed validation', {
          ruleName: rule.name,
          repairCount: repairCount + 1
        });
        
        return { success: false, error: 'Repaired data failed validation' };
      }
    } catch (error) {
      this.logger.error('Data repair error', {
        ruleName: rule.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Manually repairs data for a specific rule
   */
  async repairData(ruleName: string, data: any, context: Record<string, any> = {}): Promise<{ success: boolean; error?: string; repairedData?: any }> {
    const rule = this.rules.get(ruleName);
    if (!rule) {
      return { success: false, error: `Rule '${ruleName}' not found` };
    }

    if (!rule.repair) {
      return { success: false, error: 'No repair function available for this rule' };
    }

    try {
      const repairedData = await rule.repair(data);
      const isValid = await rule.validate(repairedData);
      
      if (isValid) {
        this.logger.info('Manual data repair successful', {
          ruleName,
          context
        });
        
        return { success: true, repairedData };
      } else {
        return { success: false, error: 'Repaired data failed validation' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Gets consistency check history
   */
  getCheckHistory(limit?: number): ConsistencyCheck[] {
    if (limit) {
      return this.checkHistory.slice(-limit);
    }
    return [...this.checkHistory];
  }

  /**
   * Gets repair history
   */
  getRepairHistory(): Record<string, number> {
    return Object.fromEntries(this.repairHistory);
  }

  /**
   * Clears check history
   */
  clearCheckHistory(): void {
    this.checkHistory = [];
    this.logger.info('Consistency check history cleared');
  }

  /**
   * Resets repair history
   */
  resetRepairHistory(): void {
    this.repairHistory.clear();
    this.logger.info('Repair history reset');
  }

  /**
   * Gets all registered rules
   */
  getRegisteredRules(): ConsistencyRule[] {
    return Array.from(this.rules.values());
  }
}

/**
 * Predefined consistency rules
 */
export class ConsistencyRules {
  /**
   * Validates that an object has required properties
   */
  static requiredProperties(properties: string[], severity: 'critical' | 'warning' | 'info' = 'critical'): ConsistencyRule {
    return {
      name: 'requiredProperties',
      description: `Validates that object has required properties: ${properties.join(', ')}`,
      severity,
      autoRepair: false,
      validate: (data: any) => {
        if (!data || typeof data !== 'object') {
          return false;
        }
        return properties.every(prop => prop in data);
      }
    };
  }

  /**
   * Validates that a value is within a numeric range
   */
  static numericRange(min: number, max: number, severity: 'critical' | 'warning' | 'info' = 'warning'): ConsistencyRule {
    return {
      name: 'numericRange',
      description: `Validates that value is between ${min} and ${max}`,
      severity,
      autoRepair: true,
      validate: (data: any) => {
        const num = Number(data);
        return !isNaN(num) && num >= min && num <= max;
      },
      repair: (data: any) => {
        const num = Number(data);
        if (isNaN(num)) {
          return (min + max) / 2; // Return middle value
        }
        if (num < min) return min;
        if (num > max) return max;
        return num;
      }
    };
  }

  /**
   * Validates that a string matches a pattern
   */
  static stringPattern(pattern: RegExp, severity: 'critical' | 'warning' | 'info' = 'warning'): ConsistencyRule {
    return {
      name: 'stringPattern',
      description: `Validates that string matches pattern: ${pattern.source}`,
      severity,
      autoRepair: false,
      validate: (data: any) => {
        return typeof data === 'string' && pattern.test(data);
      }
    };
  }

  /**
   * Validates that an array has minimum length
   */
  static arrayMinLength(minLength: number, severity: 'critical' | 'warning' | 'info' = 'warning'): ConsistencyRule {
    return {
      name: 'arrayMinLength',
      description: `Validates that array has at least ${minLength} elements`,
      severity,
      autoRepair: false,
      validate: (data: any) => {
        return Array.isArray(data) && data.length >= minLength;
      }
    };
  }

  /**
   * Validates that a value is not null or undefined
   */
  static notNull(severity: 'critical' | 'warning' | 'info' = 'critical'): ConsistencyRule {
    return {
      name: 'notNull',
      description: 'Validates that value is not null or undefined',
      severity,
      autoRepair: false,
      validate: (data: any) => {
        return data !== null && data !== undefined;
      }
    };
  }

  /**
   * Validates that a value is a valid date
   */
  static validDate(severity: 'critical' | 'warning' | 'info' = 'warning'): ConsistencyRule {
    return {
      name: 'validDate',
      description: 'Validates that value is a valid date',
      severity,
      autoRepair: true,
      validate: (data: any) => {
        const date = new Date(data);
        return !isNaN(date.getTime());
      },
      repair: (data: any) => {
        const date = new Date(data);
        if (isNaN(date.getTime())) {
          return new Date().toISOString(); // Return current date
        }
        return date.toISOString();
      }
    };
  }

  /**
   * Validates that a value is a valid email address
   */
  static validEmail(severity: 'critical' | 'warning' | 'info' = 'warning'): ConsistencyRule {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    return {
      name: 'validEmail',
      description: 'Validates that value is a valid email address',
      severity,
      autoRepair: false,
      validate: (data: any) => {
        return typeof data === 'string' && emailPattern.test(data);
      }
    };
  }
} 