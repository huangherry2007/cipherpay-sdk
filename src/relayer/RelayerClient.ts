import { RelayerAPI, RelayerConfig, RelayerRequest, RelayerResponse, RelayerStatus } from './RelayerAPI';
import { ChainType } from '../core/WalletProvider';

export class RelayerClient implements RelayerAPI {
  private readonly endpoint: string;
  private readonly config: RelayerConfig;
  private readonly maxRetries: number;
  private readonly timeout: number;

  constructor(config: RelayerConfig) {
    this.config = config;
    this.endpoint = config.endpoint;
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 30000;
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
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
          'Content-Type': 'application/json',
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
      const response = await this.fetchWithTimeout(`${this.endpoint}/submit`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    });
  }

  async getTransactionStatus(txHash: string): Promise<RelayerResponse> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/status/${txHash}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    });
  }

  async getStatus(): Promise<RelayerStatus> {
    return this.retry(async () => {
      const response = await this.fetchWithTimeout(`${this.endpoint}/status`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
      const response = await this.fetchWithTimeout(`${this.endpoint}/estimate-gas`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
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
}
