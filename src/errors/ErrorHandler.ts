import { ethers } from 'ethers';
import { Connection } from '@solana/web3.js';
import { ChainType } from '../core/WalletProvider';

export enum ErrorType {
  // Network and connectivity errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_CONNECTION_FAILED = 'RPC_CONNECTION_FAILED',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Cryptographic and proof errors
  PROOF_GENERATION_FAILED = 'PROOF_GENERATION_FAILED',
  PROOF_VERIFICATION_FAILED = 'PROOF_VERIFICATION_FAILED',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  DECRYPTION_ERROR = 'DECRYPTION_ERROR',
  
  // Wallet and key management errors
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_PRIVATE_KEY = 'INVALID_PRIVATE_KEY',
  HARDWARE_WALLET_ERROR = 'HARDWARE_WALLET_ERROR',
  
  // Note and transaction errors
  NOTE_NOT_FOUND = 'NOTE_NOT_FOUND',
  NOTE_ALREADY_SPENT = 'NOTE_ALREADY_SPENT',
  INVALID_NOTE_FORMAT = 'INVALID_NOTE_FORMAT',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  
  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  
  // Configuration errors
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  MISSING_DEPENDENCY = 'MISSING_DEPENDENCY',
  
  // Rate limiting and quota errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Compliance and audit errors
  COMPLIANCE_VIOLATION = 'COMPLIANCE_VIOLATION',
  AUDIT_FAILED = 'AUDIT_FAILED',
  
  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ErrorContext {
  operation?: string;
  userId?: string;
  transactionId?: string;
  noteId?: string;
  amount?: string;
  recipientAddress?: string;
  timestamp?: number;
  retryCount?: number;
  [key: string]: any;
}

export interface ErrorRecovery {
  action: string;
  description: string;
  code?: string;
  url?: string;
}

export class CipherPayError extends Error {
  public readonly code: string;
  public readonly type: ErrorType;
  public readonly context: ErrorContext;
  public readonly recovery: ErrorRecovery | null;
  public readonly retryable: boolean;
  public readonly timestamp: number;
  public readonly correlationId: string;

  constructor(
    message: string,
    type: ErrorType,
    context: ErrorContext = {},
    recovery: ErrorRecovery | null = null,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'CipherPayError';
    this.code = type;
    this.type = type;
    this.context = context;
    this.recovery = recovery;
    this.retryable = retryable;
    this.timestamp = Date.now();
    this.correlationId = this.generateCorrelationId();
    
    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CipherPayError);
    }
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      type: this.type,
      context: this.context,
      recovery: this.recovery,
      retryable: this.retryable,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      stack: this.stack
    };
  }

  public static isCipherPayError(error: any): error is CipherPayError {
    return error instanceof CipherPayError;
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorListeners: Array<(error: CipherPayError) => void> = [];
  private errorCounts: Map<ErrorType, number> = new Map();
  private readonly maxErrorCount = 1000;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  public handleError(error: Error | CipherPayError, context: ErrorContext = {}): CipherPayError {
    let cipherPayError: CipherPayError;

    if (CipherPayError.isCipherPayError(error)) {
      // Create new error with merged context
      cipherPayError = new CipherPayError(
        error.message,
        error.type,
        { ...error.context, ...context },
        error.recovery,
        error.retryable
      );
    } else {
      // Convert generic error to CipherPayError
      cipherPayError = new CipherPayError(
        error.message,
        ErrorType.UNKNOWN_ERROR,
        { ...context, originalError: error.name },
        {
          action: 'Check logs for details',
          description: 'An unexpected error occurred. Please check the logs for more information.'
        },
        false
      );
    }

    // Track error count
    this.incrementErrorCount(cipherPayError.type);

    // Notify listeners
    this.notifyListeners(cipherPayError);

    // Log error
    this.logError(cipherPayError);

    return cipherPayError;
  }

  public addErrorListener(listener: (error: CipherPayError) => void): void {
    this.errorListeners.push(listener);
  }

  public removeErrorListener(listener: (error: CipherPayError) => void): void {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  public getErrorStats(): { [key in ErrorType]?: number } {
    const stats: { [key in ErrorType]?: number } = {};
    for (const [type, count] of this.errorCounts.entries()) {
      stats[type] = count;
    }
    return stats;
  }

  public resetErrorCounts(): void {
    this.errorCounts.clear();
  }

  private incrementErrorCount(type: ErrorType): void {
    const currentCount = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, currentCount + 1);
  }

  private notifyListeners(error: CipherPayError): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError);
      }
    }
  }

  private logError(error: CipherPayError): void {
    const logData = {
      level: 'error',
      timestamp: new Date(error.timestamp).toISOString(),
      correlationId: error.correlationId,
      error: error.toJSON()
    };

    console.error('CipherPay Error:', JSON.stringify(logData, null, 2));
  }

  // Factory methods for common errors
  public static createNetworkError(message: string, context: ErrorContext = {}): CipherPayError {
    return new CipherPayError(
      message,
      ErrorType.NETWORK_ERROR,
      context,
      {
        action: 'Retry the operation',
        description: 'Network connectivity issue. Please check your internet connection and try again.'
      },
      true
    );
  }

  public static createProofGenerationError(message: string, context: ErrorContext = {}): CipherPayError {
    return new CipherPayError(
      message,
      ErrorType.PROOF_GENERATION_FAILED,
      context,
      {
        action: 'Check input parameters and retry',
        description: 'Failed to generate zero-knowledge proof. Please verify your input parameters.'
      },
      true
    );
  }

  public static createInsufficientFundsError(required: string, available: string, context: ErrorContext = {}): CipherPayError {
    return new CipherPayError(
      `Insufficient funds. Required: ${required}, Available: ${available}`,
      ErrorType.INSUFFICIENT_FUNDS,
      { ...context, required, available },
      {
        action: 'Add more funds to your wallet',
        description: 'Your wallet does not have sufficient funds for this transaction.'
      },
      false
    );
  }

  public static createValidationError(message: string, field: string, context: ErrorContext = {}): CipherPayError {
    return new CipherPayError(
      message,
      ErrorType.INVALID_INPUT,
      { ...context, field },
      {
        action: 'Correct the input and retry',
        description: `Invalid input for field: ${field}. Please check the format and try again.`
      },
      false
    );
  }

  public static createRateLimitError(limit: number, window: number, context: ErrorContext = {}): CipherPayError {
    return new CipherPayError(
      `Rate limit exceeded. Limit: ${limit} requests per ${window}ms`,
      ErrorType.RATE_LIMIT_EXCEEDED,
      { ...context, limit, window },
      {
        action: 'Wait and retry later',
        description: 'You have exceeded the rate limit. Please wait before making more requests.'
      },
      true
    );
  }
} 