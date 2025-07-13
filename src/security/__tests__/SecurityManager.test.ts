import { SecurityManager, SecurityConfig } from '../SecurityManager';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    const config: Partial<SecurityConfig> = {
      enableEncryption: true,
      enableKeyRotation: false, // Disable for testing
      enableAccessControl: true,
      enableAuditLogging: true,
      enableCompliance: true,
      enableRateLimiting: true,
      rateLimitWindow: 1000, // 1 second for testing
      maxRequestsPerWindow: 5
    };

    securityManager = new SecurityManager(config);
  });

  afterEach(async () => {
    await securityManager.close();
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt data', async () => {
      const testData = 'sensitive information';
      
      const encrypted = await securityManager.encrypt(testData);
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.keyId).toBeDefined();
      expect(encrypted.iv).toBeDefined();

      const decrypted = await securityManager.decrypt(
        encrypted.encryptedData,
        encrypted.keyId,
        encrypted.iv
      );

      expect(decrypted.toString()).toBe(testData);
    });

    it('should handle different data types', async () => {
      const testData = Buffer.from('binary data');
      
      const encrypted = await securityManager.encrypt(testData);
      const decrypted = await securityManager.decrypt(
        encrypted.encryptedData,
        encrypted.keyId,
        encrypted.iv
      );

      expect(decrypted).toEqual(testData);
    });

    it('should fail with invalid key', async () => {
      const testData = 'test data';
      const encrypted = await securityManager.encrypt(testData);

      try {
        await securityManager.decrypt(
          encrypted.encryptedData,
          'invalid-key',
          encrypted.iv
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Access Control', () => {
    it('should allow access for permitted operations', async () => {
      // Add a specific allow rule for this test
      securityManager.addAccessRule({
        resource: 'data1',
        action: 'read',
        principal: 'user1',
        effect: 'allow',
        priority: 100
      });

      const allowed = await securityManager.checkAccess(
        'user1',
        'read',
        'data1',
        { role: 'user' }
      );

      expect(allowed).toBe(true);
    });

    it('should deny access for unauthorized operations', async () => {
      // Add a deny rule
      securityManager.addAccessRule({
        resource: 'sensitive-data',
        action: 'write',
        principal: 'user1',
        effect: 'deny',
        priority: 100
      });

      const allowed = await securityManager.checkAccess(
        'user1',
        'write',
        'sensitive-data'
      );

      expect(allowed).toBe(false);
    });

    it('should handle conditional access rules', async () => {
      // Add a conditional rule
      securityManager.addAccessRule({
        resource: 'admin-panel',
        action: 'access',
        principal: 'user1',
        effect: 'allow',
        priority: 50,
        conditions: { role: 'admin' }
      });

      const allowedWithRole = await securityManager.checkAccess(
        'user1',
        'access',
        'admin-panel',
        { role: 'admin' }
      );

      const allowedWithoutRole = await securityManager.checkAccess(
        'user1',
        'access',
        'admin-panel',
        { role: 'user' }
      );

      expect(allowedWithRole).toBe(true);
      expect(allowedWithoutRole).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('should validate input data', () => {
      const schema = {
        name: { required: true, type: 'string' },
        age: { required: true, type: 'number' },
        email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
      };

      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };

      const invalidData = {
        name: 'John Doe',
        age: 'thirty', // Should be number
        email: 'invalid-email'
      };

      expect(securityManager.validateInput(validData, schema)).toBe(true);
      expect(securityManager.validateInput(invalidData, schema)).toBe(false);
    });

    it('should handle missing required fields', () => {
      const schema = {
        name: { required: true, type: 'string' },
        email: { required: true, type: 'string' }
      };

      const incompleteData = {
        name: 'John Doe'
        // Missing email
      };

      expect(securityManager.validateInput(incompleteData, schema)).toBe(false);
    });
  });

  describe('Output Sanitization', () => {
    it('should sanitize output data', () => {
      const maliciousData = '<script>alert("xss")</script>';
      const sanitized = securityManager.sanitizeOutput(maliciousData);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('</script>');
    });

    it('should handle nested objects', () => {
      const data = {
        name: 'John',
        message: '<script>alert("xss")</script>',
        nested: {
          content: '<img src="x" onerror="alert(1)">'
        }
      };

      const sanitized = securityManager.sanitizeOutput(data);

      expect(sanitized.message).not.toContain('<script>');
      expect(sanitized.nested.content).not.toContain('<img');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const identifier = 'user1';

      // Make requests within limit
      for (let i = 0; i < 5; i++) {
        const allowed = await securityManager.checkRateLimit(identifier);
        expect(allowed).toBe(true);
      }
    });

    it('should block requests over limit', async () => {
      const identifier = 'user2';

      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        await securityManager.checkRateLimit(identifier);
      }

      // Next request should be blocked
      const allowed = await securityManager.checkRateLimit(identifier);
      expect(allowed).toBe(false);
    });

    it('should reset after window expires', async () => {
      const identifier = 'user3';

      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        await securityManager.checkRateLimit(identifier);
      }

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again
      const allowed = await securityManager.checkRateLimit(identifier);
      expect(allowed).toBe(true);
    });
  });

  describe('Compliance Checks', () => {
    it('should run compliance checks', async () => {
      const results = await securityManager.runComplianceChecks();

      expect(results.passed).toBeGreaterThanOrEqual(0);
      expect(results.failed).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(results.violations)).toBe(true);
    });

    it('should add custom compliance rules', () => {
      const ruleId = securityManager.addComplianceRule({
        name: 'Custom Rule',
        type: 'custom',
        description: 'Test compliance rule',
        requirements: ['Test requirement'],
        enabled: true,
        severity: 'medium',
        checkFunction: async () => true
      });

      expect(ruleId).toBeDefined();
    });
  });

  describe('Metrics', () => {
    it('should track security metrics', async () => {
      // Perform some operations
      await securityManager.encrypt('test data');
      await securityManager.checkAccess('user1', 'read', 'data1');
      await securityManager.checkRateLimit('user1');

      const metrics = securityManager.getMetrics();

      expect(metrics.totalEncryptions).toBeGreaterThan(0);
      expect(metrics.accessControlChecks).toBeGreaterThan(0);
      expect(metrics.averageEncryptionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Audit Events', () => {
    it('should track audit events', async () => {
      // Perform operations that generate audit events
      await securityManager.checkAccess('user1', 'read', 'data1');
      await securityManager.checkAccess('user2', 'write', 'sensitive-data');

      const auditEvents = securityManager.getAuditEvents();
      expect(Array.isArray(auditEvents)).toBe(true);
    });

    it('should limit audit events', () => {
      const limitedEvents = securityManager.getAuditEvents(5);
      expect(limitedEvents.length).toBeLessThanOrEqual(5);
    });
  });
}); 