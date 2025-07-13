import { ComplianceManager, ComplianceConfig } from '../ComplianceManager';

describe('ComplianceManager', () => {
  let complianceManager: ComplianceManager;

  beforeEach(() => {
    const config: Partial<ComplianceConfig> = {
      enableFrameworks: true,
      enableDataPrivacy: true,
      enableAuditTrails: true,
      enableReporting: true,
      assessmentInterval: 30000, // 30 seconds for testing
      retentionPeriod: 60000, // 1 minute for testing
      maxAuditTrailSize: 100,
      enableAutomatedChecks: false, // Disable for testing
      frameworks: [],
      dataPrivacyRules: []
    };

    complianceManager = new ComplianceManager(config);
  });

  afterEach(async () => {
    await complianceManager.close();
  });

  describe('Compliance Frameworks', () => {
    it('should add custom compliance framework', () => {
      const frameworkId = complianceManager.addFramework({
        name: 'Custom Framework',
        version: '1.0',
        description: 'Test compliance framework',
        requirements: [
          {
            id: 'req-001',
            code: 'CUST-001',
            title: 'Test Requirement',
            description: 'Test compliance requirement',
            category: 'Security',
            severity: 'high',
            mandatory: true,
            checkFunction: async () => ({
              requirementId: 'req-001',
              passed: true,
              score: 95,
              details: 'Requirement met',
              evidence: ['Test evidence'],
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

      expect(frameworkId).toBeDefined();

      const frameworks = complianceManager.getFrameworks();
      const framework = frameworks.find(f => f.id === frameworkId);
      expect(framework).toBeDefined();
      expect(framework?.name).toBe('Custom Framework');
    });

    it('should run compliance assessment', async () => {
      // Add a framework first
      const frameworkId = complianceManager.addFramework({
        name: 'Test Framework',
        version: '1.0',
        description: 'Test framework',
        requirements: [
          {
            id: 'req-001',
            code: 'TEST-001',
            title: 'Test Requirement',
            description: 'Test requirement',
            category: 'Security',
            severity: 'high',
            mandatory: true,
            checkFunction: async () => ({
              requirementId: 'req-001',
              passed: true,
              score: 90,
              details: 'Requirement passed',
              evidence: ['Evidence 1', 'Evidence 2'],
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

      const report = await complianceManager.runAssessment(frameworkId);

      expect(report.id).toBeDefined();
      expect(report.frameworkId).toBe(frameworkId);
      expect(report.summary.totalRequirements).toBe(1);
      expect(report.summary.passedRequirements).toBe(1);
      expect(report.summary.failedRequirements).toBe(0);
      expect(report.summary.overallScore).toBe(90);
      expect(report.summary.status).toBe('compliant');
      expect(report.requirements).toHaveLength(1);
      expect(report.recommendations).toBeDefined();
    });

    it('should handle failed requirements', async () => {
      const frameworkId = complianceManager.addFramework({
        name: 'Test Framework',
        version: '1.0',
        description: 'Test framework',
        requirements: [
          {
            id: 'req-001',
            code: 'TEST-001',
            title: 'Failing Requirement',
            description: 'This requirement will fail',
            category: 'Security',
            severity: 'critical',
            mandatory: true,
            checkFunction: async () => ({
              requirementId: 'req-001',
              passed: false,
              score: 30,
              details: 'Requirement failed',
              evidence: ['Failure evidence'],
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

      const report = await complianceManager.runAssessment(frameworkId);

      expect(report.summary.passedRequirements).toBe(0);
      expect(report.summary.failedRequirements).toBe(1);
      expect(report.summary.overallScore).toBe(30);
      expect(report.summary.status).toBe('non-compliant');
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should throw error for non-existent framework', async () => {
      try {
        await complianceManager.runAssessment('non-existent');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Data Privacy Rules', () => {
    it('should add data privacy rule', () => {
      const ruleId = complianceManager.addDataPrivacyRule({
        name: 'Test Privacy Rule',
        type: 'GDPR',
        description: 'Test data privacy rule',
        dataTypes: ['personal_data', 'sensitive_data'],
        retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
        processingBasis: 'consent',
        enabled: true,
        checkFunction: async () => true
      });

      expect(ruleId).toBeDefined();

      const rules = complianceManager.getDataPrivacyRules();
      const rule = rules.find(r => r.id === ruleId);
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('Test Privacy Rule');
      expect(rule?.type).toBe('GDPR');
    });

    it('should check data privacy compliance', async () => {
      // Add a rule that passes
      complianceManager.addDataPrivacyRule({
        name: 'Passing Rule',
        type: 'GDPR',
        description: 'Rule that passes',
        dataTypes: ['personal_data'],
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        processingBasis: 'consent',
        enabled: true,
        checkFunction: async () => true
      });

      // Add a rule that fails
      complianceManager.addDataPrivacyRule({
        name: 'Failing Rule',
        type: 'CCPA',
        description: 'Rule that fails',
        dataTypes: ['consumer_data'],
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        processingBasis: 'consent',
        enabled: true,
        checkFunction: async () => false
      });

      const results = await complianceManager.checkDataPrivacyCompliance();

      expect(results.compliant).toBe(false);
      expect(results.score).toBe(50); // 1 out of 2 rules passed
      expect(results.violations).toHaveLength(1);
      expect(results.violations[0].rule).toBe('Failing Rule');
    });
  });

  describe('Audit Trails', () => {
    it('should log audit trail entries', () => {
      complianceManager.logAuditTrail(
        'user1',
        'data_access',
        'customer_data',
        { action: 'read', recordId: '123' },
        {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          sessionId: 'session-123',
          complianceTags: ['GDPR', 'data_access']
        }
      );

      const trails = complianceManager.getAuditTrails();
      expect(trails.length).toBeGreaterThan(0);

      const trail = trails[0];
      expect(trail.userId).toBe('user1');
      expect(trail.action).toBe('data_access');
      expect(trail.resource).toBe('customer_data');
      expect(trail.ipAddress).toBe('192.168.1.1');
      expect(trail.complianceTags).toContain('GDPR');
    });

    it('should filter audit trails', () => {
      // Log multiple trails
      complianceManager.logAuditTrail('user1', 'read', 'data1', {});
      complianceManager.logAuditTrail('user2', 'write', 'data2', {});
      complianceManager.logAuditTrail('user1', 'delete', 'data3', {});

      // Filter by user
      const user1Trails = complianceManager.getAuditTrails({ userId: 'user1' });
      expect(user1Trails.length).toBe(2);

      // Filter by action
      const readTrails = complianceManager.getAuditTrails({ action: 'read' });
      expect(readTrails.length).toBe(1);

      // Filter by resource
      const data1Trails = complianceManager.getAuditTrails({ resource: 'data1' });
      expect(data1Trails.length).toBe(1);

      // Filter by time range
      const now = Date.now();
      const recentTrails = complianceManager.getAuditTrails({
        startTime: now - 1000,
        endTime: now + 1000
      });
      expect(recentTrails.length).toBeGreaterThan(0);

      // Limit results
      const limitedTrails = complianceManager.getAuditTrails({ limit: 2 });
      expect(limitedTrails.length).toBeLessThanOrEqual(2);
    });

    it('should respect audit trail size limits', () => {
      // Log more trails than the limit
      for (let i = 0; i < 150; i++) {
        complianceManager.logAuditTrail(`user${i}`, 'action', 'resource', {});
      }

      const trails = complianceManager.getAuditTrails();
      expect(trails.length).toBeLessThanOrEqual(100); // maxAuditTrailSize
    });
  });

  describe('Compliance Reports', () => {
    it('should generate and retrieve reports', async () => {
      // Add framework and run assessment
      const frameworkId = complianceManager.addFramework({
        name: 'Test Framework',
        version: '1.0',
        description: 'Test framework',
        requirements: [
          {
            id: 'req-001',
            code: 'TEST-001',
            title: 'Test Requirement',
            description: 'Test requirement',
            category: 'Security',
            severity: 'high',
            mandatory: true,
            checkFunction: async () => ({
              requirementId: 'req-001',
              passed: true,
              score: 95,
              details: 'Requirement passed',
              evidence: ['Evidence'],
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

      await complianceManager.runAssessment(frameworkId);

      // Get all reports
      const allReports = complianceManager.getReports();
      expect(allReports.length).toBeGreaterThan(0);

      // Get reports for specific framework
      const frameworkReports = complianceManager.getReports(frameworkId);
      expect(frameworkReports.length).toBeGreaterThan(0);
      expect(frameworkReports[0].frameworkId).toBe(frameworkId);

      // Limit reports
      const limitedReports = complianceManager.getReports(undefined, 1);
      expect(limitedReports.length).toBeLessThanOrEqual(1);
    });

    it('should sort reports by generation time', async () => {
      // Add framework
      const frameworkId = complianceManager.addFramework({
        name: 'Test Framework',
        version: '1.0',
        description: 'Test framework',
        requirements: [
          {
            id: 'req-001',
            code: 'TEST-001',
            title: 'Test Requirement',
            description: 'Test requirement',
            category: 'Security',
            severity: 'high',
            mandatory: true,
            checkFunction: async () => ({
              requirementId: 'req-001',
              passed: true,
              score: 95,
              details: 'Requirement passed',
              evidence: ['Evidence'],
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

      // Run multiple assessments
      await complianceManager.runAssessment(frameworkId);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await complianceManager.runAssessment(frameworkId);

      const reports = complianceManager.getReports();
      expect(reports.length).toBeGreaterThan(1);

      // Check that reports are sorted by generation time (newest first)
      for (let i = 0; i < reports.length - 1; i++) {
        expect(reports[i].generatedAt).toBeGreaterThanOrEqual(reports[i + 1].generatedAt);
      }
    });
  });

  describe('Default Frameworks and Rules', () => {
    it('should have default frameworks', () => {
      const frameworks = complianceManager.getFrameworks();
      expect(frameworks.length).toBeGreaterThan(0);

      const gdprFramework = frameworks.find(f => f.name.includes('GDPR'));
      expect(gdprFramework).toBeDefined();
      expect(gdprFramework?.requirements.length).toBeGreaterThan(0);

      const pciFramework = frameworks.find(f => f.name.includes('PCI-DSS'));
      expect(pciFramework).toBeDefined();
      expect(pciFramework?.requirements.length).toBeGreaterThan(0);
    });

    it('should have default data privacy rules', () => {
      const rules = complianceManager.getDataPrivacyRules();
      expect(rules.length).toBeGreaterThan(0);

      const gdprRule = rules.find(r => r.type === 'GDPR');
      expect(gdprRule).toBeDefined();

      const ccpaRule = rules.find(r => r.type === 'CCPA');
      expect(ccpaRule).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle framework requirement errors', async () => {
      const frameworkId = complianceManager.addFramework({
        name: 'Error Framework',
        version: '1.0',
        description: 'Framework with erroring requirements',
        requirements: [
          {
            id: 'req-001',
            code: 'ERROR-001',
            title: 'Erroring Requirement',
            description: 'This requirement will throw an error',
            category: 'Security',
            severity: 'high',
            mandatory: true,
            checkFunction: async () => {
              throw new Error('Requirement check failed');
            }
          }
        ],
        enabled: true,
        lastAssessment: 0,
        nextAssessment: 0,
        status: 'pending'
      });

      const report = await complianceManager.runAssessment(frameworkId);

      expect(report.summary.failedRequirements).toBe(1);
      expect(report.requirements[0].passed).toBe(false);
      expect(report.requirements[0].score).toBe(0);
    });

    it('should handle data privacy rule errors', async () => {
      complianceManager.addDataPrivacyRule({
        name: 'Error Rule',
        type: 'GDPR',
        description: 'Rule that throws error',
        dataTypes: ['personal_data'],
        retentionPeriod: 365 * 24 * 60 * 60 * 1000,
        processingBasis: 'consent',
        enabled: true,
        checkFunction: async () => {
          throw new Error('Privacy check failed');
        }
      });

      const results = await complianceManager.checkDataPrivacyCompliance();

      expect(results.compliant).toBe(false);
      expect(results.violations.length).toBeGreaterThan(0);
    });
  });
}); 