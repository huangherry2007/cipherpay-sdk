import { createHash, randomBytes, createHmac } from 'crypto';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from '../monitoring/observability/logger';
import { InputValidator } from './validation';
import { SecurityConfigManager } from './config';
import { ethers } from 'ethers';

export interface User {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
  userId: string;
  permissions: string[];
}

export interface AuthRequest {
  userId: string;
  roles: string[];
  permissions: string[];
  token: string;
  ip: string;
  userAgent: string;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export class AuthenticationError extends Error {
  constructor(message: string, public code: string, public context?: any) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string, public code: string, public context?: any) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class AuthManager {
  private static instance: AuthManager;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private validator: InputValidator;
  private configManager: SecurityConfigManager;
  private secretKey: string;
  private activeTokens: Map<string, AuthToken>;
  private userSessions: Map<string, User>;
  private loginAttempts: Map<string, { count: number; lastAttempt: Date }>;

  private constructor() {
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.validator = InputValidator.getInstance();
    this.configManager = SecurityConfigManager.getInstance();
    this.secretKey = process.env.JWT_SECRET || this.generateSecretKey();
    this.activeTokens = new Map();
    this.userSessions = new Map();
    this.loginAttempts = new Map();
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Authenticates a user with credentials
   */
  async authenticateUser(email: string, password: string, ip: string, userAgent: string): Promise<AuthToken> {
    try {
      // Validate input
      const emailValidation = this.validator.validateEmail(email);
      if (!emailValidation.isValid) {
        throw new AuthenticationError('Invalid email format', 'INVALID_EMAIL');
      }

      const authConfig = this.configManager.getSection('auth');
      
      if (!password || password.length < authConfig.passwordMinLength) {
        throw new AuthenticationError(`Password must be at least ${authConfig.passwordMinLength} characters`, 'INVALID_PASSWORD');
      }

      // Check password complexity requirements
      if (authConfig.passwordRequireUppercase && !/[A-Z]/.test(password)) {
        throw new AuthenticationError('Password must contain at least one uppercase letter', 'INVALID_PASSWORD');
      }
      
      if (authConfig.passwordRequireLowercase && !/[a-z]/.test(password)) {
        throw new AuthenticationError('Password must contain at least one lowercase letter', 'INVALID_PASSWORD');
      }
      
      if (authConfig.passwordRequireNumbers && !/\d/.test(password)) {
        throw new AuthenticationError('Password must contain at least one number', 'INVALID_PASSWORD');
      }
      
      if (authConfig.passwordRequireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        throw new AuthenticationError('Password must contain at least one special character', 'INVALID_PASSWORD');
      }

      // Check for account lockout
      const lockoutKey = `${emailValidation.sanitized}:${ip}`;
      const loginAttempt = this.loginAttempts.get(lockoutKey);
      
      if (loginAttempt) {
        const timeSinceLastAttempt = Date.now() - loginAttempt.lastAttempt.getTime();
        if (loginAttempt.count >= authConfig.maxLoginAttempts && 
            timeSinceLastAttempt < authConfig.lockoutDurationMs) {
          throw new AuthenticationError(
            `Account temporarily locked. Try again in ${Math.ceil((authConfig.lockoutDurationMs - timeSinceLastAttempt) / 60000)} minutes`,
            'ACCOUNT_LOCKED'
          );
        }
        
        // Reset attempts if lockout period has passed
        if (timeSinceLastAttempt >= authConfig.lockoutDurationMs) {
          this.loginAttempts.delete(lockoutKey);
        }
      }

      // In a real implementation, you would:
      // 1. Hash the password and compare with stored hash
      // 2. Check if user exists and is active
      // 3. Verify against database
      
      // For now, we'll simulate user lookup
      const user = await this.findUserByEmail(emailValidation.sanitized);
      if (!user) {
        this.recordLoginAttempt(lockoutKey, false);
        throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      if (!user.isActive) {
        throw new AuthenticationError('Account is deactivated', 'ACCOUNT_DEACTIVATED');
      }

      // Verify password (in real implementation, use bcrypt)
      const passwordValid = await this.verifyPassword(password, user.id);
      if (!passwordValid) {
        this.recordLoginAttempt(lockoutKey, false);
        throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      // Record successful login
      this.recordLoginAttempt(lockoutKey, true);

      // Generate authentication token
      const token = await this.generateToken(user, ip, userAgent);

      // Update last login
      user.lastLoginAt = new Date();
      this.userSessions.set(user.id, user);

      this.logger.info('User authenticated successfully', {
        userId: user.id,
        email: user.email,
        ip,
        userAgent
      });

      return token;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'AuthManager.authenticateUser',
        data: { email, ip, userAgent }
      });
      throw error;
    }
  }

  /**
   * Validates an authentication token
   */
  async validateToken(token: string, ip: string, userAgent: string): Promise<AuthRequest> {
    try {
      if (!token) {
        throw new AuthenticationError('Token is required', 'TOKEN_REQUIRED');
      }

      // Check if token exists in active tokens
      const authToken = this.activeTokens.get(token);
      if (!authToken) {
        throw new AuthenticationError('Invalid or expired token', 'INVALID_TOKEN');
      }

      // Check if token has expired
      if (authToken.expiresAt < new Date()) {
        this.activeTokens.delete(token);
        throw new AuthenticationError('Token has expired', 'TOKEN_EXPIRED');
      }

      // Get user information
      const user = this.userSessions.get(authToken.userId);
      if (!user || !user.isActive) {
        this.activeTokens.delete(token);
        throw new AuthenticationError('User not found or inactive', 'USER_INACTIVE');
      }

      // Verify token signature (in real implementation, verify JWT signature)
      const isValidSignature = await this.verifyTokenSignature(token, authToken);
      if (!isValidSignature) {
        this.activeTokens.delete(token);
        throw new AuthenticationError('Invalid token signature', 'INVALID_SIGNATURE');
      }

      return {
        userId: user.id,
        roles: user.roles,
        permissions: user.permissions,
        token,
        ip,
        userAgent
      };

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'AuthManager.validateToken',
        data: { token: token?.substring(0, 10) + '...', ip, userAgent }
      });
      throw error;
    }
  }

