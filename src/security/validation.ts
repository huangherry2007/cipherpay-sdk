import { ErrorHandler } from '../errors/ErrorHandler';
import { Logger } from '../monitoring/observability/logger';

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean;
  sanitize?: (value: any) => any;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData: any;
}

export class InputValidator {
  private static instance: InputValidator;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  private constructor() {
    this.logger = Logger.getInstance();
    this.errorHandler = ErrorHandler.getInstance();
  }

  static getInstance(): InputValidator {
    if (!InputValidator.instance) {
      InputValidator.instance = new InputValidator();
    }
    return InputValidator.instance;
  }

  /**
   * Validates and sanitizes input data against a schema
   */
  validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: string[] = [];
    const sanitizedData: any = {};

    try {
      for (const [field, rule] of Object.entries(schema)) {
        const value = data[field];
        
        // Check if required field is present
        if (rule.required && (value === undefined || value === null || value === '')) {
          errors.push(`${field} is required`);
          continue;
        }

        // Skip validation if value is not present and not required
        if (value === undefined || value === null) {
          continue;
        }

        // Type validation
        if (!this.validateType(value, rule.type)) {
          errors.push(`${field} must be of type ${rule.type}`);
          continue;
        }

        // Length validation for strings and arrays
        if (rule.type === 'string' || rule.type === 'array') {
          const length = rule.type === 'string' ? value.length : value.length;
          
          if (rule.minLength !== undefined && length < rule.minLength) {
            errors.push(`${field} must be at least ${rule.minLength} characters long`);
          }
          
          if (rule.maxLength !== undefined && length > rule.maxLength) {
            errors.push(`${field} must be no more than ${rule.maxLength} characters long`);
          }
        }

        // Numeric range validation
        if (rule.type === 'number') {
          if (rule.min !== undefined && value < rule.min) {
            errors.push(`${field} must be at least ${rule.min}`);
          }
          
          if (rule.max !== undefined && value > rule.max) {
            errors.push(`${field} must be no more than ${rule.max}`);
          }
        }

        // Pattern validation for strings
        if (rule.type === 'string' && rule.pattern && !rule.pattern.test(value)) {
          errors.push(`${field} format is invalid`);
        }

        // Enum validation
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
        }

        // Custom validation
        if (rule.custom && !rule.custom(value)) {
          errors.push(`${field} failed custom validation`);
        }

        // Sanitize value if sanitizer is provided
        let sanitizedValue = value;
        if (rule.sanitize) {
          sanitizedValue = rule.sanitize(value);
        }

        sanitizedData[field] = sanitizedValue;
      }

      return {
        isValid: errors.length === 0,
        errors,
        sanitizedData
      };

    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'InputValidator.validate',
        data: { schema: Object.keys(schema) }
      });

      return {
        isValid: false,
        errors: ['Validation failed due to internal error'],
        sanitizedData: {}
      };
    }
  }

  /**
   * Validates type of value
   */
  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Sanitizes HTML content to prevent XSS
   */
  sanitizeHtml(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validates and sanitizes email addresses
   */
  validateEmail(email: string): { isValid: boolean; sanitized: string } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const sanitized = email.trim().toLowerCase();
    
    return {
      isValid: emailRegex.test(sanitized),
      sanitized
    };
  }

  /**
   * Validates and sanitizes URLs
   */
  validateUrl(url: string): { isValid: boolean; sanitized: string } {
    try {
      const sanitized = url.trim();
      new URL(sanitized); // This will throw if invalid
      
      return {
        isValid: true,
        sanitized
      };
    } catch {
      return {
        isValid: false,
        sanitized: ''
      };
    }
  }

  /**
   * Validates cryptographic keys
   */
  validateCryptoKey(key: string, expectedLength?: number): { isValid: boolean; sanitized: string } {
    if (typeof key !== 'string') {
      return { isValid: false, sanitized: '' };
    }

    const sanitized = key.trim();
    
    // Check if it's a valid hex string
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(sanitized)) {
      return { isValid: false, sanitized: '' };
    }

    // Check length if specified
    if (expectedLength && sanitized.length !== expectedLength * 2) { // *2 because hex is 2 chars per byte
      return { isValid: false, sanitized: '' };
    }

    return { isValid: true, sanitized };
  }

  /**
   * Validates amount values for financial transactions
   */
  validateAmount(amount: string | number): { isValid: boolean; sanitized: number } {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(numAmount) || numAmount <= 0 || numAmount > Number.MAX_SAFE_INTEGER) {
      return { isValid: false, sanitized: 0 };
    }

    // Round to 8 decimal places for precision
    const sanitized = Math.round(numAmount * 100000000) / 100000000;
    
    return { isValid: true, sanitized };
  }

  /**
   * Validates wallet addresses
   */
  validateWalletAddress(address: string): { isValid: boolean; sanitized: string } {
    if (typeof address !== 'string') {
      return { isValid: false, sanitized: '' };
    }

    const sanitized = address.trim();
    
    // Basic wallet address validation (adjust based on your specific format)
    const addressRegex = /^[0-9a-fA-F]{40,64}$/;
    
    return {
      isValid: addressRegex.test(sanitized),
      sanitized
    };
  }

  /**
   * Rate limiting validation for input frequency
   */
  validateInputFrequency(key: string, maxRequests: number, windowMs: number): boolean {
    // This would integrate with the rate limiter
    // For now, return true - actual implementation would check rate limits
    return true;
  }
}

// Predefined validation schemas for common use cases
export const ValidationSchemas: Record<string, ValidationSchema> = {
  // Wallet operations
  createWallet: {
    userId: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
    walletType: { type: 'string' as const, required: true, enum: ['standard', 'multisig'] },
    metadata: { type: 'object' as const, required: false }
  },

  // Transfer operations
  transfer: {
    fromAddress: { type: 'string' as const, required: true, custom: (v: string) => v.length >= 40 },
    toAddress: { type: 'string' as const, required: true, custom: (v: string) => v.length >= 40 },
    amount: { type: 'string' as const, required: true, custom: (v: string) => !isNaN(parseFloat(v)) && parseFloat(v) > 0 },
    asset: { type: 'string' as const, required: true, enum: ['ETH', 'USDC', 'USDT'] },
    memo: { type: 'string' as const, required: false, maxLength: 1000, sanitize: (v: string) => v.trim() }
  },

  // Note operations
  createNote: {
    amount: { type: 'string' as const, required: true, custom: (v: string) => !isNaN(parseFloat(v)) && parseFloat(v) > 0 },
    recipient: { type: 'string' as const, required: true, minLength: 1, maxLength: 100 },
    memo: { type: 'string' as const, required: false, maxLength: 500, sanitize: (v: string) => v.trim() }
  },

  // API requests
  apiRequest: {
    method: { type: 'string' as const, required: true, enum: ['GET', 'POST', 'PUT', 'DELETE'] },
    path: { type: 'string' as const, required: true, minLength: 1, maxLength: 200 },
    headers: { type: 'object' as const, required: false },
    body: { type: 'object' as const, required: false }
  },

  // User operations
  userRegistration: {
    email: { type: 'string' as const, required: true, custom: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    password: { type: 'string' as const, required: true, minLength: 8, maxLength: 128 },
    username: { type: 'string' as const, required: true, minLength: 3, maxLength: 50, pattern: /^[a-zA-Z0-9_]+$/ }
  }
}; 