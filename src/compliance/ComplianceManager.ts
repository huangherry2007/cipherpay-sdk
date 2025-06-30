import { ethers } from 'ethers';
import { ShieldedNote } from '../types/Note';
import { Logger } from '../utils/logger';

export interface ComplianceRule {
  id: string;
  name: string;
  type: 'amount_limit' | 'frequency_limit' | 'address_blacklist' | 'custom';
  parameters: Record<string, any>;
  enabled: boolean;
}

export interface AuditTrail {
  id: string;
  timestamp: number;
  operation: string;
  userId: string;
  details: Record<string, any>;
  complianceStatus: 'passed' | 'failed' | 'pending';
  ruleViolations?: string[];
}

export interface ComplianceReport {
  period: {
    start: number;
    end: number;
  };
  totalTransactions: number;
  totalVolume: bigint;
  complianceViolations: number;
  auditTrails: AuditTrail[];
  riskScore: number;
}

export interface ComplianceConfig {
  enableAuditTrail: boolean;
  enableRealTimeMonitoring: boolean;
  maxTransactionAmount?: bigint;
  maxDailyVolume?: bigint;
  blacklistedAddresses?: string[];
  whitelistedAddresses?: string[];
  reportingPeriod?: number; // in days
}

export class ComplianceManager {
  private readonly config: ComplianceConfig;
  private readonly logger: Logger;
  private readonly rules: Map<string, ComplianceRule> = new Map();
  private readonly auditTrails: AuditTrail[] = [];
  private readonly blacklistedAddresses: Set<string> = new Set();
  private readonly whitelistedAddresses: Set<string> = new Set();

  constructor(config: ComplianceConfig) {
    this.config = config;
    this.logger = Logger.getInstance();
    
    // Initialize blacklisted and whitelisted addresses
    if (config.blacklistedAddresses) {
      config.blacklistedAddresses.forEach(addr => this.blacklistedAddresses.add(addr.toLowerCase()));
    }
    if (config.whitelistedAddresses) {
      config.whitelistedAddresses.forEach(addr => this.whitelistedAddresses.add(addr.toLowerCase()));
    }

    // Initialize default rules
    this.initializeDefaultRules();
  }

