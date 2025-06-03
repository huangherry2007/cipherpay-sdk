import { ChainType } from '../core/WalletProvider';

export interface TransactionMetadata {
  gasLimit?: string;
  maxFeePerGas?: string;
  priorityFee?: string;
  timestamp?: number;
  nonce?: number;
}

export interface BaseTransaction {
  proof: string;
  publicInputs: string[];
  chainType: ChainType;
  metadata?: TransactionMetadata;
}

export interface ShieldedTransferTx extends BaseTransaction {
  type: 'shielded_transfer';
  encryptedNote: string;
  recipientAddress: string;
  amount: string;
}

export interface WithdrawTx extends BaseTransaction {
  type: 'withdrawal';
  recipientAddress: string;
  amount: string;
}

export interface DepositTx extends BaseTransaction {
  type: 'deposit';
  amount: string;
  senderAddress: string;
}

export interface ReshieldTx extends BaseTransaction {
  type: 'reshield';
  amount: string;
}

export type CipherTransaction = 
  | ShieldedTransferTx 
  | WithdrawTx 
  | DepositTx 
  | ReshieldTx;

export interface TransactionReceipt {
  txHash: string;
  chainType: ChainType;
  status: 'success' | 'failed' | 'pending';
  blockNumber?: number;
  gasUsed?: string;
  effectiveGasPrice?: string;
  timestamp?: number;
}
