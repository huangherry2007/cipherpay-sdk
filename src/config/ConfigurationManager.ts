import { CipherPayError, ErrorType } from '../errors/ErrorHandler';

export interface RPCConfig {
  primary: string;
  fallback: string[];
  timeout: number;
  retryAttempts: number;
  connectionPoolSize: number;
}

export interface SecurityConfig {
  requireHardwareWallet: boolean;
  maxProofGenerationRate: number;
  auditLogRetention: number;
  encryptionKeyRotationDays: number;
  sessionTimeout: number;
}

export interface PerformanceConfig {
  enableCaching: boolean;
  cacheSize: number;
  cacheTTL: number;
  batchSize: number;
  maxConcurrentRequests: number;
  timeout: number;
}

export interface MonitoringConfig {
  enableMetrics: boolean;
  enableHealthChecks: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  correlationIdHeader: string;
  enableAuditTrail: boolean;
}

export interface ComplianceConfig {
  enableKYC: boolean;
  enableAML: boolean;
  maxTransactionAmount: string;
  restrictedCountries: string[];
  auditTrailRetention: number;
}

export interface SDKConfig {
  environment: 'development' | 'staging' | 'production';
  version: string;
  rpc: RPCConfig;
  security: SecurityConfig;
  performance: PerformanceConfig;
  monitoring: MonitoringConfig;
  compliance: ComplianceConfig;
  custom?: Record<string, any>;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: SDKConfig;
  private readonly defaultConfig: SDKConfig;
  private configValidators: Map<string, (value: any) => boolean> = new Map();

  private constructor() {
    this.defaultConfig = this.createDefaultConfig();
    this.config = { ...this.defaultConfig };
    this.initializeValidators();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  public getConfig(): SDKConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<SDKConfig>): void {
    const newConfig = { ...this.config, ...updates };
    this.validateConfig(newConfig);
    this.config = newConfig;
  }

  public getEnvironment(): string {
    return this.config.environment;
  }

  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  public getRPCConfig(): RPCConfig {
    return { ...this.config.rpc };
  }

  public getSecurityConfig(): SecurityConfig {
    return { ...this.config.security };
  }

  public getPerformanceConfig(): PerformanceConfig {
    return { ...this.config.performance };
  }

  public getMonitoringConfig(): MonitoringConfig {
    return { ...this.config.monitoring };
  }

  public getComplianceConfig(): ComplianceConfig {
    return { ...this.config.compliance };
  }

  public loadFromEnvironment(): void {
    const envConfig: Partial<SDKConfig> = {};

    // Environment
    if (process.env.CIPHERPAY_ENVIRONMENT) {
      envConfig.environment = process.env.CIPHERPAY_ENVIRONMENT as any;
    }

    // RPC Configuration
    if (process.env.CIPHERPAY_RPC_PRIMARY) {
      envConfig.rpc = {
        ...this.config.rpc,
        primary: process.env.CIPHERPAY_RPC_PRIMARY
      };
    }

    if (process.env.CIPHERPAY_RPC_FALLBACK) {
      envConfig.rpc = {
        ...envConfig.rpc || this.config.rpc,
        fallback: process.env.CIPHERPAY_RPC_FALLBACK.split(',')
      };
    }

    // Security Configuration
    if (process.env.CIPHERPAY_REQUIRE_HARDWARE_WALLET) {
      envConfig.security = {
        ...this.config.security,
        requireHardwareWallet: process.env.CIPHERPAY_REQUIRE_HARDWARE_WALLET === 'true'
      };
    }

    if (process.env.CIPHERPAY_MAX_PROOF_RATE) {
      envConfig.security = {
        ...envConfig.security || this.config.security,
        maxProofGenerationRate: parseInt(process.env.CIPHERPAY_MAX_PROOF_RATE, 10)
      };
    }

    // Performance Configuration
    if (process.env.CIPHERPAY_ENABLE_CACHING) {
      envConfig.performance = {
        ...this.config.performance,
        enableCaching: process.env.CIPHERPAY_ENABLE_CACHING === 'true'
      };
    }

    if (process.env.CIPHERPAY_BATCH_SIZE) {
      envConfig.performance = {
        ...envConfig.performance || this.config.performance,
        batchSize: parseInt(process.env.CIPHERPAY_BATCH_SIZE, 10)
      };
    }

    // Monitoring Configuration
    if (process.env.CIPHERPAY_LOG_LEVEL) {
      envConfig.monitoring = {
        ...this.config.monitoring,
        logLevel: process.env.CIPHERPAY_LOG_LEVEL as any
      };
    }

    if (process.env.CIPHERPAY_ENABLE_METRICS) {
      envConfig.monitoring = {
        ...envConfig.monitoring || this.config.monitoring,
        enableMetrics: process.env.CIPHERPAY_ENABLE_METRICS === 'true'
      };
    }

    // Compliance Configuration
    if (process.env.CIPHERPAY_MAX_TRANSACTION_AMOUNT) {
      envConfig.compliance = {
        ...this.config.compliance,
        maxTransactionAmount: process.env.CIPHERPAY_MAX_TRANSACTION_AMOUNT
      };
    }

    if (process.env.CIPHERPAY_RESTRICTED_COUNTRIES) {
      envConfig.compliance = {
        ...envConfig.compliance || this.config.compliance,
        restrictedCountries: process.env.CIPHERPAY_RESTRICTED_COUNTRIES.split(',')
      };
    }

    this.updateConfig(envConfig);
  }

