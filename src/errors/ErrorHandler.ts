import { ethers } from 'ethers';
import { Connection } from '@solana/web3.js';
import { ChainType } from '../core/WalletProvider';

export enum ErrorType {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Transaction errors
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  GAS_ERROR = 'GAS_ERROR',
  NONCE_ERROR = 'NONCE_ERROR',

  // ZKP errors
  PROOF_GENERATION_ERROR = 'PROOF_GENERATION_ERROR',
  PROOF_VERIFICATION_ERROR = 'PROOF_VERIFICATION_ERROR',

  // Note management errors
  NOTE_DECRYPTION_ERROR = 'NOTE_DECRYPTION_ERROR',
  NOTE_ENCRYPTION_ERROR = 'NOTE_ENCRYPTION_ERROR',
  INVALID_NOTE = 'INVALID_NOTE',

  // Event monitoring errors
  EVENT_MONITORING_ERROR = 'EVENT_MONITORING_ERROR',
  EVENT_PROCESSING_ERROR = 'EVENT_PROCESSING_ERROR',

  // General errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ErrorContext {
  chainType: ChainType;
  operation: string;
  details?: Record<string, any>;
  timestamp: number;
  retryCount?: number;
}

export interface ErrorRecoveryStrategy {
  maxRetries: number;
  backoffMs: number;
  shouldRetry: (error: Error, context: ErrorContext) => boolean;
  onRetry: (error: Error, context: ErrorContext) => Promise<void>;
  onMaxRetriesExceeded: (error: Error, context: ErrorContext) => Promise<void>;
}

export class SDKError extends Error {
  constructor(
    public readonly type: ErrorType,
    public readonly context: ErrorContext,
    message: string
  ) {
    super(message);
    this.name = 'SDKError';
  }
}

export class ErrorHandler {
  private readonly strategies: Map<ErrorType, ErrorRecoveryStrategy>;
  private readonly errorLog: SDKError[] = [];
  private readonly maxLogSize: number = 1000;

  constructor() {
    this.strategies = new Map();
    this.initializeDefaultStrategies();
  }

  /**
   * Handles an error with the appropriate recovery strategy
   * @param error The error to handle
   * @param context The context of the error
   */
  async handleError(error: Error, context: ErrorContext): Promise<void> {
    const sdkError = this.normalizeError(error, context);
    this.logError(sdkError);

    const strategy = this.getStrategy(sdkError.type);
    if (!strategy) {
      console.error('No recovery strategy found for error:', sdkError);
      return;
    }

    const retryCount = (context.retryCount || 0) + 1;
    if (retryCount > strategy.maxRetries) {
      await strategy.onMaxRetriesExceeded(sdkError, { ...context, retryCount });
      return;
    }

    if (strategy.shouldRetry(sdkError, context)) {
      await this.retryWithBackoff(sdkError, { ...context, retryCount }, strategy);
    }
  }

  /**
   * Registers a custom recovery strategy for an error type
   * @param type The error type
   * @param strategy The recovery strategy
   */
  registerStrategy(type: ErrorType, strategy: ErrorRecoveryStrategy): void {
    this.strategies.set(type, strategy);
  }

  /**
   * Gets the error log
   * @returns The error log
   */
  getErrorLog(): SDKError[] {
    return [...this.errorLog];
  }

  /**
   * Clears the error log
   */
  clearErrorLog(): void {
    this.errorLog.length = 0;
  }

  private normalizeError(error: Error, context: ErrorContext): SDKError {
    if (error instanceof SDKError) {
      return error;
    }

    // Map common error types
    let type = ErrorType.UNKNOWN_ERROR;
    if (error.message.includes('network')) {
      type = ErrorType.NETWORK_ERROR;
    } else if (error.message.includes('insufficient funds')) {
      type = ErrorType.INSUFFICIENT_FUNDS;
    } else if (error.message.includes('nonce')) {
      type = ErrorType.NONCE_ERROR;
    } else if (error.message.includes('gas')) {
      type = ErrorType.GAS_ERROR;
    }

    return new SDKError(type, context, error.message);
  }

  private async retryWithBackoff(
    error: SDKError,
    context: ErrorContext,
    strategy: ErrorRecoveryStrategy
  ): Promise<void> {
    const backoffTime = strategy.backoffMs * Math.pow(2, (context.retryCount || 0) - 1);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
    await strategy.onRetry(error, context);
  }

  private getStrategy(type: ErrorType): ErrorRecoveryStrategy | undefined {
    return this.strategies.get(type);
  }

  private logError(error: SDKError): void {
    this.errorLog.push(error);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  private initializeDefaultStrategies(): void {
    // Network error strategy
    this.registerStrategy(ErrorType.NETWORK_ERROR, {
      maxRetries: 5,
      backoffMs: 1000,
      shouldRetry: (error, context) => {
        return context.retryCount! < 5;
      },
      onRetry: async (error, context) => {
        console.log(`Retrying network operation after error: ${error.message}`);
      },
      onMaxRetriesExceeded: async (error, context) => {
        console.error('Max retries exceeded for network operation:', error);
      }
    });

    // Transaction error strategy
    this.registerStrategy(ErrorType.TRANSACTION_FAILED, {
      maxRetries: 3,
      backoffMs: 2000,
      shouldRetry: (error, context) => {
        // Don't retry if it's a permanent failure
        return !error.message.includes('revert') && context.retryCount! < 3;
      },
      onRetry: async (error, context) => {
        console.log(`Retrying failed transaction: ${error.message}`);
      },
      onMaxRetriesExceeded: async (error, context) => {
        console.error('Max retries exceeded for transaction:', error);
      }
    });

    // ZKP error strategy
    this.registerStrategy(ErrorType.PROOF_GENERATION_ERROR, {
      maxRetries: 2,
      backoffMs: 3000,
      shouldRetry: (error, context) => {
        return context.retryCount! < 2;
      },
      onRetry: async (error, context) => {
        console.log(`Retrying proof generation: ${error.message}`);
      },
      onMaxRetriesExceeded: async (error, context) => {
        console.error('Max retries exceeded for proof generation:', error);
      }
    });

    // Event monitoring error strategy
    this.registerStrategy(ErrorType.EVENT_MONITORING_ERROR, {
      maxRetries: 10,
      backoffMs: 5000,
      shouldRetry: (error, context) => {
        return context.retryCount! < 10;
      },
      onRetry: async (error, context) => {
        console.log(`Retrying event monitoring: ${error.message}`);
      },
      onMaxRetriesExceeded: async (error, context) => {
        console.error('Max retries exceeded for event monitoring:', error);
      }
    });
  }
} 