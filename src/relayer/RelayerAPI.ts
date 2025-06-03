import { ChainType } from '../core/WalletProvider';

export interface RelayerConfig {
  endpoint: string;
  chainType: ChainType;
  maxRetries?: number;
  timeout?: number;
}

export interface RelayerRequest {
  type: 'shielded_transfer' | 'withdrawal' | 'deposit' | 'reshield';
  chainType: ChainType;
  data: {
    proof: string;
    publicInputs: string[];
    encryptedNote?: string;
    recipientAddress?: string;
    amount?: string;
  };
  metadata?: {
    gasLimit?: string;
    maxFeePerGas?: string;
    priorityFee?: string;
  };
}

export interface RelayerResponse {
  success: boolean;
  txHash?: string;
  error?: string;
  status: 'pending' | 'success' | 'failed';
  receipt?: {
    blockNumber?: number;
    gasUsed?: string;
    effectiveGasPrice?: string;
  };
}

export interface RelayerStatus {
  isActive: boolean;
  chainType: ChainType;
  supportedOperations: string[];
  minGasPrice?: string;
  maxGasPrice?: string;
  currentLoad: number;
}

export interface RelayerAPI {
  /**
   * Submit a transaction to the relayer
   */
  submitTransaction(request: RelayerRequest): Promise<RelayerResponse>;

  /**
   * Check the status of a submitted transaction
   */
  getTransactionStatus(txHash: string): Promise<RelayerResponse>;

  /**
   * Get the current status of the relayer
   */
  getStatus(): Promise<RelayerStatus>;

  /**
   * Estimate gas for a transaction
   */
  estimateGas(request: RelayerRequest): Promise<{
    gasLimit: string;
    maxFeePerGas: string;
    priorityFee: string;
  }>;
}