  /**
   * Validates a transaction for compliance
   * @param transaction Transaction data
   * @param userId User ID
   * @returns Compliance validation result
   */
  async validateTransaction(
    transaction: {
      amount: bigint;
      recipientAddress: string;
      senderAddress: string;
      type: string;
    },
    userId: string
  ): Promise<{
    compliant: boolean;
    violations: string[];
    riskScore: number;
  }> {
    const violations: string[] = [];
    let riskScore = 0;

    try {
      // Check amount limits
      if (this.config.maxTransactionAmount && transaction.amount > this.config.maxTransactionAmount) {
        violations.push(`Transaction amount ${transaction.amount} exceeds limit ${this.config.maxTransactionAmount}`);
        riskScore += 50;
      }

      // Check blacklisted addresses
      if (this.blacklistedAddresses.has(transaction.recipientAddress.toLowerCase())) {
        violations.push(`Recipient address ${transaction.recipientAddress} is blacklisted`);
        riskScore += 100;
      }

      if (this.blacklistedAddresses.has(transaction.senderAddress.toLowerCase())) {
        violations.push(`Sender address ${transaction.senderAddress} is blacklisted`);
        riskScore += 100;
      }

      // Check whitelist (if enabled)
      if (this.whitelistedAddresses.size > 0) {
        if (!this.whitelistedAddresses.has(transaction.recipientAddress.toLowerCase())) {
          violations.push(`Recipient address ${transaction.recipientAddress} is not whitelisted`);
          riskScore += 75;
        }
      }

      // Apply custom rules
      for (const rule of this.rules.values()) {
        if (rule.enabled) {
          const ruleViolation = await this.applyRule(rule, transaction);
          if (ruleViolation) {
            violations.push(ruleViolation);
            riskScore += 25;
          }
        }
      }

      // Record audit trail
      if (this.config.enableAuditTrail) {
        this.recordAuditTrail({
          operation: 'transaction_validation',
          userId,
          details: transaction,
          complianceStatus: violations.length === 0 ? 'passed' : 'failed',
          ruleViolations: violations
        });
      }

      return {
        compliant: violations.length === 0,
        violations,
        riskScore: Math.min(riskScore, 100)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Compliance validation failed', { error: errorMessage, transaction });
      
      return {
        compliant: false,
        violations: [`Validation error: ${errorMessage}`],
        riskScore: 100
      };
    }
  }

  /**
   * Generates a compliance report for a time period
   * @param startTime Start timestamp
   * @param endTime End timestamp
   * @returns Compliance report
   */
  generateComplianceReport(startTime: number, endTime: number): ComplianceReport {
    const periodTrails = this.auditTrails.filter(
      trail => trail.timestamp >= startTime && trail.timestamp <= endTime
    );

    const totalTransactions = periodTrails.filter(
      trail => trail.operation === 'transaction_validation'
    ).length;

    const totalVolume = periodTrails
      .filter(trail => trail.operation === 'transaction_validation' && trail.details.amount)
      .reduce((sum, trail) => sum + BigInt(trail.details.amount), BigInt(0));

    const complianceViolations = periodTrails.filter(
      trail => trail.complianceStatus === 'failed'
    ).length;

    const riskScore = this.calculateRiskScore(periodTrails);

    return {
      period: { start: startTime, end: endTime },
      totalTransactions,
      totalVolume,
      complianceViolations,
      auditTrails: periodTrails,
      riskScore
    };
  }

  /**
   * Adds a custom compliance rule
   * @param rule Compliance rule
   */
  addRule(rule: ComplianceRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info('Compliance rule added', { ruleId: rule.id, ruleName: rule.name });
  }

  /**
   * Removes a compliance rule
   * @param ruleId Rule ID
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.logger.info('Compliance rule removed', { ruleId });
  }

  /**
   * Adds an address to the blacklist
   * @param address Address to blacklist
   * @param reason Reason for blacklisting
   */
  blacklistAddress(address: string, reason: string): void {
    this.blacklistedAddresses.add(address.toLowerCase());
    this.logger.warn('Address blacklisted', { address, reason });
    
    if (this.config.enableAuditTrail) {
      this.recordAuditTrail({
        operation: 'address_blacklisted',
        userId: 'system',
        details: { address, reason },
        complianceStatus: 'passed'
      });
    }
  }

  /**
   * Removes an address from the blacklist
   * @param address Address to remove from blacklist
   */
  removeFromBlacklist(address: string): void {
    this.blacklistedAddresses.delete(address.toLowerCase());
    this.logger.info('Address removed from blacklist', { address });
  }

  /**
   * Gets all audit trails
   * @returns Array of audit trails
   */
  getAuditTrails(): AuditTrail[] {
    return [...this.auditTrails];
  }

  /**
   * Exports audit trails to JSON
   * @returns JSON string of audit trails
   */
  exportAuditTrails(): string {
    return JSON.stringify(this.auditTrails, null, 2);
  }

  /**
   * Initializes default compliance rules
   */
  private initializeDefaultRules(): void {
    // Amount limit rule
    this.addRule({
      id: 'amount_limit',
      name: 'Transaction Amount Limit',
      type: 'amount_limit',
      parameters: {
        maxAmount: this.config.maxTransactionAmount?.toString() || '1000000000000000000000' // 1000 ETH
      },
      enabled: true
    });

    // Frequency limit rule
    this.addRule({
      id: 'frequency_limit',
      name: 'Transaction Frequency Limit',
      type: 'frequency_limit',
      parameters: {
        maxTransactionsPerHour: 10,
        maxTransactionsPerDay: 100
      },
      enabled: true
    });
  }

  /**
   * Applies a compliance rule to a transaction
   * @param rule Compliance rule
   * @param transaction Transaction data
   * @returns Violation message if rule is violated
   */
  private async applyRule(
    rule: ComplianceRule,
    transaction: any
  ): Promise<string | null> {
    switch (rule.type) {
      case 'amount_limit':
        const maxAmount = BigInt(rule.parameters.maxAmount || '0');
        if (transaction.amount > maxAmount) {
          return `Amount ${transaction.amount} exceeds limit ${maxAmount}`;
        }
        break;

      case 'frequency_limit':
        // This would require tracking transaction frequency
        // For now, return null (no violation)
        break;

      case 'custom':
        // Custom rule implementation would go here
        break;
    }

    return null;
  }

  /**
   * Records an audit trail entry
   * @param auditData Audit trail data
   */
  private recordAuditTrail(auditData: Omit<AuditTrail, 'id' | 'timestamp'>): void {
    const auditTrail: AuditTrail = {
      id: ethers.utils.id(Date.now().toString() + Math.random().toString()),
      timestamp: Date.now(),
      ...auditData
    };

    this.auditTrails.push(auditTrail);
  }

  /**
   * Calculates risk score based on audit trails
   * @param trails Audit trails
   * @returns Risk score (0-100)
   */
  private calculateRiskScore(trails: AuditTrail[]): number {
    let riskScore = 0;

    for (const trail of trails) {
      if (trail.complianceStatus === 'failed') {
        riskScore += 10;
      }
      if (trail.ruleViolations && trail.ruleViolations.length > 0) {
        riskScore += trail.ruleViolations.length * 5;
      }
    }

    return Math.min(riskScore, 100);
  }
} 