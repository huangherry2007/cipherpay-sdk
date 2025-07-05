import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ShieldedNote } from '../types/Note';
import { ZKProof } from '../types/ZKProof';
import { RelayerClient } from '../relayer/RelayerClient';
import { WalletProvider } from '../core/WalletProvider';
import { ZKProver } from '../zk/ZKProver';
import { ErrorHandler, ErrorType, CipherPayError } from '../errors/ErrorHandler';

export interface TransactionConfig {
  feePayer?: PublicKey;
  recentBlockhash?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export interface TransferRequest {
  fromNotes: ShieldedNote[];
  toAddress: string;
  amount: bigint;
  fee?: bigint;
  metadata?: Record<string, any>;
}

export interface WithdrawRequest {
  fromNotes: ShieldedNote[];
  toAddress: string;
  amount: bigint;
  fee?: bigint;
  metadata?: Record<string, any>;
}

export interface ReshieldRequest {
  fromNotes: ShieldedNote[];
  amount: bigint;
  fee?: bigint;
  metadata?: Record<string, any>;
}

export interface TransactionResult {
  signature: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
  blockTime?: number;
  slot?: number;
}

export class TransactionBuilder {
  private relayerClient: RelayerClient;
  private walletProvider: WalletProvider;
  private zkProver: ZKProver;
  private config: TransactionConfig;

  constructor(
    relayerClient: RelayerClient,
    walletProvider: WalletProvider,
    zkProver: ZKProver,
    config: TransactionConfig = {}
  ) {
    this.relayerClient = relayerClient;
    this.walletProvider = walletProvider;
    this.zkProver = zkProver;
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
  }

