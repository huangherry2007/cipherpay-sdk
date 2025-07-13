import { RelayerAPI, RelayerConfig, RelayerRequest, RelayerResponse, RelayerStatus } from './RelayerAPI';
import { ChainType } from '../core/WalletProvider';

export interface AuthConfig {
  email: string;
  password: string;
  apiKey?: string;
}

export interface RelayerClientConfig extends RelayerConfig {
  enableRetry?: boolean;
  retryDelay?: number;
  maxRetries?: number;
  timeout?: number;
}

export class RelayerClient implements RelayerAPI {
  private readonly endpoint: string;
  private readonly config: RelayerClientConfig;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly retryDelay: number;

  constructor(config: RelayerClientConfig) {
    this.config = config;
    this.endpoint = config.endpoint;
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 30000;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Gets request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json'
    };
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (error instanceof Error && error.message.includes('Authentication failed')) {
          throw error;
        }

        if (i < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, i)));
        }
      }
    }

    throw lastError;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async submitTransaction(request: RelayerRequest): Promise<RelayerResponse> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/v1/submit-transaction`, {
        method: 'POST',
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Transaction submission failed: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      return response.json();
    });
  }

  async getTransactionStatus(txHash: string): Promise<RelayerResponse> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/v1/transaction-status/${txHash}`);

      if (!response.ok) {
        throw new Error(`Failed to get transaction status: ${response.status}`);
      }

      return response.json();
    });
  }

  async getStatus(): Promise<RelayerStatus> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/health`);

      if (!response.ok) {
        throw new Error(`Failed to get relayer status: ${response.status}`);
      }

      return response.json();
    });
  }

  async estimateGas(request: RelayerRequest): Promise<{
    gasLimit: string;
    maxFeePerGas: string;
    priorityFee: string;
  }> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/v1/estimate-fees`, {
        method: 'POST',
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Failed to estimate gas: ${response.status}`);
      }

      const data = await response.json();
      return {
        gasLimit: data.estimatedFees?.estimatedGas || '0',
        maxFeePerGas: data.estimatedFees?.gasPrice || '0',
        priorityFee: data.estimatedFees?.priorityFee || '0'
      };
    });
  }

  /**
   * Wait for a transaction to be confirmed
   */
  async waitForConfirmation(txHash: string, maxAttempts = 30): Promise<RelayerResponse> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getTransactionStatus(txHash);

      if (status.status === 'success') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Transaction failed: ${status.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Gets available circuits from the relayer
   */
  async getCircuits(): Promise<any> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/v1/circuits`);

      if (!response.ok) {
        throw new Error(`Failed to get circuits: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Verifies a proof using the relayer
   */
  async verifyProof(circuitType: string, proof: any): Promise<any> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/v1/verify-proof`, {
        method: 'POST',
        body: JSON.stringify({
          circuitType,
          proof
        }),
      });

      if (!response.ok) {
        throw new Error(`Proof verification failed: ${response.status}`);
      }

      return response.json();
    });
  }

  /**
   * Gets system status from the relayer
   */
  async getSystemStatus(): Promise<any> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/v1/system/status`);

      if (!response.ok) {
        throw new Error(`Failed to get system status: ${response.status}`);
      }

      return response.json();
    });
  }
}
