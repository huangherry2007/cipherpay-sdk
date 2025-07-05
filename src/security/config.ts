import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from '../monitoring/observability/logger';

/**
 * Security configuration interface
 */
export interface SecurityConfig {
  // Authentication settings
  auth: {
    tokenExpiryMs: number;
    refreshTokenExpiryMs: number;
    maxLoginAttempts: number;
    lockoutDurationMs: number;
    passwordMinLength: number;
    passwordRequireUppercase: boolean;
    passwordRequireLowercase: boolean;
    passwordRequireNumbers: boolean;
    passwordRequireSpecialChars: boolean;
    sessionTimeoutMs: number;
    maxConcurrentSessions: number;
  };

  // Encryption settings
  encryption: {
    algorithm: string;
    keySize: number;
    saltRounds: number;
    masterKeyEnvVar: string;
    keyRotationEnabled: boolean;
    keyRotationIntervalMs: number;
    keyBackupRetention: number;
  };

  // Rate limiting settings
  rateLimit: {
    enabled: boolean;
    defaultWindowMs: number;
    defaultMaxRequests: number;
    burstLimit: number;
    storageType: 'memory' | 'redis';
    redisUrl?: string;
  };

  // Audit logging settings
  audit: {
    enabled: boolean;
    retentionDays: number;
    maxLogSize: number;
    compressionEnabled: boolean;
    exportEnabled: boolean;
    exportFormat: 'json' | 'csv' | 'xml';
    sensitiveFields: string[];
    anonymizePII: boolean;
  };

  // Input validation settings
  validation: {
    maxStringLength: number;
    maxObjectDepth: number;
    maxArrayLength: number;
    allowHtml: boolean;
    sanitizeInputs: boolean;
    strictMode: boolean;
  };

  // CORS settings
  cors: {
    enabled: boolean;
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    allowCredentials: boolean;
    maxAge: number;
  };

  // Security headers settings
  securityHeaders: {
    hstsEnabled: boolean;
    hstsMaxAge: number;
    cspEnabled: boolean;
    cspPolicy: string;
    xssProtection: boolean;
    contentTypeOptions: boolean;
    frameOptions: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    referrerPolicy: string;
  };

  // Network security settings
  network: {
    maxRequestSize: number;
    timeoutMs: number;
    keepAlive: boolean;
    proxyEnabled: boolean;
    trustedProxies: string[];
    ipWhitelist: string[];
    ipBlacklist: string[];
  };

  // Compliance settings
  compliance: {
    gdprEnabled: boolean;
    dataRetentionDays: number;
    dataAnonymization: boolean;
    auditTrailRequired: boolean;
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
  };

  // Monitoring settings
  monitoring: {
    enabled: boolean;
    metricsEnabled: boolean;
    alertingEnabled: boolean;
    healthCheckInterval: number;
    performanceMonitoring: boolean;
    errorTracking: boolean;
  };
}

/**
 * Environment-specific configuration presets
 */