  /**
   * Checks if user has required permissions
   */
  async checkPermission(authRequest: AuthRequest, permission: Permission): Promise<boolean> {
    try {
      // Check if user has the required permission
      const hasPermission = authRequest.permissions.includes(`${permission.resource}:${permission.action}`);
      
      if (!hasPermission) {
        this.logger.warn('Permission denied', {
          userId: authRequest.userId,
          requiredPermission: `${permission.resource}:${permission.action}`,
          userPermissions: authRequest.permissions
        });
        return false;
      }

      // Check additional conditions if specified
      if (permission.conditions) {
        const user = this.userSessions.get(authRequest.userId);
        if (!user) {
          return false;
        }

        // Apply conditions (e.g., check user roles, account status, etc.)
        for (const [key, value] of Object.entries(permission.conditions)) {
          switch (key) {
            case 'requiredRoles':
              const hasRequiredRole = authRequest.roles.some(role => 
                Array.isArray(value) ? value.includes(role) : role === value
              );
              if (!hasRequiredRole) {
                return false;
              }
              break;
            case 'maxAmount':
              // This would be checked in the specific operation context
              break;
            default:
              // Unknown condition
              return false;
          }
        }
      }

      return true;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'AuthManager.checkPermission',
        data: { userId: authRequest.userId, permission }
      });
      return false;
    }
  }

  /**
   * Revokes a user's authentication token
   */
  async revokeToken(token: string, userId: string): Promise<void> {
    try {
      const authToken = this.activeTokens.get(token);
      if (authToken && authToken.userId === userId) {
        this.activeTokens.delete(token);
        this.logger.info('Token revoked', { userId, token: token.substring(0, 10) + '...' });
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'AuthManager.revokeToken',
        data: { userId, token: token?.substring(0, 10) + '...' }
      });
    }
  }

  /**
   * Revokes all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      const tokensToRevoke: string[] = [];
      
      for (const [token, authToken] of this.activeTokens.entries()) {
        if (authToken.userId === userId) {
          tokensToRevoke.push(token);
        }
      }

      tokensToRevoke.forEach(token => this.activeTokens.delete(token));
      
      this.logger.info('All user tokens revoked', { 
        userId, 
        revokedCount: tokensToRevoke.length 
      });

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'AuthManager.revokeAllUserTokens',
        data: { userId }
      });
    }
  }

  /**
   * Generates a secure secret key
   */
  private generateSecretKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generates an authentication token
   */
  private async generateToken(user: User, ip: string, userAgent: string): Promise<AuthToken> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.configManager.getSection('auth').tokenExpiryMs);

    const authToken: AuthToken = {
      token,
      expiresAt,
      userId: user.id,
      permissions: user.permissions
    };

    this.activeTokens.set(token, authToken);

    return authToken;
  }

  /**
   * Verifies token signature
   */
  private async verifyTokenSignature(token: string, authToken: AuthToken): Promise<boolean> {
    // In a real implementation, this would verify JWT signature
    // For now, we'll just check if the token exists in our map
    return this.activeTokens.has(token);
  }

  /**
   * Finds user by email (simulated)
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    // In a real implementation, this would query the database
    // For now, return a mock user
    if (email === 'test@example.com') {
      return {
        id: 'user-123',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['wallet:read', 'wallet:create', 'transfer:create'],
        isActive: true,
        createdAt: new Date(),
        lastLoginAt: new Date()
      };
    }
    return null;
  }

  /**
   * Verifies password (simulated)
   */
  private async verifyPassword(password: string, userId: string): Promise<boolean> {
    // In a real implementation, this would use bcrypt to compare with stored hash
    // For now, accept any password for the test user
    return userId === 'user-123' && password.length >= 8;
  }

  /**
   * Cleans up expired tokens
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    const expiredTokens: string[] = [];

    for (const [token, authToken] of this.activeTokens.entries()) {
      if (authToken.expiresAt < now) {
        expiredTokens.push(token);
      }
    }

    expiredTokens.forEach(token => this.activeTokens.delete(token));

    if (expiredTokens.length > 0) {
      this.logger.info('Cleaned up expired tokens', { count: expiredTokens.length });
    }
  }

  /**
   * Records a login attempt
   */
  private recordLoginAttempt(lockoutKey: string, success: boolean): void {
    const authConfig = this.configManager.getSection('auth');
    
    if (success) {
      // Clear failed attempts on successful login
      this.loginAttempts.delete(lockoutKey);
      return;
    }
    
    const currentAttempt = this.loginAttempts.get(lockoutKey);
    if (currentAttempt) {
      currentAttempt.count++;
      currentAttempt.lastAttempt = new Date();
    } else {
      this.loginAttempts.set(lockoutKey, {
        count: 1,
        lastAttempt: new Date()
      });
    }
  }

  /**
   * Gets authentication statistics
   */
  getAuthStats(): {
    activeTokens: number;
    activeUsers: number;
    totalUsers: number;
    lockedAccounts: number;
  } {
    const lockedAccounts = Array.from(this.loginAttempts.values())
      .filter(attempt => attempt.count >= this.configManager.getSection('auth').maxLoginAttempts)
      .length;

    return {
      activeTokens: this.activeTokens.size,
      activeUsers: this.userSessions.size,
      totalUsers: this.userSessions.size, // In real implementation, this would be from database
      lockedAccounts
    };
  }
}

