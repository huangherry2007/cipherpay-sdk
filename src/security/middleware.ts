import { IncomingMessage, ServerResponse } from 'http';
import { AuthManager, AuthRequest, Permission, Permissions } from './auth';
import { InputValidator, ValidationSchema, ValidationSchemas } from './validation';
import { AuditLogger, AuditEvent } from './audit';
import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from '../monitoring/observability/logger';
import { ethers } from 'ethers';
import { SecurityConfigManager } from './config';
import { RateLimiter } from '../utils/RateLimiter';

export interface SecurityContext {
  authRequest?: AuthRequest;
  validatedData?: any;
  requestId: string;
  startTime: number;
}

export interface SecurityConfig {
  requireAuth?: boolean;
  permissions?: Permission[];
  validationSchema?: ValidationSchema;
  auditAction?: string;
  auditResource?: string;
  rateLimitKey?: string;
  maxRequestSize?: number;
}

export interface MiddlewareRequest extends IncomingMessage {
  securityContext?: SecurityContext;
  body?: any;
  query?: Record<string, string>;
}

export class SecurityMiddleware {
  private static instance: SecurityMiddleware;
  private logger: Logger;
  private errorHandler: ErrorHandler;
  private authManager: AuthManager;
  private validator: InputValidator;
  private auditLogger: AuditLogger;

  private constructor() {
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
    this.authManager = AuthManager.getInstance();
    this.validator = InputValidator.getInstance();
    this.auditLogger = AuditLogger.getInstance();
  }

  static getInstance(): SecurityMiddleware {
    if (!SecurityMiddleware.instance) {
      SecurityMiddleware.instance = new SecurityMiddleware();
    }
    return SecurityMiddleware.instance;
  }

  /**
   * Creates a comprehensive security middleware function
   */
  createSecurityMiddleware(config: SecurityConfig) {
    return async (req: MiddlewareRequest, res: ServerResponse, next: () => void) => {
      const requestId = this.generateRequestId();
      const startTime = Date.now();
      
      // Initialize security context
      req.securityContext = {
        requestId,
        startTime
      };

      try {
        // 1. Extract client information
        const clientInfo = this.extractClientInfo(req);
        
        // 2. Validate request size
        if (config.maxRequestSize) {
          await this.validateRequestSize(req, config.maxRequestSize);
        }

        // 3. Authenticate request if required
        if (config.requireAuth) {
          const authRequest = await this.authenticateRequest(req, clientInfo);
          req.securityContext.authRequest = authRequest;
        }

        // 4. Check permissions if specified
        if (config.permissions && req.securityContext.authRequest) {
          await this.checkPermissions(req.securityContext.authRequest, config.permissions);
        }

        // 5. Validate input if schema provided
        if (config.validationSchema) {
          const validatedData = await this.validateInput(req, config.validationSchema);
          req.securityContext.validatedData = validatedData;
        }

        // 6. Audit the request
        if (config.auditAction && config.auditResource) {
          this.auditRequest(req, config, clientInfo, true);
        }

        // Continue to next middleware/handler
        next();

      } catch (error) {
        // Audit failed request
        if (config.auditAction && config.auditResource) {
          this.auditRequest(req, config, { 
          ip: req.socket.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown'
        }, false, error);
        }

        // Handle security error
        this.handleSecurityError(error, res);
      }
    };
  }