export const EnvironmentPresets: Record<string, Partial<SecurityConfig>> = {
  development: {
    auth: {
      tokenExpiryMs: 3600000, // 1 hour
      refreshTokenExpiryMs: 86400000, // 24 hours
      maxLoginAttempts: 5,
      lockoutDurationMs: 300000, // 5 minutes
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecialChars: false,
      sessionTimeoutMs: 1800000, // 30 minutes
      maxConcurrentSessions: 3
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      keySize: 32,
      saltRounds: 10,
      masterKeyEnvVar: 'MASTER_KEY',
      keyRotationEnabled: false,
      keyRotationIntervalMs: 86400000, // 24 hours
      keyBackupRetention: 2
    },
    rateLimit: {
      enabled: true,
      defaultWindowMs: 60000, // 1 minute
      defaultMaxRequests: 100,
      burstLimit: 20,
      storageType: 'memory'
    },
    audit: {
      enabled: true,
      retentionDays: 30,
      maxLogSize: 10485760, // 10MB
      compressionEnabled: false,
      exportEnabled: true,
      exportFormat: 'json',
      sensitiveFields: ['password', 'token', 'privateKey'],
      anonymizePII: false
    },
    validation: {
      maxStringLength: 10000,
      maxObjectDepth: 10,
      maxArrayLength: 1000,
      allowHtml: false,
      sanitizeInputs: true,
      strictMode: false
    },
    cors: {
      enabled: true,
      allowedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      allowCredentials: true,
      maxAge: 86400
    },
    securityHeaders: {
      hstsEnabled: false,
      hstsMaxAge: 31536000,
      cspEnabled: false,
      cspPolicy: "default-src 'self'",
      xssProtection: true,
      contentTypeOptions: true,
      frameOptions: 'SAMEORIGIN',
      referrerPolicy: 'strict-origin-when-cross-origin'
    },
    network: {
      maxRequestSize: 1048576, // 1MB
      timeoutMs: 30000,
      keepAlive: true,
      proxyEnabled: false,
      trustedProxies: [],
      ipWhitelist: [],
      ipBlacklist: []
    },
    compliance: {
      gdprEnabled: false,
      dataRetentionDays: 90,
      dataAnonymization: false,
      auditTrailRequired: true,
      encryptionAtRest: true,
      encryptionInTransit: true
    },
    monitoring: {
      enabled: true,
      metricsEnabled: true,
      alertingEnabled: false,
      healthCheckInterval: 30000,
      performanceMonitoring: true,
      errorTracking: true
    }
  },

  staging: {
    auth: {
      tokenExpiryMs: 1800000, // 30 minutes
      refreshTokenExpiryMs: 604800000, // 7 days
      maxLoginAttempts: 3,
      lockoutDurationMs: 900000, // 15 minutes
      passwordMinLength: 10,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecialChars: true,
      sessionTimeoutMs: 900000, // 15 minutes
      maxConcurrentSessions: 2
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      keySize: 32,
      saltRounds: 12,
      masterKeyEnvVar: 'MASTER_KEY',
      keyRotationEnabled: true,
      keyRotationIntervalMs: 604800000, // 7 days
      keyBackupRetention: 5
    },
    rateLimit: {
      enabled: true,
      defaultWindowMs: 60000,
      defaultMaxRequests: 50,
      burstLimit: 10,
      storageType: 'memory'
    },
    audit: {
      enabled: true,
      retentionDays: 90,
      maxLogSize: 10485760,
      compressionEnabled: false,
      exportEnabled: true,
      exportFormat: 'json',
      sensitiveFields: ['password', 'token', 'privateKey'],
      anonymizePII: true
    },
    validation: {
      maxStringLength: 10000,
      maxObjectDepth: 10,
      maxArrayLength: 1000,
      allowHtml: false,
      sanitizeInputs: true,
      strictMode: true
    },
    cors: {
      enabled: true,
      allowedOrigins: ['https://staging.yourapp.com'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      allowCredentials: true,
      maxAge: 86400
    },
    securityHeaders: {
      hstsEnabled: true,
      hstsMaxAge: 31536000,
      cspEnabled: true,
      cspPolicy: "default-src 'self'",
      xssProtection: true,
      contentTypeOptions: true,
      frameOptions: 'SAMEORIGIN',
      referrerPolicy: 'strict-origin-when-cross-origin'
    },
    compliance: {
      gdprEnabled: true,
      dataRetentionDays: 365,
      dataAnonymization: false,
      auditTrailRequired: true,
      encryptionAtRest: true,
      encryptionInTransit: true
    },
    monitoring: {
      enabled: true,
      metricsEnabled: true,
      alertingEnabled: true,
      healthCheckInterval: 30000,
      performanceMonitoring: true,
      errorTracking: true
    }
  },

  production: {
    auth: {
      tokenExpiryMs: 900000, // 15 minutes
      refreshTokenExpiryMs: 2592000000, // 30 days
      maxLoginAttempts: 3,
      lockoutDurationMs: 1800000, // 30 minutes
      passwordMinLength: 12,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecialChars: true,
      sessionTimeoutMs: 600000, // 10 minutes
      maxConcurrentSessions: 1
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      keySize: 32,
      saltRounds: 12,
      masterKeyEnvVar: 'MASTER_KEY',
      keyRotationEnabled: true,
      keyRotationIntervalMs: 2592000000, // 30 days
      keyBackupRetention: 10
    },
    rateLimit: {
      enabled: true,
      defaultWindowMs: 60000,
      defaultMaxRequests: 30,
      burstLimit: 5,
      storageType: 'redis'
    },
    audit: {
      enabled: true,
      retentionDays: 2555, // 7 years
      maxLogSize: 10485760,
      compressionEnabled: true,
      exportEnabled: true,
      exportFormat: 'json',
      sensitiveFields: ['password', 'token', 'privateKey'],
      anonymizePII: true
    },
    validation: {
      maxStringLength: 10000,
      maxObjectDepth: 10,
      maxArrayLength: 1000,
      allowHtml: false,
      sanitizeInputs: true,
      strictMode: true
    },
    cors: {
      enabled: true,
      allowedOrigins: ['https://yourapp.com', 'https://www.yourapp.com'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      allowCredentials: true,
      maxAge: 86400
    },
    securityHeaders: {
      hstsEnabled: true,
      hstsMaxAge: 31536000,
      cspEnabled: true,
      cspPolicy: "default-src 'self'",
      xssProtection: true,
      contentTypeOptions: true,
      frameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin'
    },
    network: {
      maxRequestSize: 524288, // 512KB
      timeoutMs: 15000,
      keepAlive: true,
      proxyEnabled: true,
      trustedProxies: [],
      ipWhitelist: [],
      ipBlacklist: []
    },
    compliance: {
      gdprEnabled: true,
      dataRetentionDays: 2555,
      dataAnonymization: true,
      auditTrailRequired: true,
      encryptionAtRest: true,
      encryptionInTransit: true
    },
    monitoring: {
      enabled: true,
      metricsEnabled: true,
      alertingEnabled: true,
      healthCheckInterval: 15000,
      performanceMonitoring: true,
      errorTracking: true
    }
  }
};

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: SecurityConfig = {
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
    masterKeyEnvVar: 'MASTER_KEY',
    keyRotationEnabled: false,
    keyRotationIntervalMs: 86400000,
    keyBackupRetention: 2
  },
  rateLimit: {
    enabled: true,
    defaultWindowMs: 60000,
    defaultMaxRequests: 100,
    burstLimit: 20,
    storageType: 'memory'
  },
  audit: {
    enabled: true,
    retentionDays: 30,
    maxLogSize: 10485760,
    compressionEnabled: false,
    exportEnabled: true,
    exportFormat: 'json',
    sensitiveFields: ['password', 'token', 'privateKey'],
    anonymizePII: false
  },
  validation: {
    maxStringLength: 10000,
    maxObjectDepth: 10,
    maxArrayLength: 1000,
    allowHtml: false,
    sanitizeInputs: true,
    strictMode: false
  },
  cors: {
    enabled: true,
    allowedOrigins: ['http://localhost:3000'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    allowCredentials: true,
    maxAge: 86400
  },
  securityHeaders: {
    hstsEnabled: false,
    hstsMaxAge: 31536000,
    cspEnabled: false,
    cspPolicy: "default-src 'self'",
    xssProtection: true,
    contentTypeOptions: true,
    frameOptions: 'SAMEORIGIN',
    referrerPolicy: 'strict-origin-when-cross-origin'
  },
  network: {
    maxRequestSize: 1048576,
    timeoutMs: 30000,
    keepAlive: true,
    proxyEnabled: false,
    trustedProxies: [],
    ipWhitelist: [],
    ipBlacklist: []
  },
  compliance: {
    gdprEnabled: false,
    dataRetentionDays: 90,
    dataAnonymization: false,
    auditTrailRequired: true,
    encryptionAtRest: true,
    encryptionInTransit: true
  },
  monitoring: {
    enabled: true,
    metricsEnabled: true,
    alertingEnabled: false,
    healthCheckInterval: 30000,
    performanceMonitoring: true,
    errorTracking: true
  }
};

/**
 * Configuration validation schema
 */
interface ConfigValidationRule {
  required?: boolean;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;
  enum?: any[];
  custom?: (value: any) => boolean;
}

interface ConfigValidationSchema {
  [key: string]: ConfigValidationRule | ConfigValidationSchema;
}

const CONFIG_VALIDATION_SCHEMA: ConfigValidationSchema = {
  auth: {
    tokenExpiryMs: { type: 'number', min: 60000, max: 86400000, required: true },
    refreshTokenExpiryMs: { type: 'number', min: 3600000, max: 2592000000, required: true },
    maxLoginAttempts: { type: 'number', min: 1, max: 10, required: true },
    lockoutDurationMs: { type: 'number', min: 60000, max: 3600000, required: true },
    passwordMinLength: { type: 'number', min: 8, max: 128, required: true },
    passwordRequireUppercase: { type: 'boolean', required: true },
    passwordRequireLowercase: { type: 'boolean', required: true },
    passwordRequireNumbers: { type: 'boolean', required: true },
    passwordRequireSpecialChars: { type: 'boolean', required: true },
    sessionTimeoutMs: { type: 'number', min: 300000, max: 3600000, required: true },
    maxConcurrentSessions: { type: 'number', min: 1, max: 10, required: true }
  },
  encryption: {
    algorithm: { type: 'string', enum: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'], required: true },
    keySize: { type: 'number', min: 16, max: 512, required: true },
    saltRounds: { type: 'number', min: 8, max: 20, required: true },
    masterKeyEnvVar: { type: 'string', required: true },
    keyRotationEnabled: { type: 'boolean', required: true },
    keyRotationIntervalMs: { type: 'number', min: 3600000, max: 31536000000, required: true },
    keyBackupRetention: { type: 'number', min: 1, max: 50, required: true }
  },
  rateLimit: {
    enabled: { type: 'boolean', required: true },
    defaultWindowMs: { type: 'number', min: 1000, max: 3600000, required: true },
    defaultMaxRequests: { type: 'number', min: 1, max: 10000, required: true },
    burstLimit: { type: 'number', min: 1, max: 1000, required: true },
    storageType: { type: 'string', enum: ['memory', 'redis'], required: true }
  },
  audit: {
    enabled: { type: 'boolean', required: true },
    retentionDays: { type: 'number', min: 1, max: 3650, required: true },
    maxLogSize: { type: 'number', min: 1048576, max: 1073741824, required: true },
    compressionEnabled: { type: 'boolean', required: true },
    exportEnabled: { type: 'boolean', required: true },
    exportFormat: { type: 'string', enum: ['json', 'csv', 'xml'], required: true },
    sensitiveFields: { type: 'array', required: true },
    anonymizePII: { type: 'boolean', required: true }
  },
  validation: {
    maxStringLength: { type: 'number', min: 100, max: 1000000, required: true },
    maxObjectDepth: { type: 'number', min: 1, max: 50, required: true },
    maxArrayLength: { type: 'number', min: 10, max: 100000, required: true },
    allowHtml: { type: 'boolean', required: true },
    sanitizeInputs: { type: 'boolean', required: true },
    strictMode: { type: 'boolean', required: true }
  },
  cors: {
    enabled: { type: 'boolean', required: true },
    allowedOrigins: { type: 'array', required: true },
    allowedMethods: { type: 'array', required: true },
    allowedHeaders: { type: 'array', required: true },
    allowCredentials: { type: 'boolean', required: true },
    maxAge: { type: 'number', min: 0, max: 86400, required: true }
  },
  securityHeaders: {
    hstsEnabled: { type: 'boolean', required: true },
    hstsMaxAge: { type: 'number', min: 0, max: 31536000, required: true },
    cspEnabled: { type: 'boolean', required: true },
    cspPolicy: { type: 'string', required: true },
    xssProtection: { type: 'boolean', required: true },
    contentTypeOptions: { type: 'boolean', required: true },
    frameOptions: { type: 'string', enum: ['DENY', 'SAMEORIGIN', 'ALLOW-FROM'], required: true },
    referrerPolicy: { type: 'string', required: true }
  },
  network: {
    maxRequestSize: { type: 'number', min: 1024, max: 10485760, required: true },
    timeoutMs: { type: 'number', min: 1000, max: 300000, required: true },
    keepAlive: { type: 'boolean', required: true },
    proxyEnabled: { type: 'boolean', required: true },
    trustedProxies: { type: 'array', required: true },
    ipWhitelist: { type: 'array', required: true },
    ipBlacklist: { type: 'array', required: true }
  },
  compliance: {
    gdprEnabled: { type: 'boolean', required: true },
    dataRetentionDays: { type: 'number', min: 1, max: 3650, required: true },
    dataAnonymization: { type: 'boolean', required: true },
    auditTrailRequired: { type: 'boolean', required: true },
    encryptionAtRest: { type: 'boolean', required: true },
    encryptionInTransit: { type: 'boolean', required: true }
  },
  monitoring: {
    enabled: { type: 'boolean', required: true },
    metricsEnabled: { type: 'boolean', required: true },
    alertingEnabled: { type: 'boolean', required: true },
    healthCheckInterval: { type: 'number', min: 5000, max: 300000, required: true },
    performanceMonitoring: { type: 'boolean', required: true },
    errorTracking: { type: 'boolean', required: true }
  }
};

/**
 * Configuration Manager for security settings
 */
export class SecurityConfigManager {
  private static instance: SecurityConfigManager;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private config: SecurityConfig;
  private environment: string;

  private constructor() {
    console.log('=== SECURITY CONFIG MANAGER CONSTRUCTOR CALLED ===');
    console.log('Environment variables in constructor:', Object.entries(process.env).filter(([key]) => key.startsWith('SECURITY_')));
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.environment = this.detectEnvironment();
    this.config = this.loadConfiguration();
    console.log('=== CONSTRUCTOR COMPLETE ===');
  }

  static getInstance(): SecurityConfigManager {
    if (!SecurityConfigManager.instance) {
      SecurityConfigManager.instance = new SecurityConfigManager();
    }
    return SecurityConfigManager.instance;
  }

  // For testing purposes - reset the singleton instance
  static resetInstance(): void {
    SecurityConfigManager.instance = undefined as any;
  }

  /**
   * Get the current configuration
   */
  getConfig(): SecurityConfig {
    return this.config;
  }

  /**
   * Get configuration for a specific section
   */
  getSection<K extends keyof SecurityConfig>(section: K): SecurityConfig[K] {
    return this.config[section];
  }

  /**
   * Update configuration (for runtime updates)
   */
  updateConfig(updates: Partial<SecurityConfig>): void {
    console.log('=== UPDATE CONFIG METHOD CALLED ===');
    console.log('=== UPDATE CONFIG START ===');
    console.log('Updates received:', JSON.stringify(updates, null, 2));
    
    const newConfig = this.mergeConfig(this.config, updates);
    
    console.log('Current config before merge:', JSON.stringify(this.config.auth, null, 2));
    console.log('New config after merge:', JSON.stringify(newConfig.auth, null, 2));
    console.log('Token expiry value:', newConfig.auth.tokenExpiryMs);
    console.log('Token expiry type:', typeof newConfig.auth.tokenExpiryMs);
    
    // Debug: Log the updates being applied
    this.logger.debug('Applying configuration updates', { updates });
    this.logger.debug('Merged configuration', { newConfig });
    this.logger.debug('Current auth config', { auth: newConfig.auth });
    
    // Force validation to run and log any errors
    try {
      console.log('=== STARTING VALIDATION ===');
      this.validateConfig(newConfig);
      console.log('=== VALIDATION PASSED ===');
      this.logger.debug('Validation passed successfully');
    } catch (error) {
      console.log('=== VALIDATION FAILED ===');
      console.log('Error:', (error as Error).message);
      this.logger.error('Validation failed', { error: (error as Error).message });
      throw error;
    }
    
    this.config = newConfig;
    
    console.log('=== UPDATE CONFIG END ===');
    
    this.logger.info('Security configuration updated', {
      environment: this.environment,
      updates: Object.keys(updates)
    });
  }

  /**
   * Reload configuration from environment
   */
  reloadConfig(): void {
    try {
      this.environment = this.detectEnvironment();
      this.config = this.loadConfiguration();
      
      this.logger.info('Security configuration reloaded', {
        environment: this.environment
      });
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'SecurityConfigManager.reloadConfig'
      });
      throw error;
    }
  }

  /**
   * Get configuration as environment variables
   */
  getConfigAsEnvVars(): Record<string, string> {
    const envVars: Record<string, string> = {};
    
    // Flatten configuration object
    const flatten = (obj: any, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const envKey = `${prefix}${key}`.toUpperCase();
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flatten(value, `${envKey}_`);
        } else {
          envVars[envKey] = String(value);
        }
      }
    };

    flatten(this.config, 'SECURITY_');
    return envVars;
  }

  /**
   * Test validation method (for testing purposes)
   */
  testValidateConfig(config: SecurityConfig): void {
    console.log('=== TEST VALIDATE CONFIG CALLED ===');
    console.log('Config passed to testValidateConfig:', JSON.stringify(config.auth, null, 2));
    // Force the validation to run and log any errors
    try {
      this.validateConfig(config);
      console.log('Validation passed successfully');
    } catch (error) {
      console.log('Validation failed with error:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: SecurityConfig): void {
    console.log('=== VALIDATE CONFIG START ===');
    console.log('Config to validate:', JSON.stringify(config, null, 2));
    console.log('Full config keys:', Object.keys(config));
    
    const errors: string[] = [];
    
    const validateSection = (section: any, schema: any, path = '') => {
      console.log(`VALIDATE_SECTION: path=${path}, sectionKeys=${section ? Object.keys(section) : 'null'}, schemaKeys=${Object.keys(schema)}`);
      
      // Check if section exists and is an object
      if (!section || typeof section !== 'object') {
        const error = `${path || 'root'} must be an object`;
        console.log('Section validation error:', error);
        errors.push(error);
        // Don't return here: still check all schema keys for required fields
      }
      
      for (const [key, ruleEntry] of Object.entries(schema)) {
        const rule = ruleEntry as ConfigValidationRule;
        const value = section ? section[key] : undefined;
        const fullPath = path ? `${path}.${key}` : key;
        
        // If this is a nested object (no 'type' property), recurse
        if (typeof ruleEntry === 'object' && ruleEntry !== null && !('type' in ruleEntry)) {
          validateSection(value, ruleEntry, fullPath);
          continue;
        }
        
        console.log(`VALIDATE_FIELD: fullPath=${fullPath}, key=${key}, value=${value}, type=${typeof value}, ruleType=${rule.type}`);
        
        // Check required fields first
        if (rule.required && (value === undefined || value === null)) {
          const error = `${fullPath} is required`;
          console.log('Required field error:', error);
          errors.push(error);
          continue;
        }
        
        // Skip validation for undefined/null non-required fields
        if (value === undefined || value === null) {
          console.log(`Skipping validation for ${fullPath} (undefined/null)`);
          continue;
        }
        
        // Type validation
        if (rule.type === 'string' && typeof value !== 'string') {
          const error = `${fullPath} must be a string`;
          console.log('Type validation error:', error);
          errors.push(error);
        } else if (rule.type === 'number' && typeof value !== 'number') {
          const error = `${fullPath} must be a number`;
          console.log('Type validation error:', error);
          errors.push(error);
        } else if (rule.type === 'boolean' && typeof value !== 'boolean') {
          const error = `${fullPath} must be a boolean`;
          console.log('Type validation error:', error);
          errors.push(error);
        } else if (rule.type === 'array' && !Array.isArray(value)) {
          const error = `${fullPath} must be an array`;
          console.log('Type validation error:', error);
          errors.push(error);
        } else if (rule.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          const error = `${fullPath} must be an object`;
          console.log('Type validation error:', error);
          errors.push(error);
        }
        
        // Range validation for numbers (only if type is correct)
        if (rule.type === 'number' && typeof value === 'number') {
          console.log(`Checking range for ${fullPath}: value=${value}, min=${rule.min}, max=${rule.max}`);
          
          if (rule.min !== undefined && value < rule.min) {
            const error = `${fullPath} must be at least ${rule.min}`;
            console.log('Range validation error:', error);
            errors.push(error);
          }
          if (rule.max !== undefined && value > rule.max) {
            const error = `${fullPath} must be no more than ${rule.max}`;
            console.log('Range validation error:', error);
            errors.push(error);
          }
        }
        
        // Enum validation (only if type is correct)
        if (rule.enum && rule.type === 'string' && typeof value === 'string' && !rule.enum.includes(value)) {
          const error = `${fullPath} must be one of: ${rule.enum.join(', ')}`;
          console.log('Enum validation error:', error);
          errors.push(error);
        }
        
        // Custom validation
        if (rule.custom && !rule.custom(value)) {
          const error = `${fullPath} failed custom validation`;
          console.log('Custom validation error:', error);
          errors.push(error);
        }
      }
    };
    
    try {
      console.log('Starting validation with schema:', Object.keys(CONFIG_VALIDATION_SCHEMA));
      validateSection(config, CONFIG_VALIDATION_SCHEMA);
    } catch (error) {
      const errorMsg = `Validation error: ${error}`;
      console.log('Validation exception:', errorMsg);
      errors.push(errorMsg);
    }
    
    console.log('=== VALIDATION RESULTS ===');
    console.log('Total errors found:', errors.length);
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }
    
    // Debug: Log validation results
    if (errors.length > 0) {
      this.logger.debug('Validation errors found', { errors });
    } else {
      this.logger.debug('Configuration validation passed');
    }
    
    if (errors.length > 0) {
      const errorMessage = `Configuration validation failed:\n${errors.join('\n')}`;
      console.log('Throwing validation error:', errorMessage);
      this.logger.error('Configuration validation failed', { errors });
      throw new Error(errorMessage);
    }
    
    console.log('=== VALIDATE CONFIG END (SUCCESS) ===');
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): string {
    // Check for explicit environment variables first
    if (process.env.STAGING === 'true' || process.env.ENVIRONMENT === 'staging') {
      return 'staging';
    }
    
    if (process.env.PRODUCTION === 'true' || process.env.ENVIRONMENT === 'production') {
      return 'production';
    }
    
    const env = process.env.NODE_ENV || 'development';
    
    if (['development', 'staging', 'production'].includes(env)) {
      return env;
    }
    
    // Auto-detect based on environment variables
    if (process.env.PORT === '3000' || process.env.NODE_ENV === 'development') {
      return 'development';
    }
    
    return 'development';
  }

  /**
   * Load configuration from environment and presets
   */
  private loadConfiguration(): SecurityConfig {
    this.logger.debug('Loading configuration', {
      environment: this.environment,
      securityEnvVars: Object.entries(process.env).filter(([key]) => key.startsWith('SECURITY_')).map(([k, v]) => ({ key: k, value: v }))
    });
    
    // Start with default configuration
    let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    
    // Apply environment preset
    const preset = EnvironmentPresets[this.environment];
    if (preset) {
      config = this.mergeConfig(config, preset);
    }
    
    // Apply environment variables
    config = this.applyEnvironmentVariables(config);
    
    // Validate final configuration
    this.validateConfig(config);
    
    this.logger.info('Security configuration loaded', {
      environment: this.environment,
      configSections: Object.keys(config)
    });
    
    return config;
  }

  /**
   * Apply environment variables to configuration
   */
  private applyEnvironmentVariables(config: SecurityConfig): SecurityConfig {
    // Collect env var overrides as a flat object
    const envOverrides: Record<string, any> = {};

    // Helper function to set nested property in a flat object
    const setFlatProperty = (obj: any, path: string, value: any) => {
      obj[path] = value;
    };

    // Debug: Log all environment variables
    this.logger.debug('Processing environment variables', {
      securityVars: Object.entries(process.env).filter(([key]) => key.startsWith('SECURITY_')).map(([k, v]) => ({ key: k, value: v }))
    });

    // Process environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('SECURITY_')) {
        let configPath = key.replace('SECURITY_', '');
        const mappings: Record<string, string> = {
          'AUTH_TOKENEXPIRYMS': 'auth.tokenExpiryMs',
          'ENCRYPTION_ALGORITHM': 'encryption.algorithm',
          'RATELIMIT_DEFAULTMAXREQUESTS': 'rateLimit.defaultMaxRequests',
          'AUDIT_ENABLED': 'audit.enabled',
          'RATELIMIT_ENABLED': 'rateLimit.enabled',
          'CORS_ALLOWEDORIGINS': 'cors.allowedOrigins'
        };
        
        // Check if we have a direct mapping first
        if (mappings[configPath]) {
          configPath = mappings[configPath];
        } else {
          // Fallback to automatic conversion
          configPath = configPath
            .toLowerCase()
            .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
            .replace(/([a-z])([A-Z])/g, '$1.$2')
            .toLowerCase();
        }
        
        // Convert value to appropriate type
        let typedValue: any = value;
        let shouldSkip = false;
        
        if (value === 'true' || value === 'false') {
          typedValue = value === 'true';
        } else if (!isNaN(Number(value)) && value !== '' && isFinite(Number(value))) {
          typedValue = Number(value);
        } else if (value?.startsWith('[') && value?.endsWith(']')) {
          try {
            typedValue = JSON.parse(value);
          } catch {
            this.logger.warn('Invalid JSON environment variable value, skipping', { key, value, path: configPath });
            shouldSkip = true;
          }
        } else {
          // For string values, check if they're valid for the expected type
          // If we can't determine the type or it's clearly invalid, skip it
          if (configPath.includes('tokenExpiryMs') || configPath.includes('maxRequests') || 
              configPath.includes('keySize') || configPath.includes('saltRounds') ||
              configPath.includes('retentionDays') || configPath.includes('maxLogSize') ||
              configPath.includes('timeoutMs') || configPath.includes('maxAge') ||
              configPath.includes('hstsMaxAge') || configPath.includes('healthCheckInterval') ||
              configPath.includes('dataRetentionDays') || configPath.includes('keyRotationIntervalMs') ||
              configPath.includes('keyBackupRetention') || configPath.includes('maxStringLength') ||
              configPath.includes('maxObjectDepth') || configPath.includes('maxArrayLength') ||
              configPath.includes('maxRequestSize') || configPath.includes('lockoutDurationMs') ||
              configPath.includes('refreshTokenExpiryMs') || configPath.includes('sessionTimeoutMs') ||
              configPath.includes('maxConcurrentSessions') || configPath.includes('defaultWindowMs') ||
              configPath.includes('burstLimit')) {
            // This should be a number, but it's not a valid number
            this.logger.warn('Invalid numeric environment variable value, skipping', { key, value, path: configPath });
            shouldSkip = true;
          } else {
            // For other string values, use them as-is
            typedValue = value;
          }
        }
        
        if (shouldSkip) {
          continue;
        }
        
        setFlatProperty(envOverrides, configPath, typedValue);
      }
    }

    // Deep merge envOverrides into config
    const deepMerge = (target: any, overrides: Record<string, any>) => {
      for (const path in overrides) {
        const keys = path.split('.');
        let current = target;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!(keys[i] in current)) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = overrides[path];
      }
      return target;
    };

    const mergedConfig = deepMerge(JSON.parse(JSON.stringify(config)), envOverrides);

    this.logger.debug('Configuration after environment variable processing', {
      authTokenExpiryMs: mergedConfig.auth.tokenExpiryMs,
      encryptionAlgorithm: mergedConfig.encryption.algorithm,
      rateLimitDefaultMaxRequests: mergedConfig.rateLimit.defaultMaxRequests
    });

    return mergedConfig;
  }

  /**
   * Merge configuration objects
   */
  private mergeConfig(base: any, override: any): any {
    const result = { ...base };
    
    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mergeConfig(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Get configuration summary for logging
   */
  getConfigSummary(): Record<string, any> {
    return {
      environment: this.environment,
      auth: {
        tokenExpiryMs: this.config.auth.tokenExpiryMs,
        maxLoginAttempts: this.config.auth.maxLoginAttempts,
        passwordMinLength: this.config.auth.passwordMinLength
      },
      encryption: {
        algorithm: this.config.encryption.algorithm,
        keyRotationEnabled: this.config.encryption.keyRotationEnabled
      },
      rateLimit: {
        enabled: this.config.rateLimit.enabled,
        defaultMaxRequests: this.config.rateLimit.defaultMaxRequests
      },
      audit: {
        enabled: this.config.audit.enabled,
        retentionDays: this.config.audit.retentionDays
      },
      compliance: {
        gdprEnabled: this.config.compliance.gdprEnabled,
        encryptionAtRest: this.config.compliance.encryptionAtRest
      }
    };
  }
}

// Export default configuration for direct access
export const defaultSecurityConfig = DEFAULT_CONFIG;
export const environmentPresets = EnvironmentPresets; 