// Permission definitions
export const Permissions = {
  // Wallet permissions
  WALLET_READ: { resource: 'wallet', action: 'read' },
  WALLET_CREATE: { resource: 'wallet', action: 'create' },
  WALLET_UPDATE: { resource: 'wallet', action: 'update' },
  WALLET_DELETE: { resource: 'wallet', action: 'delete' },

  // Transfer permissions
  TRANSFER_CREATE: { resource: 'transfer', action: 'create' },
  TRANSFER_READ: { resource: 'transfer', action: 'read' },
  TRANSFER_CANCEL: { resource: 'transfer', action: 'cancel' },

  // Note permissions
  NOTE_CREATE: { resource: 'note', action: 'create' },
  NOTE_READ: { resource: 'note', action: 'read' },
  NOTE_UPDATE: { resource: 'note', action: 'update' },

  // Admin permissions
  ADMIN_READ: { resource: 'admin', action: 'read' },
  ADMIN_WRITE: { resource: 'admin', action: 'write' },

  // Financial permissions with conditions
  TRANSFER_LARGE_AMOUNT: { 
    resource: 'transfer', 
    action: 'large_amount',
    conditions: { requiredRoles: ['admin', 'manager'] }
  }
};

// Role definitions
export const Roles = {
  USER: 'user',
  ADMIN: 'admin',
  MANAGER: 'manager',
  SUPPORT: 'support'
}; 