  /**
   * Authentication middleware
   */
  async authenticateRequest(req: MiddlewareRequest, clientInfo: { ip: string; userAgent: string }): Promise<AuthRequest> {
    try {
      const token = this.extractAuthToken(req);
      if (!token) {
        throw new Error('Authentication token required');
      }

      return await this.authManager.validateToken(token, clientInfo.ip, clientInfo.userAgent);

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'SecurityMiddleware.authenticateRequest',
        data: { ip: clientInfo.ip, userAgent: clientInfo.userAgent }
      });
      throw error;
    }
  }

  /**
   * Permission checking middleware
   */
  async checkPermissions(authRequest: AuthRequest, permissions: Permission[]): Promise<void> {
    try {
      for (const permission of permissions) {
        const hasPermission = await this.authManager.checkPermission(authRequest, permission);
        if (!hasPermission) {
          throw new Error(`Permission denied: ${permission.resource}:${permission.action}`);
        }
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'SecurityMiddleware.checkPermissions',
        data: { userId: authRequest.userId, permissions }
      });
      throw error;
    }
  }

  /**
   * Input validation middleware
   */
  async validateInput(req: MiddlewareRequest, schema: ValidationSchema): Promise<any> {
    try {
      // Combine query params and body
      const inputData = {
        ...req.query,
        ...req.body
      };

      const result = this.validator.validate(inputData, schema);
      
      if (!result.isValid) {
        throw new Error(`Validation failed: ${result.errors.join(', ')}`);
      }

      return result.sanitizedData;

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'SecurityMiddleware.validateInput',
        data: { schema: Object.keys(schema) }
      });
      throw error;
    }
  }

  /**
   * Rate limiting middleware
   */
  createRateLimitMiddleware(rateLimitKey: string, maxRequests: number, windowMs: number) {
    return async (req: MiddlewareRequest, res: ServerResponse, next: () => void) => {
      try {
        const key = this.generateRateLimitKey(req, rateLimitKey);
        const isValid = this.validator.validateInputFrequency(key, maxRequests, windowMs);
        
        if (!isValid) {
          throw new Error('Rate limit exceeded');
        }

        next();

      } catch (error) {
        this.handleSecurityError(error, res);
      }
    };
  }

  /**
   * CORS middleware
   */
  createCorsMiddleware(allowedOrigins: string[] = ['*']) {
    return (req: MiddlewareRequest, res: ServerResponse, next: () => void) => {
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
      }
      
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      next();
    };
  }

  /**
   * Request logging middleware
   */
  createLoggingMiddleware() {
    return (req: MiddlewareRequest, res: ServerResponse, next: () => void) => {
      const startTime = Date.now();
      const clientInfo = this.extractClientInfo(req);

      // Log request start
      this.logger.info('Request started', {
        method: req.method,
        url: req.url,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        requestId: req.securityContext?.requestId
      });

      // Override res.end to log response
      const originalEnd = res.end.bind(res);
      const logger = this.logger;
      res.end = function(this: ServerResponse, chunk?: any, encoding?: any): ServerResponse {
        const duration = Date.now() - startTime;
        
        logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          requestId: req.securityContext?.requestId
        });

        return originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  /**
   * Security headers middleware
   */
  createSecurityHeadersMiddleware() {
    return (req: MiddlewareRequest, res: ServerResponse, next: () => void) => {
      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      next();
    };
  }

  /**
   * Extracts client information from request
   */
  private extractClientInfo(req: MiddlewareRequest): { ip: string; userAgent: string } {
    const ip = req.headers['x-forwarded-for'] as string || 
               req.headers['x-real-ip'] as string || 
               req.socket.remoteAddress || 
               'unknown';
    
    const userAgent = req.headers['user-agent'] as string || 'unknown';

    return { ip, userAgent };
  }

  /**
   * Extracts authentication token from request
   */
  private extractAuthToken(req: MiddlewareRequest): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    if (req.query?.token) {
      return req.query.token as string;
    }

    // Check cookie
    const cookies = req.headers.cookie;
    if (cookies) {
      const tokenMatch = cookies.match(/token=([^;]+)/);
      if (tokenMatch) {
        return tokenMatch[1];
      }
    }

    return null;
  }

  /**
   * Validates request size
   */
  private async validateRequestSize(req: MiddlewareRequest, maxSize: number): Promise<void> {
    // This would check content-length header and body size
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      throw new Error(`Request too large: ${contentLength} bytes exceeds limit of ${maxSize} bytes`);
    }
  }

  /**
   * Generates rate limit key
   */
  private generateRateLimitKey(req: MiddlewareRequest, rateLimitKey: string): string {
    const clientInfo = this.extractClientInfo(req);
    const userId = req.securityContext?.authRequest?.userId || 'anonymous';
    
    return `${rateLimitKey}:${userId}:${clientInfo.ip}`;
  }

  /**
   * Audits the request
   */
  private auditRequest(
    req: MiddlewareRequest, 
    config: SecurityConfig, 
    clientInfo: { ip: string; userAgent: string },
    success: boolean,
    error?: any
  ): void {
    try {
      const userId = req.securityContext?.authRequest?.userId;
      const details = {
        method: req.method,
        url: req.url,
        validatedData: req.securityContext?.validatedData,
        requestId: req.securityContext?.requestId
      };

      if (config.auditAction && config.auditResource) {
        this.auditLogger.logEvent({
          userId,
          action: config.auditAction,
          resource: config.auditResource,
          details,
          ipAddress: clientInfo.ip,
          userAgent: clientInfo.userAgent,
          success,
          errorCode: error?.code,
          errorMessage: error?.message,
          severity: success ? 'low' : 'medium',
          category: this.getAuditCategory(config.auditResource)
        });
      }
    } catch (auditError) {
      this.logger.error('Failed to audit request', { error: (auditError as Error).message });
    }
  }

  /**
   * Handles security errors
   */
  private handleSecurityError(error: any, res: ServerResponse): void {
    const statusCode = this.getSecurityErrorStatusCode(error);
    const message = this.getSecurityErrorMessage(error);

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: message,
      code: error.code || 'SECURITY_ERROR',
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Gets HTTP status code for security errors
   */
  private getSecurityErrorStatusCode(error: any): number {
    if (error.message?.includes('token')) {
      return 401; // Unauthorized
    }
    if (error.message?.includes('permission')) {
      return 403; // Forbidden
    }
    if (error.message?.includes('validation')) {
      return 400; // Bad Request
    }
    if (error.message?.includes('rate limit')) {
      return 429; // Too Many Requests
    }
    return 500; // Internal Server Error
  }

  /**
   * Gets user-friendly security error message
   */
  private getSecurityErrorMessage(error: any): string {
    if (error.message?.includes('token')) {
      return 'Authentication required';
    }
    if (error.message?.includes('permission')) {
      return 'Access denied';
    }
    if (error.message?.includes('validation')) {
      return 'Invalid request data';
    }
    if (error.message?.includes('rate limit')) {
      return 'Too many requests';
    }
    return 'Security error occurred';
  }

  /**
   * Gets audit category based on resource
   */
  private getAuditCategory(resource: string): AuditEvent['category'] {
    if (resource.includes('wallet') || resource.includes('transfer') || resource.includes('note')) {
      return 'financial';
    }
    if (resource.includes('auth') || resource.includes('login')) {
      return 'authentication';
    }
    if (resource.includes('key') || resource.includes('security')) {
      return 'security';
    }
    if (resource.includes('data') || resource.includes('export') || resource.includes('import')) {
      return 'data';
    }
    return 'system';
  }

  /**
   * Generates a unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Predefined security configurations for common operations
export const SecurityConfigs = {
  // Wallet operations
  walletRead: {
    requireAuth: true,
    permissions: [Permissions.WALLET_READ],
    validationSchema: ValidationSchemas.createWallet,
    auditAction: 'wallet_read',
    auditResource: 'wallet'
  },

  walletCreate: {
    requireAuth: true,
    permissions: [Permissions.WALLET_CREATE],
    validationSchema: ValidationSchemas.createWallet,
    auditAction: 'wallet_created',
    auditResource: 'wallet'
  },

  // Transfer operations
  transferCreate: {
    requireAuth: true,
    permissions: [Permissions.TRANSFER_CREATE],
    validationSchema: ValidationSchemas.transfer,
    auditAction: 'transfer_created',
    auditResource: 'transfer',
    rateLimitKey: 'transfer_create'
  },

  transferRead: {
    requireAuth: true,
    permissions: [Permissions.TRANSFER_READ],
    validationSchema: ValidationSchemas.transfer,
    auditAction: 'transfer_read',
    auditResource: 'transfer'
  },

  // Note operations
  noteCreate: {
    requireAuth: true,
    permissions: [Permissions.NOTE_CREATE],
    validationSchema: ValidationSchemas.createNote,
    auditAction: 'note_created',
    auditResource: 'note'
  },

  // Admin operations
  adminRead: {
    requireAuth: true,
    permissions: [Permissions.ADMIN_READ],
    auditAction: 'admin_read',
    auditResource: 'admin'
  },

  adminWrite: {
    requireAuth: true,
    permissions: [Permissions.ADMIN_WRITE],
    auditAction: 'admin_write',
    auditResource: 'admin'
  }
}; 