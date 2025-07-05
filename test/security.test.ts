import { InputValidator, ValidationSchemas } from '../src/security/validation';
import { AuthManager, Permissions, Roles } from '../src/security/auth';
import { KeyManager } from '../src/security/keyManager';
import { AuditLogger } from '../src/security/audit';
import { SecurityMiddleware } from '../src/security/middleware';

// Mock dependencies
jest.mock('../src/errors/ErrorHandler');
jest.mock('../src/monitoring/observability/logger');

describe('Security Components', () => {
  let validator: InputValidator;
  let authManager: AuthManager;
  let keyManager: KeyManager;
  let auditLogger: AuditLogger;
  let securityMiddleware: SecurityMiddleware;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the dependencies
    const mockErrorHandler = {
      handleError: jest.fn().mockReturnValue(new Error('Mock error'))
    };
    
    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    (require('../src/errors/ErrorHandler').ErrorHandler.getInstance as jest.Mock)
      .mockReturnValue(mockErrorHandler);
    
    (require('../src/monitoring/observability/logger').Logger.getInstance as jest.Mock)
      .mockReturnValue(mockLogger);
    
    validator = InputValidator.getInstance();
    authManager = AuthManager.getInstance();
    keyManager = KeyManager.getInstance();
    auditLogger = AuditLogger.getInstance();
    securityMiddleware = SecurityMiddleware.getInstance();
  });

  describe('InputValidator', () => {
    describe('basic validation', () => {
      it('should validate required fields', () => {
        const schema = {
          name: { type: 'string' as const, required: true },
          age: { type: 'number' as const, required: true }
        };

        const validData = { name: 'John', age: 25 };
        const invalidData = { name: 'John' }; // Missing age

        const validResult = validator.validate(validData, schema);
        const invalidResult = validator.validate(invalidData, schema);

        expect(validResult.isValid).toBe(true);
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.errors).toContain('age is required');
      });

      it('should validate string length constraints', () => {
        const schema = {
          username: { type: 'string' as const, minLength: 3, maxLength: 20 }
        };

        const shortData = { username: 'ab' };
        const longData = { username: 'verylongusernameexceedinglimit' };
        const validData = { username: 'john_doe' };

        expect(validator.validate(shortData, schema).isValid).toBe(false);
        expect(validator.validate(longData, schema).isValid).toBe(false);
        expect(validator.validate(validData, schema).isValid).toBe(true);
      });

      it('should validate numeric ranges', () => {
        const schema = {
          amount: { type: 'number' as const, min: 0, max: 10000 }
        };

        const negativeData = { amount: -100 };
        const tooLargeData = { amount: 15000 };
        const validData = { amount: 5000 };

        expect(validator.validate(negativeData, schema).isValid).toBe(false);
        expect(validator.validate(tooLargeData, schema).isValid).toBe(false);
        expect(validator.validate(validData, schema).isValid).toBe(true);
      });

      it('should validate enum values', () => {
        const schema = {
          status: { type: 'string' as const, enum: ['active', 'inactive', 'pending'] }
        };

        const validData = { status: 'active' };
        const invalidData = { status: 'unknown' };

        expect(validator.validate(validData, schema).isValid).toBe(true);
        expect(validator.validate(invalidData, schema).isValid).toBe(false);
      });

      it('should sanitize HTML content', () => {
        const maliciousInput = '<script>alert("xss")</script>';
        const sanitized = validator.sanitizeHtml(maliciousInput);
        
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).toContain('&lt;script&gt;');
      });

      it('should validate email addresses', () => {
        const validEmail = 'test@example.com';
        const invalidEmail = 'invalid-email';

        const validResult = validator.validateEmail(validEmail);
        const invalidResult = validator.validateEmail(invalidEmail);

        expect(validResult.isValid).toBe(true);
        expect(validResult.sanitized).toBe('test@example.com');
        expect(invalidResult.isValid).toBe(false);
      });

      it('should validate URLs', () => {
        const validUrl = 'https://example.com';
        const invalidUrl = 'not-a-url';

        const validResult = validator.validateUrl(validUrl);
        const invalidResult = validator.validateUrl(invalidUrl);

        expect(validResult.isValid).toBe(true);
        expect(invalidResult.isValid).toBe(false);
      });

      it('should validate amounts', () => {
        const validAmount = '100.50';
        const invalidAmount = '-50';
        const tooLargeAmount = '999999999999999999999999999999';

        const validResult = validator.validateAmount(validAmount);
        const invalidResult = validator.validateAmount(invalidAmount);
        const tooLargeResult = validator.validateAmount(tooLargeAmount);

        expect(validResult.isValid).toBe(true);
        expect(validResult.sanitized).toBe(100.5);
        expect(invalidResult.isValid).toBe(false);
        expect(tooLargeResult.isValid).toBe(false);
      });
    });

    describe('predefined schemas', () => {
      it('should validate wallet creation data', () => {
        const validData = {
          userId: 'user123',
          walletType: 'standard'
        };

        const invalidData = {
          userId: '', // Empty required field
          walletType: 'invalid_type' // Invalid enum value
        };

        const validResult = validator.validate(validData, ValidationSchemas.createWallet);
        const invalidResult = validator.validate(invalidData, ValidationSchemas.createWallet);

        expect(validResult.isValid).toBe(true);
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.errors.length).toBeGreaterThan(0);
      });

      it('should validate transfer data', () => {
        const validData = {
          fromAddress: '0x1234567890123456789012345678901234567890',
          toAddress: '0x0987654321098765432109876543210987654321',
          amount: '100.50',
          asset: 'ETH'
        };

        const invalidData = {
          fromAddress: '0x123', // Too short
          toAddress: '0x0987654321098765432109876543210987654321',
          amount: '-50', // Negative amount
          asset: 'INVALID' // Invalid asset
        };

        const validResult = validator.validate(validData, ValidationSchemas.transfer);
        const invalidResult = validator.validate(invalidData, ValidationSchemas.transfer);

        expect(validResult.isValid).toBe(true);
        expect(invalidResult.isValid).toBe(false);
      });
    });
  });

  describe('AuthManager', () => {
    describe('authentication', () => {
      it('should authenticate valid user credentials', async () => {
        const email = 'test@example.com';
        const password = 'Password123';
        const ip = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';

        const token = await authManager.authenticateUser(email, password, ip, userAgent);

        expect(token).toBeDefined();
        expect(token.token).toBeDefined();
        expect(token.userId).toBe('user-123');
        expect(token.expiresAt).toBeInstanceOf(Date);
      });

      it('should reject invalid credentials', async () => {
        const email = 'invalid@example.com';
        const password = 'WrongPassword123';
        const ip = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';

        await expect(
          authManager.authenticateUser(email, password, ip, userAgent)
        ).rejects.toThrow('Invalid credentials');
      });

      it('should reject short passwords', async () => {
        const email = 'test@example.com';
        const password = '123';
        const ip = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';

        await expect(
          authManager.authenticateUser(email, password, ip, userAgent)
        ).rejects.toThrow('Password must be at least 8 characters');
      });

      it('should validate tokens', async () => {
        // First authenticate to get a token
        const email = 'test@example.com';
        const password = 'Password123';
        const ip = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';

        const token = await authManager.authenticateUser(email, password, ip, userAgent);
        
        // Validate the token
        const authRequest = await authManager.validateToken(token.token, ip, userAgent);

        expect(authRequest).toBeDefined();
        expect(authRequest.userId).toBe('user-123');
        expect(authRequest.token).toBe(token.token);
        expect(authRequest.permissions).toContain('wallet:read');
      });

      it('should reject invalid tokens', async () => {
        const invalidToken = 'invalid-token';
        const ip = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';

        await expect(
          authManager.validateToken(invalidToken, ip, userAgent)
        ).rejects.toThrow('Invalid or expired token');
      });
    });

    describe('permissions', () => {
      it('should check basic permissions', async () => {
        const authRequest = {
          userId: 'user-123',
          roles: ['user'],
          permissions: ['wallet:read', 'wallet:create'],
          token: 'valid-token',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        };

        const hasPermission = await authManager.checkPermission(authRequest, Permissions.WALLET_READ);
        const noPermission = await authManager.checkPermission(authRequest, Permissions.ADMIN_READ);

        expect(hasPermission).toBe(true);
        expect(noPermission).toBe(false);
      });

      it('should check conditional permissions', async () => {
        // Add admin user to userSessions for condition checking
        const adminUser = {
          id: 'admin-123',
          email: 'admin@example.com',
          roles: ['admin'],
          permissions: ['transfer:create', 'transfer:large_amount'],
          isActive: true,
          createdAt: new Date(),
          lastLoginAt: new Date()
        };
        
        // Access the private userSessions map to add the admin user
        (authManager as any).userSessions.set('admin-123', adminUser);

        const userRequest = {
          userId: 'user-123',
          roles: ['user'],
          permissions: ['transfer:create'],
          token: 'valid-token',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        };

        const adminRequest = {
          userId: 'admin-123',
          roles: ['admin'],
          permissions: ['transfer:create', 'transfer:large_amount'],
          token: 'valid-token',
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        };

        const userCanTransferLarge = await authManager.checkPermission(userRequest, Permissions.TRANSFER_LARGE_AMOUNT);
        const adminCanTransferLarge = await authManager.checkPermission(adminRequest, Permissions.TRANSFER_LARGE_AMOUNT);

        expect(userCanTransferLarge).toBe(false);
        expect(adminCanTransferLarge).toBe(true);
      });
    });

    describe('token management', () => {
      it('should revoke tokens', async () => {
        // First authenticate to get a token
        const email = 'test@example.com';
        const password = 'Password123';
        const ip = '192.168.1.1';
        const userAgent = 'Mozilla/5.0';

        const token = await authManager.authenticateUser(email, password, ip, userAgent);
        
        // Revoke the token
        await authManager.revokeToken(token.token, 'user-123');

        // Try to validate the revoked token
        await expect(
          authManager.validateToken(token.token, ip, userAgent)
        ).rejects.toThrow('Invalid or expired token');
      });

      it('should get authentication statistics', () => {
        const stats = authManager.getAuthStats();

        expect(stats).toBeDefined();
        expect(typeof stats.activeTokens).toBe('number');
        expect(typeof stats.activeUsers).toBe('number');
        expect(typeof stats.totalUsers).toBe('number');
      });
    });
  });

  describe('KeyManager', () => {
    describe('key operations', () => {
      it('should generate keys', async () => {
        const keyId = await keyManager.generateKey('wallet', 'AES-256-GCM', 32, ['test']);

        expect(keyId).toBeDefined();
        expect(typeof keyId).toBe('string');
        expect(keyId.startsWith('key_')).toBe(true);
      });

      it('should retrieve keys', async () => {
        const keyId = await keyManager.generateKey('encryption', 'AES-256-GCM', 32);
        const keyData = await keyManager.getKey(keyId);

        expect(keyData).toBeDefined();
        expect(Buffer.isBuffer(keyData)).toBe(true);
        expect(keyData.length).toBe(32);
      });

      it('should get key metadata', () => {
        const keyId = 'test-key-id';
        const metadata = keyManager.getKeyMetadata(keyId);

        // Should return null for non-existent key
        expect(metadata).toBeNull();
      });

      it('should list keys with filters', () => {
        const keys = keyManager.listKeys({ type: 'wallet', isActive: true });

        expect(Array.isArray(keys)).toBe(true);
      });

      it('should get key statistics', () => {
        const stats = keyManager.getKeyStats();

        expect(stats).toBeDefined();
        expect(typeof stats.totalKeys).toBe('number');
        expect(typeof stats.activeKeys).toBe('number');
        expect(typeof stats.keysByType).toBe('object');
        expect(typeof stats.keysNeedingRotation).toBe('number');
      });
    });

    describe('key rotation', () => {
      it('should rotate keys', async () => {
        const originalKeyId = await keyManager.generateKey('wallet', 'AES-256-GCM', 32);
        const newKeyId = await keyManager.rotateKey(originalKeyId);

        expect(newKeyId).toBeDefined();
        expect(newKeyId).not.toBe(originalKeyId);

        // Original key should be deactivated
        const originalMetadata = keyManager.getKeyMetadata(originalKeyId);
        expect(originalMetadata?.isActive).toBe(false);

        // New key should be active
        const newMetadata = keyManager.getKeyMetadata(newKeyId);
        expect(newMetadata?.isActive).toBe(true);
      });

      it('should check for keys needing rotation', () => {
        const keysNeedingRotation = keyManager.checkKeyRotation();

        expect(Array.isArray(keysNeedingRotation)).toBe(true);
      });
    });

    describe('key lifecycle', () => {
      it('should deactivate keys', async () => {
        const keyId = await keyManager.generateKey('wallet', 'AES-256-GCM', 32);
        await keyManager.deactivateKey(keyId);

        const metadata = keyManager.getKeyMetadata(keyId);
        expect(metadata?.isActive).toBe(false);
      });

      it('should delete keys', async () => {
        const keyId = await keyManager.generateKey('wallet', 'AES-256-GCM', 32);
        await keyManager.deleteKey(keyId);

        const metadata = keyManager.getKeyMetadata(keyId);
        expect(metadata).toBeNull();
      });
    });
  });

  describe('AuditLogger', () => {
    describe('audit events', () => {
      it('should log events', () => {
        const eventId = auditLogger.logEvent({
          userId: 'user-123',
          action: 'test_action',
          resource: 'test_resource',
          details: { test: 'data' },
          success: true,
          severity: 'low',
          category: 'system'
        });

        expect(eventId).toBeDefined();
        expect(typeof eventId).toBe('string');
      });

      it('should log authentication events', () => {
        const eventId = auditLogger.logAuthentication(
          'user-123',
          'login',
          true,
          { ip: '192.168.1.1' },
          '192.168.1.1',
          'Mozilla/5.0'
        );

        expect(eventId).toBeDefined();
      });

      it('should log authorization events', () => {
        const eventId = auditLogger.logAuthorization(
          'user-123',
          'permission_check',
          'wallet',
          'wallet-123',
          true,
          { permission: 'wallet:read' },
          '192.168.1.1',
          'Mozilla/5.0'
        );

        expect(eventId).toBeDefined();
      });

      it('should log financial events', () => {
        const eventId = auditLogger.logFinancial(
          'user-123',
          'transfer_created',
          'transfer',
          'tx-123',
          true,
          { amount: '100.50', asset: 'ETH' },
          '192.168.1.1',
          'Mozilla/5.0'
        );

        expect(eventId).toBeDefined();
      });

      it('should log security events', () => {
        const eventId = auditLogger.logSecurity(
          'user-123',
          'key_generated',
          'key',
          'key-123',
          true,
          { algorithm: 'AES-256-GCM' },
          '192.168.1.1',
          'Mozilla/5.0'
        );

        expect(eventId).toBeDefined();
      });
    });

    describe('audit queries', () => {
      it('should get events with filters', () => {
        // Log some test events first
        auditLogger.logEvent({
          userId: 'user-123',
          action: 'test_action',
          resource: 'test_resource',
          details: { test: 'data' },
          success: true,
          severity: 'low',
          category: 'system'
        });

        const events = auditLogger.getEvents({ 
          userId: 'user-123',
          success: true 
        });

        expect(Array.isArray(events)).toBe(true);
        expect(events.length).toBeGreaterThan(0);
      });

      it('should get audit statistics', () => {
        const stats = auditLogger.getStats();

        expect(stats).toBeDefined();
        expect(typeof stats.totalEvents).toBe('number');
        expect(typeof stats.successRate).toBe('number');
        expect(Array.isArray(stats.recentEvents)).toBe(true);
      });

      it('should search events', () => {
        const events = auditLogger.searchEvents('test_action');

        expect(Array.isArray(events)).toBe(true);
      });

      it('should export events', () => {
        const exportData = auditLogger.exportEvents();

        expect(typeof exportData).toBe('string');
        expect(exportData).toContain('exportDate');
        expect(exportData).toContain('totalEvents');
      });
    });
  });

  describe('SecurityMiddleware', () => {
    describe('middleware creation', () => {
      it('should create security middleware', () => {
        const middleware = securityMiddleware.createSecurityMiddleware({
          requireAuth: true,
          permissions: [Permissions.WALLET_READ],
          validationSchema: ValidationSchemas.createWallet,
          auditAction: 'wallet_read',
          auditResource: 'wallet'
        });

        expect(typeof middleware).toBe('function');
      });

      it('should create rate limit middleware', () => {
        const middleware = securityMiddleware.createRateLimitMiddleware(
          'test_key',
          10,
          60000
        );

        expect(typeof middleware).toBe('function');
      });

      it('should create CORS middleware', () => {
        const middleware = securityMiddleware.createCorsMiddleware(['https://example.com']);

        expect(typeof middleware).toBe('function');
      });

      it('should create logging middleware', () => {
        const middleware = securityMiddleware.createLoggingMiddleware();

        expect(typeof middleware).toBe('function');
      });

      it('should create security headers middleware', () => {
        const middleware = securityMiddleware.createSecurityHeadersMiddleware();

        expect(typeof middleware).toBe('function');
      });
    });
  });

  describe('Security Integration', () => {
    it('should handle complete security flow', async () => {
      // 1. Validate input
      const transferData = {
        fromAddress: '0x1234567890123456789012345678901234567890',
        toAddress: '0x0987654321098765432109876543210987654321',
        amount: '100.50',
        asset: 'ETH'
      };

      const validationResult = validator.validate(transferData, ValidationSchemas.transfer);
      expect(validationResult.isValid).toBe(true);

      // 2. Authenticate user
      const token = await authManager.authenticateUser(
        'test@example.com',
        'Password123',
        '192.168.1.1',
        'Mozilla/5.0'
      );
      expect(token).toBeDefined();

      // 3. Check permissions
      const authRequest = await authManager.validateToken(
        token.token,
        '192.168.1.1',
        'Mozilla/5.0'
      );
      const hasPermission = await authManager.checkPermission(authRequest, Permissions.TRANSFER_CREATE);
      expect(hasPermission).toBe(true);

      // 4. Generate encryption key
      const keyId = await keyManager.generateKey('encryption', 'AES-256-GCM', 32);
      expect(keyId).toBeDefined();

      // 5. Audit the operation
      const eventId = auditLogger.logFinancial(
        authRequest.userId,
        'transfer_created',
        'transfer',
        'tx-123',
        true,
        { amount: transferData.amount, asset: transferData.asset },
        '192.168.1.1',
        'Mozilla/5.0'
      );
      expect(eventId).toBeDefined();
    });
  });
}); 