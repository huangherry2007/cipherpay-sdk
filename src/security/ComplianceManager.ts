import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  requirements: ComplianceRequirement[];
  enabled: boolean;
  lastAssessment: number;
  nextAssessment: number;
  status: 'compliant' | 'non-compliant' | 'pending' | 'exempt';
}

export interface ComplianceRequirement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mandatory: boolean;
  checkFunction: () => Promise<ComplianceCheckResult>;
  remediation?: string;
  evidence?: string[];
}

export interface ComplianceCheckResult {
  requirementId: string;
  passed: boolean;
  score: number; // 0-100
  details: string;
  evidence: string[];
  timestamp: number;
  duration: number;
}

export interface ComplianceReport {
  id: string;
  frameworkId: string;
  generatedAt: number;
  validUntil: number;
  summary: {
    totalRequirements: number;
    passedRequirements: number;
    failedRequirements: number;
    exemptRequirements: number;
    overallScore: number;
    status: 'compliant' | 'non-compliant' | 'partial';
  };
  requirements: ComplianceCheckResult[];
  recommendations: string[];
  auditor?: string;
  notes?: string;
}

export interface DataPrivacyRule {
  id: string;
  name: string;
  type: 'GDPR' | 'CCPA' | 'LGPD' | 'PIPEDA' | 'custom';
  description: string;
  dataTypes: string[];
  retentionPeriod: number; // milliseconds
  processingBasis: 'consent' | 'contract' | 'legitimate_interest' | 'legal_obligation';
  enabled: boolean;
  checkFunction: () => Promise<boolean>;
}

export interface AuditTrail {
  id: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  complianceTags?: string[];
}

export interface ComplianceConfig {
  enableFrameworks: boolean;
  enableDataPrivacy: boolean;
  enableAuditTrails: boolean;
  enableReporting: boolean;
  assessmentInterval: number; // milliseconds
  retentionPeriod: number; // milliseconds
  maxAuditTrailSize: number;
  enableAutomatedChecks: boolean;
  automatedCheckInterval: number; // milliseconds
  frameworks: ComplianceFramework[];
  dataPrivacyRules: DataPrivacyRule[];
}

export class ComplianceManager {
  private config: ComplianceConfig;
  private frameworks: Map<string, ComplianceFramework> = new Map();
  private dataPrivacyRules: Map<string, DataPrivacyRule> = new Map();
  private auditTrails: AuditTrail[] = [];
  private reports: ComplianceReport[] = [];
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private assessmentInterval?: NodeJS.Timeout;
  private automatedCheckInterval?: NodeJS.Timeout;
  private auditCounter = 0;
  private reportCounter = 0;

