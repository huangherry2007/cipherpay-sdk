import { createCipheriv, createDecipheriv, randomBytes, createHash, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from '../monitoring/observability/logger';
import { InputValidator } from './validation';
import { ethers } from 'ethers';

const scryptAsync = promisify(scrypt);

export interface KeyMetadata {
  id: string;
  type: 'wallet' | 'encryption' | 'signing' | 'master';
  algorithm: string;
  keySize: number;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  version: number;
  tags: string[];
}

export interface EncryptedKey {
  id: string;
  encryptedData: string;
  iv: string;
  salt: string;
  authTag: string;
  algorithm: string;
  keySize: number;
  metadata: KeyMetadata;
}

export interface KeyRotationPolicy {
  maxAge: number; // in milliseconds
  rotationWindow: number; // in milliseconds
  backupRetention: number; // number of versions to keep
}

export class KeyManagementError extends Error {
  constructor(message: string, public code: string, public context?: any) {
    super(message);
    this.name = 'KeyManagementError';
  }
}

export class KeyManager {
  private static instance: KeyManager;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private validator: InputValidator;
  private masterKey: Buffer;
  private keyStore: Map<string, EncryptedKey>;
  private rotationPolicies: Map<string, KeyRotationPolicy>;
  private keyVersions: Map<string, string[]>; // keyId -> version history

  private constructor() {
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.validator = InputValidator.getInstance();
    this.masterKey = this.initializeMasterKey();
    this.keyStore = new Map();
    this.rotationPolicies = new Map();
    this.keyVersions = new Map();
    
    this.initializeDefaultPolicies();
  }

  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  /**
   * Generates a new cryptographic key
   */
  async generateKey(
    type: KeyMetadata['type'],
    algorithm: string = 'AES-256-GCM',
    keySize: number = 32,
    tags: string[] = []
  ): Promise<string> {
    try {
      // Validate key size is reasonable
      if (keySize < 16 || keySize > 512) {
        throw new KeyManagementError('Invalid key size', 'INVALID_PARAMETERS');
      }

      const keyId = this.generateKeyId();
      const keyData = randomBytes(keySize);
      
      // Create key metadata
      const metadata: KeyMetadata = {
        id: keyId,
        type,
        algorithm,
        keySize,
        createdAt: new Date(),
        isActive: true,
        version: 1,
        tags: [...tags, type, algorithm]
      };

      // Encrypt the key
      const encryptedKey = await this.encryptKey(keyData, metadata);
      
      // Store the encrypted key
      this.keyStore.set(keyId, encryptedKey);
      this.keyVersions.set(keyId, [keyId]);

      this.logger.info('Key generated successfully', {
        keyId,
        type,
        algorithm,
        keySize
      });

      return keyId;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.generateKey',
        data: { type, algorithm, keySize }
      });
      throw error;
    }
  }

  /**
   * Retrieves and decrypts a key
   */
  async getKey(keyId: string): Promise<Buffer> {
    try {
      const encryptedKey = this.keyStore.get(keyId);
      if (!encryptedKey) {
        throw new KeyManagementError('Key not found', 'KEY_NOT_FOUND');
      }

      if (!encryptedKey.metadata.isActive) {
        throw new KeyManagementError('Key is inactive', 'KEY_INACTIVE');
      }

      // Check if key has expired
      if (encryptedKey.metadata.expiresAt && encryptedKey.metadata.expiresAt < new Date()) {
        throw new KeyManagementError('Key has expired', 'KEY_EXPIRED');
      }

      // Decrypt the key
      const keyData = await this.decryptKey(encryptedKey);
      
      this.logger.info('Key retrieved successfully', { keyId });

      return keyData;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.getKey',
        data: { keyId }
      });
      throw error;
    }
  }

  /**
   * Rotates a key (creates new version)
   */
  async rotateKey(keyId: string): Promise<string> {
    try {
      const currentKey = this.keyStore.get(keyId);
      if (!currentKey) {
        throw new KeyManagementError('Key not found', 'KEY_NOT_FOUND');
      }

      // Generate new key
      const newKeyId = await this.generateKey(
        currentKey.metadata.type,
        currentKey.metadata.algorithm,
        currentKey.metadata.keySize,
        currentKey.metadata.tags
      );

      // Update version history
      const versions = this.keyVersions.get(keyId) || [];
      versions.push(newKeyId);
      this.keyVersions.set(keyId, versions);

      // Deactivate old key
      currentKey.metadata.isActive = false;
      this.keyStore.set(keyId, currentKey);

      this.logger.info('Key rotated successfully', {
        oldKeyId: keyId,
        newKeyId,
        type: currentKey.metadata.type
      });

      return newKeyId;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.rotateKey',
        data: { keyId }
      });
      throw error;
    }
  }

  /**
   * Deactivates a key
   */
  async deactivateKey(keyId: string): Promise<void> {
    try {
      const encryptedKey = this.keyStore.get(keyId);
      if (!encryptedKey) {
        throw new KeyManagementError('Key not found', 'KEY_NOT_FOUND');
      }

      encryptedKey.metadata.isActive = false;
      this.keyStore.set(keyId, encryptedKey);

      this.logger.info('Key deactivated', { keyId });

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.deactivateKey',
        data: { keyId }
      });
      throw error;
    }
  }

  /**
   * Permanently deletes a key
   */
  async deleteKey(keyId: string): Promise<void> {
    try {
      const encryptedKey = this.keyStore.get(keyId);
      if (!encryptedKey) {
        throw new KeyManagementError('Key not found', 'KEY_NOT_FOUND');
      }

      // Remove from key store
      this.keyStore.delete(keyId);
      this.keyVersions.delete(keyId);

      this.logger.info('Key deleted permanently', { keyId });

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.deleteKey',
        data: { keyId }
      });
      throw error;
    }
  }

  /**
   * Gets key metadata
   */
  getKeyMetadata(keyId: string): KeyMetadata | null {
    const encryptedKey = this.keyStore.get(keyId);
    return encryptedKey ? encryptedKey.metadata : null;
  }

  /**
   * Lists all keys with optional filtering
   */
  listKeys(filter?: {
    type?: KeyMetadata['type'];
    isActive?: boolean;
    tags?: string[];
  }): KeyMetadata[] {
    const keys: KeyMetadata[] = [];

    for (const encryptedKey of this.keyStore.values()) {
      let include = true;

      if (filter?.type && encryptedKey.metadata.type !== filter.type) {
        include = false;
      }

      if (filter?.isActive !== undefined && encryptedKey.metadata.isActive !== filter.isActive) {
        include = false;
      }

      if (filter?.tags && !filter.tags.every(tag => encryptedKey.metadata.tags.includes(tag))) {
        include = false;
      }

      if (include) {
        keys.push(encryptedKey.metadata);
      }
    }

    return keys;
  }

  /**
   * Sets rotation policy for a key type
   */
  setRotationPolicy(keyType: string, policy: KeyRotationPolicy): void {
    this.rotationPolicies.set(keyType, policy);
    this.logger.info('Rotation policy set', { keyType, policy });
  }

  /**
   * Checks if keys need rotation
   */
  checkKeyRotation(): string[] {
    const keysNeedingRotation: string[] = [];
    const now = Date.now();

    for (const [keyId, encryptedKey] of this.keyStore.entries()) {
      if (!encryptedKey.metadata.isActive) continue;

      const policy = this.rotationPolicies.get(encryptedKey.metadata.type);
      if (!policy) continue;

      const keyAge = now - encryptedKey.metadata.createdAt.getTime();
      if (keyAge > policy.maxAge) {
        keysNeedingRotation.push(keyId);
      }
    }

    return keysNeedingRotation;
  }

  /**
   * Performs scheduled key rotation
   */
  async performScheduledRotation(): Promise<string[]> {
    const keysToRotate = this.checkKeyRotation();
    const rotatedKeys: string[] = [];

    for (const keyId of keysToRotate) {
      try {
        const newKeyId = await this.rotateKey(keyId);
        rotatedKeys.push(newKeyId);
      } catch (error) {
        this.logger.error('Failed to rotate key', { keyId, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    if (rotatedKeys.length > 0) {
      this.logger.info('Scheduled key rotation completed', { 
        rotatedCount: rotatedKeys.length,
        rotatedKeys 
      });
    }

    return rotatedKeys;
  }

  /**
   * Exports key for backup (encrypted)
   */
  async exportKey(keyId: string, exportPassword: string): Promise<string> {
    try {
      const encryptedKey = this.keyStore.get(keyId);
      if (!encryptedKey) {
        throw new KeyManagementError('Key not found', 'KEY_NOT_FOUND');
      }

      // Create export-specific encryption
      const salt = randomBytes(16);
      const exportKey = await scryptAsync(exportPassword, salt, 32) as Buffer;
      const iv = randomBytes(16);

      const cipher = createCipheriv('aes-256-gcm', exportKey, iv);
      cipher.setAAD(Buffer.from(keyId));

      let encrypted = cipher.update(JSON.stringify(encryptedKey), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const exportData = {
        keyId,
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        version: '1.0'
      };

      return Buffer.from(JSON.stringify(exportData)).toString('base64');

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.exportKey',
        data: { keyId }
      });
      throw error;
    }
  }

  /**
   * Imports key from backup
   */
  async importKey(exportData: string, exportPassword: string): Promise<string> {
    try {
      const data = JSON.parse(Buffer.from(exportData, 'base64').toString());
      
      // Validate export data
      if (!data.keyId || !data.encryptedData || !data.iv || !data.salt || !data.tag) {
        throw new KeyManagementError('Invalid export data format', 'INVALID_EXPORT_DATA');
      }

      // Decrypt export data
      const salt = Buffer.from(data.salt, 'hex');
      const exportKey = await scryptAsync(exportPassword, salt, 32) as Buffer;
      const iv = Buffer.from(data.iv, 'hex');
      const tag = Buffer.from(data.tag, 'hex');

      const decipher = createDecipheriv('aes-256-gcm', exportKey, iv);
      decipher.setAAD(Buffer.from(data.keyId));
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(data.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const encryptedKey: EncryptedKey = JSON.parse(decrypted);

      // Validate imported key
      if (!this.validator.validateCryptoKey(encryptedKey.algorithm, encryptedKey.keySize).isValid) {
        throw new KeyManagementError('Invalid imported key parameters', 'INVALID_IMPORTED_KEY');
      }

      // Store the imported key
      this.keyStore.set(data.keyId, encryptedKey);
      this.keyVersions.set(data.keyId, [data.keyId]);

      this.logger.info('Key imported successfully', { keyId: data.keyId });

      return data.keyId;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'KeyManager.importKey'
      });
      throw error;
    }
  }

  /**
   * Gets key management statistics
   */
  getKeyStats(): {
    totalKeys: number;
    activeKeys: number;
    keysByType: Record<string, number>;
    keysNeedingRotation: number;
  } {
    const stats = {
      totalKeys: this.keyStore.size,
      activeKeys: 0,
      keysByType: {} as Record<string, number>,
      keysNeedingRotation: this.checkKeyRotation().length
    };

    for (const encryptedKey of this.keyStore.values()) {
      if (encryptedKey.metadata.isActive) {
        stats.activeKeys++;
      }

      const type = encryptedKey.metadata.type;
      stats.keysByType[type] = (stats.keysByType[type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Initializes the master key
   */
  private initializeMasterKey(): Buffer {
    const masterKeyEnv = process.env.MASTER_KEY;
    if (masterKeyEnv) {
      return Buffer.from(masterKeyEnv, 'hex');
    }

    // Generate a new master key if not provided
    const masterKey = randomBytes(32);
    this.logger.warn('No master key provided, generated new one. Set MASTER_KEY environment variable for production.');
    
    return masterKey;
  }

  /**
   * Initializes default rotation policies
   */
  private initializeDefaultPolicies(): void {
    this.setRotationPolicy('wallet', {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      rotationWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
      backupRetention: 3
    });

    this.setRotationPolicy('encryption', {
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
      rotationWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      backupRetention: 5
    });

    this.setRotationPolicy('signing', {
      maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days
      rotationWindow: 14 * 24 * 60 * 60 * 1000, // 14 days
      backupRetention: 3
    });
  }

  /**
   * Generates a unique key ID
   */
  private generateKeyId(): string {
    return `key_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Encrypts a key using the master key
   */
  private async encryptKey(keyData: Buffer, metadata: KeyMetadata): Promise<EncryptedKey> {
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    
    // Derive encryption key from master key
    const encryptionKey = await scryptAsync(this.masterKey, salt, 32) as Buffer;
    
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(Buffer.from(metadata.id));

    let encrypted = cipher.update(keyData);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return {
      id: metadata.id,
      encryptedData: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      algorithm: metadata.algorithm,
      keySize: metadata.keySize,
      metadata
    };
  }

  /**
   * Decrypts a key using the master key
   */
  private async decryptKey(encryptedKey: EncryptedKey): Promise<Buffer> {
    const salt = Buffer.from(encryptedKey.salt, 'hex');
    const iv = Buffer.from(encryptedKey.iv, 'hex');
    const authTag = Buffer.from(encryptedKey.authTag, 'hex');
    
    // Derive decryption key from master key
    const decryptionKey = await scryptAsync(this.masterKey, salt, 32) as Buffer;
    
    const decipher = createDecipheriv('aes-256-gcm', decryptionKey, iv);
    decipher.setAAD(Buffer.from(encryptedKey.id));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(Buffer.from(encryptedKey.encryptedData, 'base64'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
  }
} 