  public loadFromFile(filePath: string): void {
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(filePath, 'utf8');
      const fileConfig = JSON.parse(configData);
      this.updateConfig(fileConfig);
    } catch (error) {
      throw new CipherPayError(
        `Failed to load configuration from file: ${filePath}`,
        ErrorType.CONFIGURATION_ERROR,
        { filePath, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  public validateConfig(config: SDKConfig): void {
    const errors: string[] = [];

    // Validate environment
    if (!['development', 'staging', 'production'].includes(config.environment)) {
      errors.push('Invalid environment. Must be development, staging, or production.');
    }

    // Validate RPC configuration
    if (!config.rpc.primary || config.rpc.primary.trim() === '') {
      errors.push('Primary RPC endpoint is required.');
    }

    if (config.rpc.timeout <= 0) {
      errors.push('RPC timeout must be greater than 0.');
    }

    if (config.rpc.retryAttempts < 0) {
      errors.push('RPC retry attempts must be non-negative.');
    }

    // Validate security configuration
    if (config.security.maxProofGenerationRate <= 0) {
      errors.push('Max proof generation rate must be greater than 0.');
    }

    if (config.security.auditLogRetention < 0) {
      errors.push('Audit log retention must be non-negative.');
    }

    // Validate performance configuration
    if (config.performance.cacheSize <= 0) {
      errors.push('Cache size must be greater than 0.');
    }

    if (config.performance.batchSize <= 0) {
      errors.push('Batch size must be greater than 0.');
    }

    if (config.performance.maxConcurrentRequests <= 0) {
      errors.push('Max concurrent requests must be greater than 0.');
    }

    // Validate compliance configuration
    if (config.compliance.maxTransactionAmount) {
      try {
        BigInt(config.compliance.maxTransactionAmount);
      } catch {
        errors.push('Max transaction amount must be a valid number.');
      }
    }

    if (errors.length > 0) {
      throw new CipherPayError(
        'Configuration validation failed',
        ErrorType.CONFIGURATION_ERROR,
        { errors }
      );
    }
  }

  public addCustomValidator(key: string, validator: (value: any) => boolean): void {
    this.configValidators.set(key, validator);
  }

  public resetToDefaults(): void {
    this.config = { ...this.defaultConfig };
  }

  private createDefaultConfig(): SDKConfig {
    return {
      environment: 'development',
      version: '0.1.0',
      rpc: {
        primary: 'https://api.mainnet-beta.solana.com',
        fallback: [
          'https://solana-api.projectserum.com',
          'https://rpc.ankr.com/solana'
        ],
        timeout: 30000,
        retryAttempts: 3,
        connectionPoolSize: 10
      },
      security: {
        requireHardwareWallet: false,
        maxProofGenerationRate: 10, // requests per minute
        auditLogRetention: 30, // days
        encryptionKeyRotationDays: 90,
        sessionTimeout: 3600000 // 1 hour in milliseconds
      },
      performance: {
        enableCaching: true,
        cacheSize: 1000,
        cacheTTL: 300000, // 5 minutes in milliseconds
        batchSize: 10,
        maxConcurrentRequests: 5,
        timeout: 60000 // 1 minute in milliseconds
      },
      monitoring: {
        enableMetrics: true,
        enableHealthChecks: true,
        logLevel: 'info',
        correlationIdHeader: 'X-Correlation-ID',
        enableAuditTrail: true
      },
      compliance: {
        enableKYC: false,
        enableAML: false,
        maxTransactionAmount: '1000000000000000000', // 1 ETH in wei
        restrictedCountries: [],
        auditTrailRetention: 7 // days
      }
    };
  }

  private initializeValidators(): void {
    // Add custom validators for specific fields
    this.addCustomValidator('rpc.primary', (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });

    this.addCustomValidator('maxTransactionAmount', (value) => {
      try {
        const amount = BigInt(value);
        return amount > 0;
      } catch {
        return false;
      }
    });
  }
} 