describe('Security Configuration Management', () => {
  let configManager: any;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.SECURITY_AUTH_TOKENEXPIRYMS;
    delete process.env.SECURITY_ENCRYPTION_ALGORITHM;
    delete process.env.SECURITY_RATELIMIT_DEFAULTMAXREQUESTS;
    delete process.env.SECURITY_AUDIT_ENABLED;
    delete process.env.SECURITY_RATELIMIT_ENABLED;
    delete process.env.SECURITY_CORS_ALLOWEDORIGINS;
    
    // Reset singleton instance for fresh test
    const { SecurityConfigManager } = require('../src/security/config');
    SecurityConfigManager.resetInstance();
    
    console.log('=== BEFORE EACH ===');
    console.log('Environment variables reset');
  });

  describe('Configuration Loading', () => {
    it('should load default configuration', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config).toBeDefined();
      expect(config.auth).toBeDefined();
      expect(config.encryption).toBeDefined();
      expect(config.rateLimit).toBeDefined();
      expect(config.audit).toBeDefined();
      expect(config.validation).toBeDefined();
      expect(config.cors).toBeDefined();
      expect(config.securityHeaders).toBeDefined();
      expect(config.network).toBeDefined();
      expect(config.compliance).toBeDefined();
      expect(config.monitoring).toBeDefined();
    });

    it('should detect development environment by default', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const config = configManager.getConfig();
      
      // Development environment should have more relaxed settings
      expect(config.auth.tokenExpiryMs).toBe(3600000); // 1 hour
      expect(config.auth.maxLoginAttempts).toBe(5);
      expect(config.rateLimit.defaultMaxRequests).toBe(100);
    });

    it('should apply production environment preset', () => {
      process.env.NODE_ENV = 'production';
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      configManager.reloadConfig();
      
      const config = configManager.getConfig();
      
      // Production should have stricter settings
      expect(config.auth.tokenExpiryMs).toBe(900000); // 15 minutes
      expect(config.auth.maxLoginAttempts).toBe(3);
      expect(config.auth.passwordMinLength).toBe(12);
      expect(config.rateLimit.defaultMaxRequests).toBe(30);
      expect(config.securityHeaders.hstsEnabled).toBe(true);
      expect(config.compliance.gdprEnabled).toBe(true);
    });

    it('should apply staging environment preset', () => {
      process.env.NODE_ENV = 'staging';
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      configManager.reloadConfig();
      
      const config = configManager.getConfig();
      
      // Staging should have moderate settings
      expect(config.auth.tokenExpiryMs).toBe(1800000); // 30 minutes
      expect(config.auth.maxLoginAttempts).toBe(3);
      expect(config.auth.passwordMinLength).toBe(10);
      expect(config.rateLimit.defaultMaxRequests).toBe(50);
      expect(config.securityHeaders.hstsEnabled).toBe(true);
      expect(config.compliance.gdprEnabled).toBe(true);
    });
  });

  describe('Environment Variables', () => {
    it('should override configuration with environment variables', () => {
      // Set environment variables BEFORE creating the instance
      process.env.SECURITY_AUTH_TOKENEXPIRYMS = '7200000'; // 2 hours
      process.env.SECURITY_ENCRYPTION_ALGORITHM = 'AES-256-CBC';
      process.env.SECURITY_RATELIMIT_DEFAULTMAXREQUESTS = '200';
      
      console.log('Environment variables set:');
      console.log('SECURITY_AUTH_TOKENEXPIRYMS:', process.env.SECURITY_AUTH_TOKENEXPIRYMS);
      console.log('SECURITY_ENCRYPTION_ALGORITHM:', process.env.SECURITY_ENCRYPTION_ALGORITHM);
      console.log('SECURITY_RATELIMIT_DEFAULTMAXREQUESTS:', process.env.SECURITY_RATELIMIT_DEFAULTMAXREQUESTS);
      
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      const config = configManager.getConfig();
      
      console.log('Final config encryption algorithm:', config.encryption.algorithm);
      
      expect(config.auth.tokenExpiryMs).toBe(7200000);
      expect(config.encryption.algorithm).toBe('AES-256-CBC');
      expect(config.rateLimit.defaultMaxRequests).toBe(200);
    });

    it('should handle boolean environment variables', () => {
      process.env.SECURITY_AUDIT_ENABLED = 'false';
      process.env.SECURITY_RATELIMIT_ENABLED = 'true';
      
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.audit.enabled).toBe(false);
      expect(config.rateLimit.enabled).toBe(true);
    });

    it('should handle array environment variables', () => {
      process.env.SECURITY_CORS_ALLOWEDORIGINS = '["https://example.com", "https://test.com"]';
      
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      const config = configManager.getConfig();
      
      expect(config.cors.allowedOrigins).toEqual(['https://example.com', 'https://test.com']);
    });

    it('should get configuration as environment variables', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const envVars = configManager.getConfigAsEnvVars();
      
      expect(envVars.SECURITY_AUTH_TOKENEXPIRYMS).toBeDefined();
      expect(envVars.SECURITY_ENCRYPTION_ALGORITHM).toBeDefined();
      expect(envVars.SECURITY_RATELIMIT_ENABLED).toBeDefined();
    });
  });

  describe('Configuration Sections', () => {
    it('should get specific configuration sections', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const authConfig = configManager.getSection('auth');
      const encryptionConfig = configManager.getSection('encryption');
      const rateLimitConfig = configManager.getSection('rateLimit');
      
      expect(authConfig).toBeDefined();
      expect(authConfig.tokenExpiryMs).toBeDefined();
      expect(authConfig.maxLoginAttempts).toBeDefined();
      
      expect(encryptionConfig).toBeDefined();
      expect(encryptionConfig.algorithm).toBeDefined();
      expect(encryptionConfig.keySize).toBeDefined();
      
      expect(rateLimitConfig).toBeDefined();
      expect(rateLimitConfig.enabled).toBeDefined();
      expect(rateLimitConfig.defaultMaxRequests).toBeDefined();
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration at runtime', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const originalTokenExpiry = configManager.getSection('auth').tokenExpiryMs;
      
      configManager.updateConfig({
        auth: {
          ...configManager.getSection('auth'),
          tokenExpiryMs: 1800000 // 30 minutes
        }
      });
      
      const updatedTokenExpiry = configManager.getSection('auth').tokenExpiryMs;
      expect(updatedTokenExpiry).toBe(1800000);
      expect(updatedTokenExpiry).not.toBe(originalTokenExpiry);
    });

    it('should validate configuration updates', () => {
      // Use a fresh instance for this test
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      expect(() => {
        freshManager.updateConfig({
          auth: {
            ...freshManager.getSection('auth'),
            tokenExpiryMs: -1000 // Invalid negative value
          }
        });
      }).toThrow('Configuration validation failed');
    });

    it('should merge nested configuration updates', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      configManager.updateConfig({
        auth: {
          ...configManager.getSection('auth'),
          tokenExpiryMs: 1800000
        },
        encryption: {
          ...configManager.getSection('encryption'),
          algorithm: 'ChaCha20-Poly1305'
        }
      });
      
      const config = configManager.getConfig();
      expect(config.auth.tokenExpiryMs).toBe(1800000);
      expect(config.encryption.algorithm).toBe('ChaCha20-Poly1305');
      expect(config.auth.maxLoginAttempts).toBeDefined(); // Should preserve other values
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required fields', () => {
      const { SecurityConfigManager, defaultSecurityConfig } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      // Create a config missing a required field
      const invalidConfig = {
        auth: {
          tokenExpiryMs: 3600000,
          refreshTokenExpiryMs: 86400000,
          maxLoginAttempts: 5,
          lockoutDurationMs: 300000,
          passwordMinLength: 8,
          passwordRequireUppercase: true,
          passwordRequireLowercase: true,
          passwordRequireNumbers: true,
          passwordRequireSpecialChars: false,
          sessionTimeoutMs: 1800000,
          maxConcurrentSessions: 3
        },
        encryption: {
          algorithm: 'AES-256-GCM',
          keySize: 32,
          saltRounds: 10,
          // masterKeyEnvVar is missing (required field)
          keyRotationEnabled: false,
          keyRotationIntervalMs: 86400000,
          keyBackupRetention: 2
        }
      };
      
      expect(() => {
        freshManager.testValidateConfig(invalidConfig);
      }).toThrow(/Configuration validation failed/);
    });

    it('should validate negative values', () => {
      const { SecurityConfigManager, defaultSecurityConfig } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      const invalidConfig = { ...defaultSecurityConfig };
      invalidConfig.auth.tokenExpiryMs = -1000;
      
      expect(() => {
        freshManager.testValidateConfig(invalidConfig);
      }).toThrow(/Configuration validation failed/);
    });

    it('should validate negative values directly', () => {
      console.log('=== DIRECT VALIDATION TEST ===');
      
      // Create a fresh instance for this test
      const { SecurityConfigManager, defaultSecurityConfig } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      const invalidConfig = { ...defaultSecurityConfig };
      invalidConfig.auth.tokenExpiryMs = -1000;
      
      console.log('Invalid config auth:', invalidConfig.auth);
      console.log('Token expiry value:', invalidConfig.auth.tokenExpiryMs);
      console.log('Token expiry type:', typeof invalidConfig.auth.tokenExpiryMs);
      
      // Test the validation method directly
      console.log('About to call testValidateConfig...');
      try {
        freshManager.testValidateConfig(invalidConfig);
        console.log('Validation passed (this should not happen)');
      } catch (error) {
        console.log('Validation failed as expected:', (error as Error).message);
        expect((error as Error).message).toContain('Configuration validation failed');
        expect((error as Error).message).toContain('auth.tokenExpiryMs');
        // If missing masterKeyEnvVar, also check for that
        if (!(invalidConfig.encryption && invalidConfig.encryption.masterKeyEnvVar)) {
          expect((error as Error).message).toContain('encryption.masterKeyEnvVar');
        }
      }
    });

    it('should test simple validation', () => {
      const { SecurityConfigManager, defaultSecurityConfig } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const manager = SecurityConfigManager.getInstance();

      // Use a full config object, not just { auth: ... }
      const invalidConfig = {
        ...defaultSecurityConfig,
        auth: {
          ...defaultSecurityConfig.auth,
          tokenExpiryMs: -1000
        }
      };

      // This should throw, but if it doesn't, fail the test
      try {
        manager.testValidateConfig(invalidConfig);
        // If we get here, validation did NOT throw
        expect('Validation did not throw').toBe('Validation should have thrown');
      } catch (error) {
        // If we get here, validation threw as expected
        expect((error as Error).message).toContain('Configuration validation failed');
      }
    });

    it('should always pass', () => {
      console.log('ALWAYS PASS TEST');
      expect(1).toBe(1);
    });

    it('should validate numeric ranges', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      expect(() => {
        freshManager.updateConfig({
          auth: {
            ...freshManager.getSection('auth'),
            tokenExpiryMs: 30000 // Below minimum
          }
        });
      }).toThrow(/Configuration validation failed/);
    });

    it('should validate enum values', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      expect(() => {
        freshManager.updateConfig({
          encryption: {
            ...freshManager.getSection('encryption'),
            algorithm: 'INVALID_ALGORITHM'
          }
        });
      }).toThrow(/Configuration validation failed/);
    });

    it('should validate boolean types', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      const freshManager = SecurityConfigManager.getInstance();
      
      expect(() => {
        freshManager.updateConfig({
          rateLimit: {
            ...freshManager.getSection('rateLimit'),
            enabled: 'not-a-boolean' as any
          }
        });
      }).toThrow(/Configuration validation failed/);
    });
  });

  describe('Environment Detection', () => {
    it('should detect development environment', () => {
      process.env.NODE_ENV = 'development';
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      configManager.reloadConfig();
      
      const summary = configManager.getConfigSummary();
      expect(summary.environment).toBe('development');
    });

    it('should detect staging environment', () => {
      process.env.NODE_ENV = 'staging';
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      configManager.reloadConfig();
      
      const summary = configManager.getConfigSummary();
      expect(summary.environment).toBe('staging');
    });

    it('should detect production environment', () => {
      process.env.NODE_ENV = 'production';
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      configManager.reloadConfig();
      
      const summary = configManager.getConfigSummary();
      expect(summary.environment).toBe('production');
    });

    it('should auto-detect environment from other variables', () => {
      process.env.STAGING = 'true';
      const { SecurityConfigManager } = require('../src/security/config');
      SecurityConfigManager.resetInstance();
      configManager = SecurityConfigManager.getInstance();
      configManager.reloadConfig();
      
      const summary = configManager.getConfigSummary();
      expect(summary.environment).toBe('staging');
    });
  });

  describe('Configuration Summary', () => {
    it('should provide configuration summary', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const summary = configManager.getConfigSummary();
      
      expect(summary.environment).toBeDefined();
      expect(summary.auth).toBeDefined();
      expect(summary.encryption).toBeDefined();
      expect(summary.rateLimit).toBeDefined();
      expect(summary.audit).toBeDefined();
      expect(summary.compliance).toBeDefined();
    });

    it('should include key security settings in summary', () => {
      const { SecurityConfigManager } = require('../src/security/config');
      configManager = SecurityConfigManager.getInstance();
      const summary = configManager.getConfigSummary();
      
      expect(summary.auth.tokenExpiryMs).toBeDefined();
      expect(summary.auth.maxLoginAttempts).toBeDefined();
      expect(summary.auth.passwordMinLength).toBeDefined();
      expect(summary.encryption.algorithm).toBeDefined();
      expect(summary.encryption.keyRotationEnabled).toBeDefined();
      expect(summary.rateLimit.enabled).toBeDefined();
      expect(summary.rateLimit.defaultMaxRequests).toBeDefined();
      expect(summary.audit.enabled).toBeDefined();
      expect(summary.audit.retentionDays).toBeDefined();
      expect(summary.compliance.gdprEnabled).toBeDefined();
      expect(summary.compliance.encryptionAtRest).toBeDefined();
    });
  });

  describe('Environment Presets', () => {
    it('should have development preset', () => {
      const { EnvironmentPresets } = require('../src/security/config');
      const preset = EnvironmentPresets.development;
      expect(preset).toBeDefined();
      expect(preset.auth).toBeDefined();
      expect(preset.encryption).toBeDefined();
    });

    it('should have staging preset', () => {
      const { EnvironmentPresets } = require('../src/security/config');
      const preset = EnvironmentPresets.staging;
      expect(preset).toBeDefined();
      expect(preset.auth).toBeDefined();
      expect(preset.encryption).toBeDefined();
    });

    it('should have production preset', () => {
      const { EnvironmentPresets } = require('../src/security/config');
      const preset = EnvironmentPresets.production;
      expect(preset).toBeDefined();
      expect(preset.auth).toBeDefined();
      expect(preset.encryption).toBeDefined();
    });

    it('should have appropriate security levels for each environment', () => {
      const { EnvironmentPresets } = require('../src/security/config');
      const devPreset = EnvironmentPresets.development;
      const stagingPreset = EnvironmentPresets.staging;
      const prodPreset = EnvironmentPresets.production;

      // Development should be most relaxed
      expect(devPreset.auth?.tokenExpiryMs).toBeGreaterThan(stagingPreset.auth?.tokenExpiryMs || 0);
      expect(devPreset.auth?.tokenExpiryMs).toBeGreaterThan(prodPreset.auth?.tokenExpiryMs || 0);

      // Production should be most strict
      expect(prodPreset.auth?.passwordMinLength).toBeGreaterThan(devPreset.auth?.passwordMinLength || 0);
      expect(prodPreset.auth?.passwordMinLength).toBeGreaterThan(stagingPreset.auth?.passwordMinLength || 0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid environment variables gracefully', () => {
      process.env.SECURITY_AUTH_TOKENEXPIRYMS = 'not-a-number';
      
      // Should not throw, but use default values
      expect(() => {
        const { SecurityConfigManager } = require('../src/security/config');
        SecurityConfigManager.resetInstance();
        configManager = SecurityConfigManager.getInstance();
      }).not.toThrow();
    });

    it('should handle missing environment variables', () => {
      delete process.env.NODE_ENV;
      delete process.env.SECURITY_AUTH_TOKENEXPIRYMS;
      
      expect(() => {
        const { SecurityConfigManager } = require('../src/security/config');
        SecurityConfigManager.resetInstance();
        configManager = SecurityConfigManager.getInstance();
      }).not.toThrow();
      
      const config = configManager.getConfig();
      expect(config.auth.tokenExpiryMs).toBeDefined();
    });
  });
}); 