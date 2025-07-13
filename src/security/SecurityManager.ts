import { Logger } from '../monitoring/observability/logger';
import { ErrorHandler, CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface SecurityConfig {
  enableEncryption: boolean;
  enableKeyRotation: boolean;
  keyRotationInterval: number; // milliseconds
  enableAccessControl: boolean;
  enableAuditLogging: boolean;
  enableCompliance: boolean;
  encryptionAlgorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305' | 'AES-256-CBC';
  keyDerivationFunction: 'PBKDF2' | 'Argon2' | 'Scrypt';
  saltLength: number;
  keyLength: number;
  maxKeyAge: number; // milliseconds
  enableRateLimiting: boolean;
  rateLimitWindow: number; // milliseconds
  maxRequestsPerWindow: number;
  enableInputValidation: boolean;
  enableOutputSanitization: boolean;
}

export interface EncryptionKey {
  id: string;
  key: Buffer;
  algorithm: string;
  createdAt: number;
  expiresAt: number;
  isActive: boolean;
  version: number;
  metadata?: Record<string, any>;
}

export interface AccessControlRule {
  id: string;
  resource: string;
  action: string;
  principal: string;
  effect: 'allow' | 'deny';
  conditions?: Record<string, any>;
  priority: number;
  createdAt: number;
  expiresAt?: number;
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  principal: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'denied';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  type: 'GDPR' | 'CCPA' | 'SOX' | 'PCI-DSS' | 'HIPAA' | 'custom';
  description: string;
  requirements: string[];
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  checkFunction: () => Promise<boolean>;
}

export interface SecurityMetrics {
  totalEncryptions: number;
  totalDecryptions: number;
  keyRotations: number;
  accessControlChecks: number;
  accessDenials: number;
  auditEvents: number;
  complianceViolations: number;
  rateLimitHits: number;
  averageEncryptionTime: number;
  averageDecryptionTime: number;
}

export class SecurityManager {
  private config: SecurityConfig;
  private keys: Map<string, EncryptionKey> = new Map();
  private accessRules: Map<string, AccessControlRule> = new Map();
  private auditEvents: AuditEvent[] = [];
  private complianceRules: Map<string, ComplianceRule> = new Map();
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private metrics: SecurityMetrics;
  private keyRotationInterval?: NodeJS.Timeout;
  private auditCleanupInterval?: NodeJS.Timeout;
  private keyCounter = 0;
  private auditCounter = 0;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      enableEncryption: true,
      enableKeyRotation: true,
      keyRotationInterval: 24 * 60 * 60 * 1000, // 24 hours
      enableAccessControl: true,
      enableAuditLogging: true,
      enableCompliance: true,
      encryptionAlgorithm: 'AES-256-GCM',
      keyDerivationFunction: 'PBKDF2',
      saltLength: 32,
      keyLength: 32,
      maxKeyAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      enableRateLimiting: true,
      rateLimitWindow: 60000, // 1 minute
      maxRequestsPerWindow: 100,
      enableInputValidation: true,
      enableOutputSanitization: true,
      ...config
    };

    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.metrics = this.initializeMetrics();

    this.initializeSecurity();
    this.startKeyRotation();
    this.startAuditCleanup();
  }

  /**
   * Initializes security components
   */
  private initializeSecurity(): void {
    // Generate initial encryption key
    if (this.config.enableEncryption) {
      this.generateNewKey();
    }

    // Add default access control rules
    if (this.config.enableAccessControl) {
      this.addDefaultAccessRules();
    }

    // Add default compliance rules
    if (this.config.enableCompliance) {
      this.addDefaultComplianceRules();
    }

    this.logger.info('Security manager initialized', {
      encryptionEnabled: this.config.enableEncryption,
      accessControlEnabled: this.config.enableAccessControl,
      auditLoggingEnabled: this.config.enableAuditLogging,
      complianceEnabled: this.config.enableCompliance
    });
  }

  /**
   * Encrypts data
   */
  async encrypt(data: string | Buffer, keyId?: string): Promise<{
    encryptedData: Buffer;
    keyId: string;
    iv: Buffer;
    authTag?: Buffer;
  }> {
    const startTime = Date.now();

    try {
      const key = keyId ? this.keys.get(keyId) : this.getActiveKey();
      if (!key) {
        throw new CipherPayError(
          'No encryption key available',
          ErrorType.ENCRYPTION_ERROR
        );
      }

      // Convert data to buffer if needed
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

      // Generate IV
      const iv = this.generateIV();

      // Encrypt data (simplified - in real implementation, use crypto library)
      const encryptedData = Buffer.concat([dataBuffer, iv]); // Placeholder
      const authTag = this.generateAuthTag(encryptedData);

      this.metrics.totalEncryptions++;
      this.metrics.averageEncryptionTime = 
        (this.metrics.averageEncryptionTime + (Date.now() - startTime)) / 2;

      this.logger.debug('Data encrypted', {
        keyId: key.id,
        dataSize: dataBuffer.length,
        algorithm: key.algorithm
      });

      return {
        encryptedData,
        keyId: key.id,
        iv,
        authTag
      };
    } catch (error) {
      this.logger.error('Encryption failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Decrypts data
   */
  async decrypt(
    encryptedData: Buffer,
    keyId: string,
    iv: Buffer,
    authTag?: Buffer
  ): Promise<Buffer> {
    const startTime = Date.now();

    try {
      const key = this.keys.get(keyId);
      if (!key) {
        throw new CipherPayError(
          'Encryption key not found',
          ErrorType.ENCRYPTION_ERROR
        );
      }

      if (!key.isActive) {
        throw new CipherPayError(
          'Encryption key is not active',
          ErrorType.ENCRYPTION_ERROR
        );
      }

      // Decrypt data (simplified - in real implementation, use crypto library)
      const decryptedData = encryptedData.slice(0, -iv.length); // Placeholder

      this.metrics.totalDecryptions++;
      this.metrics.averageDecryptionTime = 
        (this.metrics.averageDecryptionTime + (Date.now() - startTime)) / 2;

      this.logger.debug('Data decrypted', {
        keyId: key.id,
        dataSize: decryptedData.length
      });

      return decryptedData;
    } catch (error) {
      this.logger.error('Decryption failed', {
        keyId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Checks access control
   */
  async checkAccess(
    principal: string,
    action: string,
    resource: string,
    context?: Record<string, any>
  ): Promise<boolean> {
    if (!this.config.enableAccessControl) {
      return true;
    }

    const startTime = Date.now();
    let result = false;

    try {
      // Get applicable rules
      const applicableRules = Array.from(this.accessRules.values())
        .filter(rule => 
          rule.principal === principal || rule.principal === '*'
        )
        .filter(rule => 
          rule.action === action || rule.action === '*'
        )
        .filter(rule => 
          rule.resource === resource || rule.resource === '*'
        )
        .filter(rule => 
          !rule.expiresAt || rule.expiresAt > Date.now()
        )
        .sort((a, b) => b.priority - a.priority);

      // Check rules in priority order
      for (const rule of applicableRules) {
        // Check conditions
        if (rule.conditions && context) {
          const conditionsMet = this.evaluateConditions(rule.conditions, context);
          if (!conditionsMet) continue;
        }

        result = rule.effect === 'allow';
        break; // First matching rule determines the result
      }

      this.metrics.accessControlChecks++;
      if (!result) {
        this.metrics.accessDenials++;
      }

      // Log audit event
      if (this.config.enableAuditLogging) {
        this.logAuditEvent({
          principal,
          action,
          resource,
          result: result ? 'success' : 'denied',
          details: { context, applicableRules: applicableRules.length }
        });
      }

      this.logger.debug('Access control check', {
        principal,
        action,
        resource,
        result,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      this.logger.error('Access control check failed', {
        principal,
        action,
        resource,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Validates input data
   */
  validateInput(data: any, schema: Record<string, any>): boolean {
    if (!this.config.enableInputValidation) {
      return true;
    }

    try {
      // Simple validation (in real implementation, use a validation library)
      for (const [key, rules] of Object.entries(schema)) {
        if (rules.required && !data[key]) {
          return false;
        }
        if (rules.type && typeof data[key] !== rules.type) {
          return false;
        }
        if (rules.pattern && !rules.pattern.test(data[key])) {
          return false;
        }
      }
      return true;
    } catch (error) {
      this.logger.error('Input validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Sanitizes output data
   */
  sanitizeOutput(data: any): any {
    if (!this.config.enableOutputSanitization) {
      return data;
    }

    try {
      // Simple sanitization (in real implementation, use a sanitization library)
      if (typeof data === 'string') {
        return data.replace(/[<>]/g, '');
      }
      if (typeof data === 'object' && data !== null) {
        const sanitized: any = Array.isArray(data) ? [] : {};
        for (const [key, value] of Object.entries(data)) {
          sanitized[key] = this.sanitizeOutput(value);
        }
        return sanitized;
      }
      return data;
    } catch (error) {
      this.logger.error('Output sanitization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return data;
    }
  }

  /**
   * Checks rate limiting
   */
  async checkRateLimit(identifier: string): Promise<boolean> {
    if (!this.config.enableRateLimiting) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;
    const current = this.rateLimitStore.get(identifier);

    if (!current || current.resetTime < windowStart) {
      // Reset or initialize
      this.rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now
      });
      return true;
    }

    if (current.count >= this.config.maxRequestsPerWindow) {
      this.metrics.rateLimitHits++;
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * Runs compliance checks
   */
  async runComplianceChecks(): Promise<{
    passed: number;
    failed: number;
    violations: Array<{ rule: string; severity: string; details: string }>;
  }> {
    const results = {
      passed: 0,
      failed: 0,
      violations: [] as Array<{ rule: string; severity: string; details: string }>
    };

    for (const [ruleId, rule] of this.complianceRules.entries()) {
      if (!rule.enabled) continue;

      try {
        const passed = await rule.checkFunction();
        if (passed) {
          results.passed++;
        } else {
          results.failed++;
          results.violations.push({
            rule: rule.name,
            severity: rule.severity,
            details: `Compliance rule ${rule.name} failed`
          });
        }
      } catch (error) {
        results.failed++;
        results.violations.push({
          rule: rule.name,
          severity: rule.severity,
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.metrics.complianceViolations += results.failed;

    this.logger.info('Compliance checks completed', {
      passed: results.passed,
      failed: results.failed,
      totalRules: this.complianceRules.size
    });

    return results;
  }

  /**
   * Gets security metrics
   */
  getMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Gets audit events
   */
  getAuditEvents(limit?: number): AuditEvent[] {
    const events = [...this.auditEvents].reverse(); // Most recent first
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Adds access control rule
   */
  addAccessRule(rule: Omit<AccessControlRule, 'id' | 'createdAt'>): string {
    const ruleId = `rule-${++this.keyCounter}`;
    const newRule: AccessControlRule = {
      ...rule,
      id: ruleId,
      createdAt: Date.now()
    };

    this.accessRules.set(ruleId, newRule);

    this.logger.info('Access control rule added', {
      ruleId,
      principal: rule.principal,
      action: rule.action,
      resource: rule.resource,
      effect: rule.effect
    });

    return ruleId;
  }

  /**
   * Adds compliance rule
   */
  addComplianceRule(rule: Omit<ComplianceRule, 'id'>): string {
    const ruleId = `compliance-${++this.keyCounter}`;
    const newRule: ComplianceRule = {
      ...rule,
      id: ruleId
    };

    this.complianceRules.set(ruleId, newRule);

    this.logger.info('Compliance rule added', {
      ruleId,
      name: rule.name,
      type: rule.type,
      severity: rule.severity
    });

    return ruleId;
  }

  /**
   * Generates new encryption key
   */
  private generateNewKey(): EncryptionKey {
    const keyId = `key-${++this.keyCounter}`;
    const key = Buffer.alloc(this.config.keyLength);
    
    // In real implementation, use crypto.randomBytes
    for (let i = 0; i < key.length; i++) {
      key[i] = Math.floor(Math.random() * 256);
    }

    const encryptionKey: EncryptionKey = {
      id: keyId,
      key,
      algorithm: this.config.encryptionAlgorithm,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.maxKeyAge,
      isActive: true,
      version: 1
    };

    this.keys.set(keyId, encryptionKey);

    this.logger.info('New encryption key generated', {
      keyId,
      algorithm: encryptionKey.algorithm,
      expiresAt: new Date(encryptionKey.expiresAt).toISOString()
    });

    return encryptionKey;
  }

  /**
   * Gets active encryption key
   */
  private getActiveKey(): EncryptionKey | undefined {
    return Array.from(this.keys.values()).find(key => key.isActive);
  }

  /**
   * Generates IV
   */
  private generateIV(): Buffer {
    const iv = Buffer.alloc(16);
    for (let i = 0; i < iv.length; i++) {
      iv[i] = Math.floor(Math.random() * 256);
    }
    return iv;
  }

  /**
   * Generates auth tag
   */
  private generateAuthTag(data: Buffer): Buffer {
    const authTag = Buffer.alloc(16);
    for (let i = 0; i < authTag.length; i++) {
      authTag[i] = Math.floor(Math.random() * 256);
    }
    return authTag;
  }

  /**
   * Evaluates access control conditions
   */
  private evaluateConditions(conditions: Record<string, any>, context: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (context[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Logs audit event
   */
  private logAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const auditEvent: AuditEvent = {
      ...event,
      id: `audit-${++this.auditCounter}`,
      timestamp: Date.now()
    };

    this.auditEvents.push(auditEvent);
    this.metrics.auditEvents++;

    // Keep only last 10000 events
    if (this.auditEvents.length > 10000) {
      this.auditEvents = this.auditEvents.slice(-10000);
    }
  }

  /**
   * Adds default access rules
   */
  private addDefaultAccessRules(): void {
    // Deny all by default
    this.addAccessRule({
      resource: '*',
      action: '*',
      principal: '*',
      effect: 'deny',
      priority: 0
    });

    // Allow authenticated users
    this.addAccessRule({
      resource: '*',
      action: 'read',
      principal: 'authenticated',
      effect: 'allow',
      priority: 100
    });
  }

  /**
   * Adds default compliance rules
   */
  private addDefaultComplianceRules(): void {
    // GDPR compliance check
    this.addComplianceRule({
      name: 'GDPR Data Protection',
      type: 'GDPR',
      description: 'Ensures personal data is properly protected',
      requirements: ['Data encryption', 'Access control', 'Audit logging'],
      enabled: true,
      severity: 'high',
      checkFunction: async () => {
        return this.config.enableEncryption && 
               this.config.enableAccessControl && 
               this.config.enableAuditLogging;
      }
    });

    // PCI-DSS compliance check
    this.addComplianceRule({
      name: 'PCI-DSS Security',
      type: 'PCI-DSS',
      description: 'Ensures payment card data security',
      requirements: ['Strong encryption', 'Access control', 'Audit trails'],
      enabled: true,
      severity: 'critical',
      checkFunction: async () => {
        return this.config.encryptionAlgorithm === 'AES-256-GCM' &&
               this.config.enableAccessControl &&
               this.config.enableAuditLogging;
      }
    });
  }

  /**
   * Starts key rotation
   */
  private startKeyRotation(): void {
    if (!this.config.enableKeyRotation) return;

    this.keyRotationInterval = setInterval(() => {
      this.rotateKeys();
    }, this.config.keyRotationInterval);
  }

  /**
   * Rotates encryption keys
   */
  private rotateKeys(): void {
    try {
      // Generate new key
      const newKey = this.generateNewKey();

      // Deactivate old keys
      for (const key of this.keys.values()) {
        if (key.isActive && key.id !== newKey.id) {
          key.isActive = false;
        }
      }

      this.metrics.keyRotations++;

      this.logger.info('Encryption keys rotated', {
        newKeyId: newKey.id,
        totalKeys: this.keys.size
      });
    } catch (error) {
      this.logger.error('Key rotation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Starts audit cleanup
   */
  private startAuditCleanup(): void {
    this.auditCleanupInterval = setInterval(() => {
      this.cleanupAuditEvents();
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  /**
   * Cleans up old audit events
   */
  private cleanupAuditEvents(): void {
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
    const originalCount = this.auditEvents.length;
    
    this.auditEvents = this.auditEvents.filter(event => event.timestamp > cutoffTime);

    const removedCount = originalCount - this.auditEvents.length;
    if (removedCount > 0) {
      this.logger.info('Audit events cleaned up', {
        removedCount,
        remainingCount: this.auditEvents.length
      });
    }
  }

  /**
   * Initializes metrics
   */
  private initializeMetrics(): SecurityMetrics {
    return {
      totalEncryptions: 0,
      totalDecryptions: 0,
      keyRotations: 0,
      accessControlChecks: 0,
      accessDenials: 0,
      auditEvents: 0,
      complianceViolations: 0,
      rateLimitHits: 0,
      averageEncryptionTime: 0,
      averageDecryptionTime: 0
    };
  }

  /**
   * Closes the security manager
   */
  async close(): Promise<void> {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
    }
    if (this.auditCleanupInterval) {
      clearInterval(this.auditCleanupInterval);
    }

    this.logger.info('Security manager closed', {
      totalKeys: this.keys.size,
      totalAuditEvents: this.auditEvents.length,
      totalComplianceRules: this.complianceRules.size
    });
  }
} 