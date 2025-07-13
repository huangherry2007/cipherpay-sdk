import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';
import { SecurityManager, SecurityConfig } from './SecurityManager';
import { ComplianceManager, ComplianceConfig } from './ComplianceManager';

export interface SecurityOrchestratorConfig {
  security: Partial<SecurityConfig>;
  compliance: Partial<ComplianceConfig>;
  enableThreatDetection: boolean;
  enableIncidentResponse: boolean;
  enableSecurityMonitoring: boolean;
  threatDetectionInterval: number; // milliseconds
  incidentResponseTimeout: number; // milliseconds
  securityMonitoringInterval: number; // milliseconds
  enableAutomatedResponse: boolean;
  enableSecurityMetrics: boolean;
  enableSecurityAlerts: boolean;
}

export interface SecurityIncident {
  id: string;
  type: 'threat' | 'compliance' | 'access' | 'data' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  title: string;
  description: string;
  detectedAt: number;
  resolvedAt?: number;
  affectedResources: string[];
  affectedUsers: string[];
  evidence: Record<string, any>;
  responseActions: SecurityResponseAction[];
  assignee?: string;
  notes?: string[];
}

export interface SecurityResponseAction {
  id: string;
  type: 'block' | 'isolate' | 'quarantine' | 'alert' | 'investigate' | 'remediate';
  description: string;
  executedAt: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: string;
  duration?: number;
}

export interface SecurityThreat {
  id: string;
  type: 'malware' | 'phishing' | 'brute_force' | 'data_exfiltration' | 'insider_threat' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  target: string;
  detectedAt: number;
  indicators: string[];
  confidence: number; // 0-100
  status: 'active' | 'contained' | 'resolved';
  responseActions: SecurityResponseAction[];
}

export interface SecurityMetrics {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  averageResolutionTime: number;
  totalThreats: number;
  activeThreats: number;
  containedThreats: number;
  securityScore: number; // 0-100
  complianceScore: number; // 0-100
  threatDetectionRate: number;
  falsePositiveRate: number;
  responseTime: number; // average response time in milliseconds
}

export class SecurityOrchestrator {
  private config: SecurityOrchestratorConfig;
  private securityManager: SecurityManager;
  private complianceManager: ComplianceManager;
  private incidents: Map<string, SecurityIncident> = new Map();
  private threats: Map<string, SecurityThreat> = new Map();
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: SecurityMetrics;
  private threatDetectionInterval?: NodeJS.Timeout;
  private securityMonitoringInterval?: NodeJS.Timeout;
  private incidentCounter = 0;
  private threatCounter = 0;