  /**
   * Builds and submits a transfer transaction
   */
  async buildTransferTransaction(request: TransferRequest): Promise<TransactionResult> {
    try {
      // Validate request
      this.validateTransferRequest(request);

      // Generate ZK proof
      const proof = await this.zkProver.generateTransferProof({
        inputNotes: request.fromNotes,
        outputNote: {
          commitment: await this.generateCommitment(request.amount, request.toAddress),
          nullifier: await this.generateNullifier(request.amount, request.toAddress),
          amount: request.amount,
          encryptedNote: '',
          spent: false,
          timestamp: Date.now(),
          recipientAddress: request.toAddress
        },
        viewKey: await this.getViewKey()
      });

      // Estimate fees
      const feeEstimate = await this.estimateTransactionFees(request);

      // Build transaction
      const transaction = await this.buildTransaction({
        type: 'transfer',
        proof,
        fromNotes: request.fromNotes,
        toAddress: request.toAddress,
        amount: request.amount,
        fee: request.fee || BigInt(feeEstimate.totalFee),
        metadata: request.metadata
      });

      // Submit transaction
      const result = await this.submitTransaction(transaction);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Transfer transaction failed: ${errorMessage}`,
        ErrorType.TRANSACTION_FAILED,
        { 
          transactionType: 'transfer',
          fromNotes: request.fromNotes.length,
          toAddress: request.toAddress,
          amount: request.amount.toString()
        },
        {
          action: 'Check inputs and retry',
          description: 'Transfer transaction failed. Please verify inputs and try again.'
        },
        true
      );
      
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Builds and submits a withdraw transaction
   */
  async buildWithdrawTransaction(request: WithdrawRequest): Promise<TransactionResult> {
    try {
      // Validate request
      this.validateWithdrawRequest(request);

      // Generate ZK proof
      const proof = await this.zkProver.generateWithdrawProof({
        inputNotes: request.fromNotes,
        amount: request.amount,
        recipientAddress: request.toAddress,
        viewKey: await this.getViewKey()
      });

      // Estimate fees
      const feeEstimate = await this.estimateTransactionFees(request);

      // Build transaction
      const transaction = await this.buildTransaction({
        type: 'withdraw',
        proof,
        fromNotes: request.fromNotes,
        toAddress: request.toAddress,
        amount: request.amount,
        fee: request.fee || BigInt(feeEstimate.totalFee),
        metadata: request.metadata
      });

      // Submit transaction
      const result = await this.submitTransaction(transaction);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Withdraw transaction failed: ${errorMessage}`,
        ErrorType.TRANSACTION_FAILED,
        { 
          transactionType: 'withdraw',
          fromNotes: request.fromNotes.length,
          toAddress: request.toAddress,
          amount: request.amount.toString()
        },
        {
          action: 'Check inputs and retry',
          description: 'Withdraw transaction failed. Please verify inputs and try again.'
        },
        true
      );
      
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Builds and submits a reshield transaction
   */
  async buildReshieldTransaction(request: ReshieldRequest): Promise<TransactionResult> {
    try {
      // Validate request
      this.validateReshieldRequest(request);

      // Generate ZK proof
      const proof = await this.zkProver.generateReshieldProof({
        inputNotes: request.fromNotes,
        amount: request.amount,
        viewKey: await this.getViewKey()
      });

      // Estimate fees
      const feeEstimate = await this.estimateTransactionFees(request);

      // Build transaction
      const transaction = await this.buildTransaction({
        type: 'reshield',
        proof,
        fromNotes: request.fromNotes,
        amount: request.amount,
        fee: request.fee || BigInt(feeEstimate.totalFee),
        metadata: request.metadata
      });

      // Submit transaction
      const result = await this.submitTransaction(transaction);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Reshield transaction failed: ${errorMessage}`,
        ErrorType.TRANSACTION_FAILED,
        { 
          transactionType: 'reshield',
          fromNotes: request.fromNotes.length,
          amount: request.amount.toString()
        },
        {
          action: 'Check inputs and retry',
          description: 'Reshield transaction failed. Please verify inputs and try again.'
        },
        true
      );
      
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Estimates transaction fees
   */
  async estimateTransactionFees(request: TransferRequest | WithdrawRequest | ReshieldRequest): Promise<{
    gasLimit: string;
    maxFeePerGas: string;
    priorityFee: string;
    totalFee: number;
  }> {
    try {
      // Create a mock transaction for fee estimation
      const mockTransaction = await this.buildMockTransaction(request);
      
      const feeEstimate = await this.relayerClient.estimateGas({
        type: 'shielded_transfer',
        chainType: 'solana',
        data: {
          proof: 'mock_proof',
          publicInputs: ['mock_input'],
          amount: request.amount.toString()
        }
      });

      const totalFee = parseFloat(feeEstimate.maxFeePerGas) * parseFloat(feeEstimate.gasLimit);

      return {
        ...feeEstimate,
        totalFee
      };
    } catch (error) {
      // Fallback to default fees
      return {
        gasLimit: '200000',
        maxFeePerGas: '0.000005',
        priorityFee: '0.000001',
        totalFee: 0.001
      };
    }
  }

  /**
   * Validates transfer request
   */
  private validateTransferRequest(request: TransferRequest): void {
    if (!request.fromNotes || request.fromNotes.length === 0) {
      throw new CipherPayError(
        'At least one input note is required',
        ErrorType.INVALID_INPUT,
        { field: 'fromNotes', count: request.fromNotes?.length || 0 },
        {
          action: 'Provide input notes',
          description: 'Transfer requires at least one input note to spend from.'
        },
        false
      );
    }

    if (!request.toAddress) {
      throw new CipherPayError(
        'Recipient address is required',
        ErrorType.INVALID_ADDRESS,
        { field: 'toAddress' },
        {
          action: 'Provide recipient address',
          description: 'Transfer requires a valid recipient address.'
        },
        false
      );
    }

    if (request.amount <= 0n) {
      throw new CipherPayError(
        'Amount must be greater than 0',
        ErrorType.INVALID_AMOUNT,
        { amount: request.amount.toString() },
        {
          action: 'Provide valid amount',
          description: 'Transfer amount must be greater than zero.'
        },
        false
      );
    }

    // Check if we have sufficient funds
    const totalInputAmount = request.fromNotes.reduce((sum, note) => sum + note.amount, 0n);
    if (totalInputAmount < request.amount) {
      throw new CipherPayError(
        'Insufficient funds in input notes',
        ErrorType.INSUFFICIENT_FUNDS,
        { 
          required: request.amount.toString(),
          available: totalInputAmount.toString(),
          inputNotes: request.fromNotes.length
        },
        {
          action: 'Add more input notes',
          description: 'Insufficient funds in selected input notes. Please add more notes or reduce the transfer amount.'
        },
        false
      );
    }

    // Check if any notes are already spent
    for (const note of request.fromNotes) {
      if (note.spent) {
        throw new CipherPayError(
          `Note ${note.commitment} is already spent`,
          ErrorType.NOTE_ALREADY_SPENT,
          { noteCommitment: note.commitment },
          {
            action: 'Select different notes',
            description: 'One or more input notes have already been spent. Please select different notes.'
          },
          false
        );
      }
    }
  }

  /**
   * Validates withdraw request
   */
  private validateWithdrawRequest(request: WithdrawRequest): void {
    if (!request.fromNotes || request.fromNotes.length === 0) {
      throw new CipherPayError(
        'At least one input note is required',
        ErrorType.INVALID_INPUT,
        { field: 'fromNotes', count: request.fromNotes?.length || 0 },
        {
          action: 'Provide input notes',
          description: 'Withdraw requires at least one input note to spend from.'
        },
        false
      );
    }

    if (!request.toAddress) {
      throw new CipherPayError(
        'Recipient address is required',
        ErrorType.INVALID_ADDRESS,
        { field: 'toAddress' },
        {
          action: 'Provide recipient address',
          description: 'Withdraw requires a valid recipient address.'
        },
        false
      );
    }

    if (request.amount <= 0n) {
      throw new CipherPayError(
        'Amount must be greater than 0',
        ErrorType.INVALID_AMOUNT,
        { amount: request.amount.toString() },
        {
          action: 'Provide valid amount',
          description: 'Withdraw amount must be greater than zero.'
        },
        false
      );
    }

    // Check if we have sufficient funds
    const totalInputAmount = request.fromNotes.reduce((sum, note) => sum + note.amount, 0n);
    if (totalInputAmount < request.amount) {
      throw new CipherPayError(
        'Insufficient funds in input notes',
        ErrorType.INSUFFICIENT_FUNDS,
        { 
          required: request.amount.toString(),
          available: totalInputAmount.toString(),
          inputNotes: request.fromNotes.length
        },
        {
          action: 'Add more input notes',
          description: 'Insufficient funds in selected input notes. Please add more notes or reduce the withdraw amount.'
        },
        false
      );
    }
  }

  /**
   * Validates reshield request
   */
  private validateReshieldRequest(request: ReshieldRequest): void {
    if (!request.fromNotes || request.fromNotes.length === 0) {
      throw new CipherPayError(
        'At least one input note is required',
        ErrorType.INVALID_INPUT,
        { field: 'fromNotes', count: request.fromNotes?.length || 0 },
        {
          action: 'Provide input notes',
          description: 'Reshield requires at least one input note to spend from.'
        },
        false
      );
    }

    if (request.amount <= 0n) {
      throw new CipherPayError(
        'Amount must be greater than 0',
        ErrorType.INVALID_AMOUNT,
        { amount: request.amount.toString() },
        {
          action: 'Provide valid amount',
          description: 'Reshield amount must be greater than zero.'
        },
        false
      );
    }

    // Check if we have sufficient funds
    const totalInputAmount = request.fromNotes.reduce((sum, note) => sum + note.amount, 0n);
    if (totalInputAmount < request.amount) {
      throw new CipherPayError(
        'Insufficient funds in input notes',
        ErrorType.INSUFFICIENT_FUNDS,
        { 
          required: request.amount.toString(),
          available: totalInputAmount.toString(),
          inputNotes: request.fromNotes.length
        },
        {
          action: 'Add more input notes',
          description: 'Insufficient funds in selected input notes. Please add more notes or reduce the reshield amount.'
        },
        false
      );
    }
  }

  /**
   * Builds a transaction
   */
  private async buildTransaction(params: {
    type: 'transfer' | 'withdraw' | 'reshield';
    proof: ZKProof;
    fromNotes: ShieldedNote[];
    toAddress?: string;
    amount: bigint;
    fee: bigint;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const { type, proof, fromNotes, toAddress, amount, fee, metadata } = params;

    // Get recent blockhash
    const recentBlockhash = await this.getRecentBlockhash();

    // Create transaction data
    const transactionData = {
      type,
      proof,
      inputNotes: fromNotes,
      outputNote: toAddress ? {
        amount,
        recipientAddress: toAddress,
        commitment: await this.generateCommitment(amount, toAddress),
        nullifier: await this.generateNullifier(amount, toAddress)
      } : undefined,
      fee,
      metadata: metadata || {},
      recentBlockhash,
      feePayer: this.config.feePayer || this.walletProvider.getPublicKey()
    };

    return transactionData;
  }

  /**
   * Builds a mock transaction for fee estimation
   */
  private async buildMockTransaction(request: TransferRequest | WithdrawRequest | ReshieldRequest): Promise<any> {
    // Create a minimal transaction structure for fee estimation
    return {
      type: 'transfer' in request ? 'transfer' : 'withdraw' in request ? 'withdraw' : 'reshield',
      inputNotes: request.fromNotes,
      amount: request.amount,
      toAddress: 'toAddress' in request ? request.toAddress : undefined
    };
  }

  /**
   * Submits a transaction with retry logic
   */
  private async submitTransaction(transaction: any): Promise<TransactionResult> {
    let lastError: Error | undefined;

    for (let i = 0; i < this.config.maxRetries!; i++) {
      try {
        const response = await this.relayerClient.submitTransaction({
          type: 'shielded_transfer',
          chainType: 'solana',
          data: {
            proof: JSON.stringify(transaction.proof),
            publicInputs: transaction.proof.publicSignals || [],
            amount: transaction.amount.toString(),
            recipientAddress: transaction.toAddress
          }
        });

        if (response.success) {
          return {
            signature: response.txHash || '',
            status: 'pending',
            blockTime: response.receipt?.blockNumber,
            slot: response.receipt?.blockNumber
          };
        } else {
          throw new Error(response.error || 'Transaction submission failed');
        }
      } catch (error) {
        lastError = error as Error;
        
        if (i < this.config.maxRetries! - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay! * Math.pow(2, i)));
        }
      }
    }

    throw lastError || new Error('Transaction submission failed after retries');
  }

  /**
   * Gets recent blockhash
   */
  private async getRecentBlockhash(): Promise<string> {
    try {
      const connection = this.walletProvider['connection'];
      const { blockhash } = await connection.getLatestBlockhash();
      return blockhash;
    } catch (error) {
      throw new Error('Failed to get recent blockhash');
    }
  }

  /**
   * Gets view key for ZK proof generation
   */
  private async getViewKey(): Promise<string> {
    // In a real implementation, this would derive the view key from the wallet
    // For now, return a mock view key
    return 'mock_view_key_' + Date.now();
  }

  /**
   * Generates commitment for a note
   */
  private async generateCommitment(amount: bigint, recipientAddress: string): Promise<string> {
    // In a real implementation, this would use proper commitment generation
    const data = `${amount}_${recipientAddress}_${Date.now()}`;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Generates nullifier for a note
   */
  private async generateNullifier(amount: bigint, recipientAddress: string): Promise<string> {
    // In a real implementation, this would use proper nullifier generation
    const data = `${amount}_${recipientAddress}_${Date.now()}_nullifier`;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Waits for transaction confirmation
   */
  async waitForConfirmation(signature: string, maxAttempts: number = 30): Promise<TransactionResult> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.relayerClient.getTransactionStatus(signature);
        
        if (status.status === 'success') {
          return {
            signature,
            status: 'confirmed',
            blockTime: status.receipt?.blockNumber,
            slot: status.receipt?.blockNumber
          };
        }
        
        if (status.status === 'failed') {
          return {
            signature,
            status: 'failed',
            error: status.error
          };
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        // Continue waiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Transaction confirmation timeout');
  }
}