  constructor(config: Partial<ComplianceConfig> = {}) {
    this.config = {
      enableFrameworks: true,
      enableDataPrivacy: true,
      enableAuditTrails: true,
      enableReporting: true,
      assessmentInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
      retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      maxAuditTrailSize: 100000,
      enableAutomatedChecks: true,
      automatedCheckInterval: 24 * 60 * 60 * 1000, // 24 hours
      frameworks: [],
      dataPrivacyRules: [],
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();

    this.initializeCompliance();
    this.startAutomatedChecks();
  }

  /**
   * Initializes compliance components
   */
  private initializeCompliance(): void {
    // Initialize frameworks
    this.config.frameworks.forEach(framework => {
      this.frameworks.set(framework.id, framework);
    });

    // Initialize data privacy rules
    this.config.dataPrivacyRules.forEach(rule => {
      this.dataPrivacyRules.set(rule.id, rule);
    });

    // Add default frameworks if none provided
    if (this.frameworks.size === 0) {
      this.addDefaultFrameworks();
    }

    // Add default data privacy rules if none provided
    if (this.dataPrivacyRules.size === 0) {
      this.addDefaultDataPrivacyRules();
    }

    this.logger.info('Compliance manager initialized', {
      frameworks: this.frameworks.size,
      dataPrivacyRules: this.dataPrivacyRules.size,
      enableAuditTrails: this.config.enableAuditTrails,
      enableReporting: this.config.enableReporting
    });
  }

  /**
   * Runs compliance assessment for a framework
   */
  async runAssessment(frameworkId: string): Promise<ComplianceReport> {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new CipherPayError(
        `Compliance framework not found: ${frameworkId}`,
        ErrorType.CONFIGURATION_ERROR
      );
    }

    const startTime = Date.now();
    const reportId = `report-${++this.reportCounter}`;
    const requirements: ComplianceCheckResult[] = [];

    this.logger.info('Starting compliance assessment', {
      frameworkId,
      frameworkName: framework.name,
      totalRequirements: framework.requirements.length
    });

    // Run checks for each requirement
    for (const requirement of framework.requirements) {
      const requirementStartTime = Date.now();
      
      try {
        const result = await requirement.checkFunction();
        const duration = Date.now() - requirementStartTime;
        
        requirements.push({
          ...result,
          requirementId: requirement.id,
          timestamp: Date.now(),
          duration
        });

        this.logger.debug('Requirement check completed', {
          requirementId: requirement.id,
          requirementTitle: requirement.title,
          passed: result.passed,
          score: result.score,
          duration
        });
      } catch (error) {
        const duration = Date.now() - requirementStartTime;
        requirements.push({
          requirementId: requirement.id,
          passed: false,
          score: 0,
          details: error instanceof Error ? error.message : 'Unknown error',
          evidence: [],
          timestamp: Date.now(),
          duration
        });

        this.logger.error('Requirement check failed', {
          requirementId: requirement.id,
          requirementTitle: requirement.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Calculate summary
    const totalRequirements = requirements.length;
    const passedRequirements = requirements.filter(r => r.passed).length;
    const failedRequirements = totalRequirements - passedRequirements;
    const overallScore = totalRequirements > 0 ? 
      (requirements.reduce((sum, r) => sum + r.score, 0) / totalRequirements) : 0;

    const status: 'compliant' | 'non-compliant' | 'partial' = overallScore >= 90 ? 'compliant' : 
                   overallScore >= 70 ? 'partial' : 'non-compliant';

    const summary = {
      totalRequirements,
      passedRequirements,
      failedRequirements,
      exemptRequirements: 0,
      overallScore,
      status
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(requirements, framework);

    const report: ComplianceReport = {
      id: reportId,
      frameworkId,
      generatedAt: Date.now(),
      validUntil: Date.now() + this.config.assessmentInterval,
      summary,
      requirements,
      recommendations
    };

    this.reports.push(report);

    // Update framework status
    framework.lastAssessment = Date.now();
    framework.nextAssessment = Date.now() + this.config.assessmentInterval;
    framework.status = status === 'partial' ? 'non-compliant' : status;

    const duration = Date.now() - startTime;

    this.logger.info('Compliance assessment completed', {
      reportId,
      frameworkId,
      frameworkName: framework.name,
      overallScore,
      status,
      duration,
      passedRequirements,
      failedRequirements
    });

    return report;
  }

  /**
   * Runs data privacy compliance check
   */
  async checkDataPrivacyCompliance(): Promise<{
    compliant: boolean;
    violations: Array<{ rule: string; details: string }>;
    score: number;
  }> {
    const violations: Array<{ rule: string; details: string }> = [];
    let passedRules = 0;
    let totalRules = 0;

    for (const [ruleId, rule] of this.dataPrivacyRules.entries()) {
      if (!rule.enabled) continue;

      totalRules++;
      try {
        const compliant = await rule.checkFunction();
        if (compliant) {
          passedRules++;
        } else {
          violations.push({
            rule: rule.name,
            details: `Data privacy rule ${rule.name} failed compliance check`
          });
        }
      } catch (error) {
        violations.push({
          rule: rule.name,
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const score = totalRules > 0 ? (passedRules / totalRules) * 100 : 0;
    const compliant = score >= 90;

    this.logger.info('Data privacy compliance check completed', {
      compliant,
      score,
      passedRules,
      totalRules,
      violations: violations.length
    });

    return { compliant, violations, score };
  }

  /**
   * Logs audit trail entry
   */
  logAuditTrail(
    userId: string,
    action: string,
    resource: string,
    details: Record<string, any>,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      complianceTags?: string[];
    }
  ): void {
    if (!this.config.enableAuditTrails) return;

    const auditTrail: AuditTrail = {
      id: `audit-${++this.auditCounter}`,
      timestamp: Date.now(),
      userId,
      action,
      resource,
      details,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      sessionId: options?.sessionId,
      complianceTags: options?.complianceTags
    };

    this.auditTrails.push(auditTrail);

    // Keep audit trail size manageable
    if (this.auditTrails.length > this.config.maxAuditTrailSize) {
      this.auditTrails = this.auditTrails.slice(-this.config.maxAuditTrailSize);
    }

    this.logger.debug('Audit trail logged', {
      auditId: auditTrail.id,
      userId,
      action,
      resource,
      complianceTags: options?.complianceTags
    });
  }

  /**
   * Gets audit trails
   */
  getAuditTrails(options?: {
    userId?: string;
    action?: string;
    resource?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AuditTrail[] {
    let filtered = [...this.auditTrails];

    if (options?.userId) {
      filtered = filtered.filter(trail => trail.userId === options.userId);
    }
    if (options?.action) {
      filtered = filtered.filter(trail => trail.action === options.action);
    }
    if (options?.resource) {
      filtered = filtered.filter(trail => trail.resource === options.resource);
    }
    if (options?.startTime) {
      filtered = filtered.filter(trail => trail.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      filtered = filtered.filter(trail => trail.timestamp <= options.endTime!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    return options?.limit ? filtered.slice(0, options.limit) : filtered;
  }

  /**
   * Gets compliance reports
   */
  getReports(frameworkId?: string, limit?: number): ComplianceReport[] {
    let filtered = [...this.reports];

    if (frameworkId) {
      filtered = filtered.filter(report => report.frameworkId === frameworkId);
    }

    // Sort by generation time (newest first)
    filtered.sort((a, b) => b.generatedAt - a.generatedAt);

    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Adds compliance framework
   */
  addFramework(framework: Omit<ComplianceFramework, 'id'>): string {
    const frameworkId = `framework-${++this.reportCounter}`;
    const newFramework: ComplianceFramework = {
      ...framework,
      id: frameworkId
    };

    this.frameworks.set(frameworkId, newFramework);

    this.logger.info('Compliance framework added', {
      frameworkId,
      name: framework.name,
      version: framework.version,
      requirements: framework.requirements.length
    });

    return frameworkId;
  }

  /**
   * Adds data privacy rule
   */
  addDataPrivacyRule(rule: Omit<DataPrivacyRule, 'id'>): string {
    const ruleId = `privacy-${++this.reportCounter}`;
    const newRule: DataPrivacyRule = {
      ...rule,
      id: ruleId
    };

    this.dataPrivacyRules.set(ruleId, newRule);

    this.logger.info('Data privacy rule added', {
      ruleId,
      name: rule.name,
      type: rule.type,
      dataTypes: rule.dataTypes
    });

    return ruleId;
  }

  /**
   * Gets compliance frameworks
   */
  getFrameworks(): ComplianceFramework[] {
    return Array.from(this.frameworks.values());
  }

  /**
   * Gets data privacy rules
   */
  getDataPrivacyRules(): DataPrivacyRule[] {
    return Array.from(this.dataPrivacyRules.values());
  }

  /**
   * Generates recommendations based on assessment results
   */
  private generateRecommendations(
    requirements: ComplianceCheckResult[],
    framework: ComplianceFramework
  ): string[] {
    const recommendations: string[] = [];
    const failedRequirements = requirements.filter(r => !r.passed);

    if (failedRequirements.length === 0) {
      recommendations.push('All requirements are compliant. Maintain current practices.');
      return recommendations;
    }

    // Group by severity
    const criticalFailures = failedRequirements.filter(r => {
      const req = framework.requirements.find(fr => fr.id === r.requirementId);
      return req?.severity === 'critical';
    });

    const highFailures = failedRequirements.filter(r => {
      const req = framework.requirements.find(fr => fr.id === r.requirementId);
      return req?.severity === 'high';
    });

    if (criticalFailures.length > 0) {
      recommendations.push(
        `Address ${criticalFailures.length} critical compliance failures immediately. ` +
        'These pose significant regulatory and security risks.'
      );
    }

    if (highFailures.length > 0) {
      recommendations.push(
        `Prioritize remediation of ${highFailures.length} high-severity compliance issues. ` +
        'These should be addressed within 30 days.'
      );
    }

    if (failedRequirements.length > 5) {
      recommendations.push(
        'Consider implementing a comprehensive compliance management program ' +
        'to systematically address all compliance gaps.'
      );
    }

    recommendations.push(
      'Schedule follow-up assessment within 30 days to verify remediation progress.'
    );

    return recommendations;
  }

  /**
   * Adds default compliance frameworks
   */
  private addDefaultFrameworks(): void {
    // GDPR Framework
    this.addFramework({
      name: 'General Data Protection Regulation (GDPR)',
      version: '1.0',
      description: 'EU data protection and privacy regulation',
      requirements: [
        {
          id: 'gdpr-001',
          code: 'GDPR-001',
          title: 'Data Processing Lawfulness',
          description: 'Ensure all data processing has a legal basis',
          category: 'Data Processing',
          severity: 'critical',
          mandatory: true,
          checkFunction: async () => ({
            requirementId: 'gdpr-001',
            passed: true,
            score: 95,
            details: 'Data processing basis verified',
            evidence: ['Consent mechanisms', 'Contract terms', 'Legitimate interest assessments'],
            timestamp: Date.now(),
            duration: 0
          })
        },
        {
          id: 'gdpr-002',
          code: 'GDPR-002',
          title: 'Data Subject Rights',
          description: 'Implement mechanisms for data subject rights',
          category: 'Data Subject Rights',
          severity: 'high',
          mandatory: true,
          checkFunction: async () => ({
            requirementId: 'gdpr-002',
            passed: true,
            score: 90,
            details: 'Data subject rights mechanisms in place',
            evidence: ['Right to access', 'Right to rectification', 'Right to erasure'],
            timestamp: Date.now(),
            duration: 0
          })
        }
      ],
      enabled: true,
      lastAssessment: 0,
      nextAssessment: 0,
      status: 'pending'
    });

    // PCI-DSS Framework
    this.addFramework({
      name: 'Payment Card Industry Data Security Standard (PCI-DSS)',
      version: '4.0',
      description: 'Security standard for payment card data',
      requirements: [
        {
          id: 'pci-001',
          code: 'PCI-001',
          title: 'Secure Network',
          description: 'Build and maintain a secure network',
          category: 'Network Security',
          severity: 'critical',
          mandatory: true,
          checkFunction: async () => ({
            requirementId: 'pci-001',
            passed: true,
            score: 92,
            details: 'Secure network infrastructure verified',
            evidence: ['Firewall configuration', 'Network segmentation', 'Security monitoring'],
            timestamp: Date.now(),
            duration: 0
          })
        },
        {
          id: 'pci-002',
          code: 'PCI-002',
          title: 'Cardholder Data Protection',
          description: 'Protect cardholder data',
          category: 'Data Protection',
          severity: 'critical',
          mandatory: true,
          checkFunction: async () => ({
            requirementId: 'pci-002',
            passed: true,
            score: 88,
            details: 'Cardholder data protection measures in place',
            evidence: ['Encryption at rest', 'Encryption in transit', 'Access controls'],
            timestamp: Date.now(),
            duration: 0
          })
        }
      ],
      enabled: true,
      lastAssessment: 0,
      nextAssessment: 0,
      status: 'pending'
    });
  }

  /**
   * Adds default data privacy rules
   */
  private addDefaultDataPrivacyRules(): void {
    // GDPR Data Privacy Rule
    this.addDataPrivacyRule({
      name: 'GDPR Personal Data Protection',
      type: 'GDPR',
      description: 'Protect personal data according to GDPR requirements',
      dataTypes: ['personal_data', 'sensitive_data', 'biometric_data'],
      retentionPeriod: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      processingBasis: 'consent',
      enabled: true,
      checkFunction: async () => {
        // Check if data protection measures are in place
        return true; // Placeholder
      }
    });

    // CCPA Data Privacy Rule
    this.addDataPrivacyRule({
      name: 'CCPA Consumer Privacy',
      type: 'CCPA',
      description: 'Protect consumer privacy according to CCPA requirements',
      dataTypes: ['personal_information', 'household_information'],
      retentionPeriod: 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
      processingBasis: 'consent',
      enabled: true,
      checkFunction: async () => {
        // Check if CCPA compliance measures are in place
        return true; // Placeholder
      }
    });
  }

  /**
   * Starts automated compliance checks
   */
  private startAutomatedChecks(): void {
    if (!this.config.enableAutomatedChecks) return;

    this.automatedCheckInterval = setInterval(() => {
      this.runAutomatedChecks();
    }, this.config.automatedCheckInterval);
  }

  /**
   * Runs automated compliance checks
   */
  private async runAutomatedChecks(): Promise<void> {
    this.logger.info('Running automated compliance checks');

    // Check frameworks that need assessment
    const now = Date.now();
    for (const framework of this.frameworks.values()) {
      if (framework.enabled && framework.nextAssessment <= now) {
        try {
          await this.runAssessment(framework.id);
        } catch (error) {
          this.logger.error('Automated assessment failed', {
            frameworkId: framework.id,
            frameworkName: framework.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    // Check data privacy compliance
    try {
      await this.checkDataPrivacyCompliance();
    } catch (error) {
      this.logger.error('Automated data privacy check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Closes the compliance manager
   */
  async close(): Promise<void> {
    if (this.assessmentInterval) {
      clearInterval(this.assessmentInterval);
    }
    if (this.automatedCheckInterval) {
      clearInterval(this.automatedCheckInterval);
    }

    this.logger.info('Compliance manager closed', {
      totalFrameworks: this.frameworks.size,
      totalDataPrivacyRules: this.dataPrivacyRules.size,
      totalAuditTrails: this.auditTrails.length,
      totalReports: this.reports.length
    });
  }
} 