  constructor(config: Partial<SecurityOrchestratorConfig> = {}) {
    this.config = {
      security: {},
      compliance: {},
      enableThreatDetection: true,
      enableIncidentResponse: true,
      enableSecurityMonitoring: true,
      threatDetectionInterval: 60000, // 1 minute
      incidentResponseTimeout: 300000, // 5 minutes
      securityMonitoringInterval: 300000, // 5 minutes
      enableAutomatedResponse: true,
      enableSecurityMetrics: true,
      enableSecurityAlerts: true,
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    // Initialize security and compliance managers
    this.securityManager = new SecurityManager(this.config.security);
    this.complianceManager = new ComplianceManager(this.config.compliance);

    this.startSecurityMonitoring();
  }

  /**
   * Performs comprehensive security check
   */
  async performSecurityCheck(): Promise<{
    securityScore: number;
    complianceScore: number;
    threats: SecurityThreat[];
    incidents: SecurityIncident[];
    recommendations: string[];
  }> {
    const startTime = Date.now();

    try {
      // Run security checks
      const securityMetrics = this.securityManager.getMetrics();
      const securityScore = this.calculateSecurityScore(securityMetrics);

      // Run compliance checks
      const complianceResults = await this.complianceManager.checkDataPrivacyCompliance();
      const complianceScore = complianceResults.score;

      // Run threat detection
      const threats = await this.detectThreats();

      // Check for incidents
      const incidents = this.getActiveIncidents();

      // Generate recommendations
      const recommendations = this.generateSecurityRecommendations(
        securityScore,
        complianceScore,
        threats,
        incidents
      );

      const duration = Date.now() - startTime;
      this.metrics.responseTime = (this.metrics.responseTime + duration) / 2;

      this.logger.info('Security check completed', {
        securityScore,
        complianceScore,
        threatsDetected: threats.length,
        activeIncidents: incidents.length,
        duration
      });

      return {
        securityScore,
        complianceScore,
        threats,
        incidents,
        recommendations
      };
    } catch (error) {
      this.logger.error('Security check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Creates a security incident
   */
  createIncident(
    type: SecurityIncident['type'],
    severity: SecurityIncident['severity'],
    title: string,
    description: string,
    details: {
      affectedResources?: string[];
      affectedUsers?: string[];
      evidence?: Record<string, any>;
      assignee?: string;
    } = {}
  ): string {
    const incidentId = `incident-${++this.incidentCounter}`;
    const incident: SecurityIncident = {
      id: incidentId,
      type,
      severity,
      status: 'open',
      title,
      description,
      detectedAt: Date.now(),
      affectedResources: details.affectedResources || [],
      affectedUsers: details.affectedUsers || [],
      evidence: details.evidence || {},
      responseActions: [],
      assignee: details.assignee,
      notes: []
    };

    this.incidents.set(incidentId, incident);
    this.metrics.totalIncidents++;
    this.metrics.openIncidents++;

    this.logger.warn('Security incident created', {
      incidentId,
      type,
      severity,
      title,
      affectedResources: incident.affectedResources.length,
      affectedUsers: incident.affectedUsers.length
    });

    // Trigger automated response if enabled
    if (this.config.enableAutomatedResponse) {
      this.triggerAutomatedResponse(incident);
    }

    return incidentId;
  }

  /**
   * Updates incident status
   */
  updateIncidentStatus(
    incidentId: string,
    status: SecurityIncident['status'],
    notes?: string
  ): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return false;
    }

    const previousStatus = incident.status;
    incident.status = status;

    if (notes) {
      incident.notes = incident.notes || [];
      incident.notes.push(`${new Date().toISOString()}: ${notes}`);
    }

    if (status === 'resolved' || status === 'closed') {
      incident.resolvedAt = Date.now();
      this.metrics.openIncidents--;
      this.metrics.resolvedIncidents++;

      if (previousStatus === 'open') {
        const resolutionTime = incident.resolvedAt - incident.detectedAt;
        this.metrics.averageResolutionTime = 
          (this.metrics.averageResolutionTime + resolutionTime) / 2;
      }
    }

    this.logger.info('Incident status updated', {
      incidentId,
      previousStatus,
      newStatus: status,
      notes
    });

    return true;
  }

  /**
   * Adds response action to incident
   */
  addResponseAction(
    incidentId: string,
    type: SecurityResponseAction['type'],
    description: string
  ): string {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new CipherPayError(
        `Incident not found: ${incidentId}`,
        ErrorType.NOT_FOUND
      );
    }

    const actionId = `action-${Date.now()}`;
    const action: SecurityResponseAction = {
      id: actionId,
      type,
      description,
      executedAt: Date.now(),
      status: 'pending'
    };

    incident.responseActions.push(action);

    this.logger.info('Response action added', {
      incidentId,
      actionId,
      type,
      description
    });

    return actionId;
  }

  /**
   * Gets security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets active incidents
   */
  getActiveIncidents(): SecurityIncident[] {
    return Array.from(this.incidents.values())
      .filter(incident => incident.status !== 'closed')
      .sort((a, b) => b.detectedAt - a.detectedAt);
  }

  /**
   * Gets all incidents
   */
  getAllIncidents(limit?: number): SecurityIncident[] {
    const allIncidents = Array.from(this.incidents.values())
      .sort((a, b) => b.detectedAt - a.detectedAt);
    
    return limit ? allIncidents.slice(0, limit) : allIncidents;
  }

  /**
   * Gets active threats
   */
  getActiveThreats(): SecurityThreat[] {
    return Array.from(this.threats.values())
      .filter(threat => threat.status === 'active')
      .sort((a, b) => b.detectedAt - a.detectedAt);
  }

  /**
   * Gets security manager
   */
  getSecurityManager(): SecurityManager {
    return this.securityManager;
  }

  /**
   * Gets compliance manager
   */
  getComplianceManager(): ComplianceManager {
    return this.complianceManager;
  }

  /**
   * Detects security threats
   */
  private async detectThreats(): Promise<SecurityThreat[]> {
    if (!this.config.enableThreatDetection) {
      return [];
    }

    const threats: SecurityThreat[] = [];
    const securityMetrics = this.securityManager.getMetrics();

    // Check for suspicious patterns
    if (securityMetrics.accessDenials > 10) {
      const threatId = `threat-${++this.threatCounter}`;
      const threat: SecurityThreat = {
        id: threatId,
        type: 'brute_force',
        severity: 'medium',
        source: 'unknown',
        target: 'access_control',
        detectedAt: Date.now(),
        indicators: ['High access denial rate'],
        confidence: 75,
        status: 'active',
        responseActions: []
      };

      this.threats.set(threatId, threat);
      threats.push(threat);
      this.metrics.totalThreats++;
      this.metrics.activeThreats++;

      this.logger.warn('Potential brute force attack detected', {
        threatId,
        accessDenials: securityMetrics.accessDenials
      });
    }

    // Check for compliance violations
    const complianceResults = await this.complianceManager.checkDataPrivacyCompliance();
    if (!complianceResults.compliant) {
      const threatId = `threat-${++this.threatCounter}`;
      const threat: SecurityThreat = {
        id: threatId,
        type: 'data_exfiltration',
        severity: 'high',
        source: 'compliance_violation',
        target: 'data_privacy',
        detectedAt: Date.now(),
        indicators: ['Data privacy compliance violations'],
        confidence: 85,
        status: 'active',
        responseActions: []
      };

      this.threats.set(threatId, threat);
      threats.push(threat);
      this.metrics.totalThreats++;
      this.metrics.activeThreats++;

      this.logger.warn('Data privacy compliance violations detected', {
        threatId,
        violations: complianceResults.violations.length
      });
    }

    return threats;
  }

  /**
   * Triggers automated response for incident
   */
  private async triggerAutomatedResponse(incident: SecurityIncident): Promise<void> {
    try {
      switch (incident.type) {
        case 'threat':
          await this.handleThreatIncident(incident);
          break;
        case 'compliance':
          await this.handleComplianceIncident(incident);
          break;
        case 'access':
          await this.handleAccessIncident(incident);
          break;
        case 'data':
          await this.handleDataIncident(incident);
          break;
        default:
          await this.handleGenericIncident(incident);
      }
    } catch (error) {
      this.logger.error('Automated response failed', {
        incidentId: incident.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handles threat incidents
   */
  private async handleThreatIncident(incident: SecurityIncident): Promise<void> {
    if (incident.severity === 'critical') {
      // Immediate containment
      this.addResponseAction(incident.id, 'isolate', 'Isolating affected systems');
      this.addResponseAction(incident.id, 'alert', 'Sending critical alert to security team');
    } else if (incident.severity === 'high') {
      // Enhanced monitoring
      this.addResponseAction(incident.id, 'investigate', 'Initiating detailed investigation');
      this.addResponseAction(incident.id, 'alert', 'Sending high priority alert');
    } else {
      // Standard monitoring
      this.addResponseAction(incident.id, 'investigate', 'Initiating investigation');
    }
  }

  /**
   * Handles compliance incidents
   */
  private async handleComplianceIncident(incident: SecurityIncident): Promise<void> {
    this.addResponseAction(incident.id, 'investigate', 'Investigating compliance violation');
    this.addResponseAction(incident.id, 'remediate', 'Initiating remediation process');
    
    // Log audit trail
    this.complianceManager.logAuditTrail(
      'system',
      'compliance_violation',
      'compliance_manager',
      { incidentId: incident.id, severity: incident.severity },
      { complianceTags: ['incident_response'] }
    );
  }

  /**
   * Handles access incidents
   */
  private async handleAccessIncident(incident: SecurityIncident): Promise<void> {
    if (incident.severity === 'critical' || incident.severity === 'high') {
      this.addResponseAction(incident.id, 'block', 'Blocking suspicious access');
      this.addResponseAction(incident.id, 'investigate', 'Investigating access patterns');
    } else {
      this.addResponseAction(incident.id, 'investigate', 'Monitoring access patterns');
    }
  }

  /**
   * Handles data incidents
   */
  private async handleDataIncident(incident: SecurityIncident): Promise<void> {
    this.addResponseAction(incident.id, 'quarantine', 'Quarantining affected data');
    this.addResponseAction(incident.id, 'investigate', 'Investigating data breach');
    this.addResponseAction(incident.id, 'alert', 'Alerting data protection officer');
  }

  /**
   * Handles generic incidents
   */
  private async handleGenericIncident(incident: SecurityIncident): Promise<void> {
    this.addResponseAction(incident.id, 'investigate', 'Initiating general investigation');
  }

  /**
   * Calculates security score
   */
  private calculateSecurityScore(metrics: any): number {
    // Simple scoring algorithm (in real implementation, use more sophisticated scoring)
    let score = 100;

    // Deduct points for security issues
    if (metrics.accessDenials > 0) {
      score -= Math.min(metrics.accessDenials * 2, 20);
    }
    if (metrics.rateLimitHits > 0) {
      score -= Math.min(metrics.rateLimitHits, 15);
    }
    if (metrics.complianceViolations > 0) {
      score -= metrics.complianceViolations * 10;
    }

    return Math.max(0, score);
  }

  /**
   * Generates security recommendations
   */
  private generateSecurityRecommendations(
    securityScore: number,
    complianceScore: number,
    threats: SecurityThreat[],
    incidents: SecurityIncident[]
  ): string[] {
    const recommendations: string[] = [];

    if (securityScore < 80) {
      recommendations.push(
        'Security score is below optimal level. Review access controls and security policies.'
      );
    }

    if (complianceScore < 90) {
      recommendations.push(
        'Compliance score needs improvement. Address data privacy and regulatory requirements.'
      );
    }

    if (threats.length > 0) {
      recommendations.push(
        `Active threats detected: ${threats.length}. Prioritize threat containment and investigation.`
      );
    }

    if (incidents.length > 5) {
      recommendations.push(
        'High number of active incidents. Consider implementing additional security controls.'
      );
    }

    if (this.metrics.averageResolutionTime > 3600000) { // 1 hour
      recommendations.push(
        'Average incident resolution time is high. Optimize incident response procedures.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is good. Continue monitoring and maintain current practices.');
    }

    return recommendations;
  }

  /**
   * Starts security monitoring
   */
  private startSecurityMonitoring(): void {
    if (!this.config.enableSecurityMonitoring) return;

    this.securityMonitoringInterval = setInterval(() => {
      this.performSecurityCheck();
    }, this.config.securityMonitoringInterval);
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): SecurityMetrics {
    return {
      totalIncidents: 0,
      openIncidents: 0,
      resolvedIncidents: 0,
      averageResolutionTime: 0,
      totalThreats: 0,
      activeThreats: 0,
      containedThreats: 0,
      securityScore: 100,
      complianceScore: 100,
      threatDetectionRate: 0,
      falsePositiveRate: 0,
      responseTime: 0
    };
  }

  /**
   * Closes the security orchestrator
   */
  async close(): Promise<void> {
    if (this.securityMonitoringInterval) {
      clearInterval(this.securityMonitoringInterval);
    }

    // Close managers
    await Promise.allSettled([
      this.securityManager.close(),
      this.complianceManager.close()
    ]);

    this.logger.info('Security orchestrator closed', {
      totalIncidents: this.metrics.totalIncidents,
      totalThreats: this.metrics.totalThreats,
      securityScore: this.metrics.securityScore,
      complianceScore: this.metrics.complianceScore
    });
  }
} 