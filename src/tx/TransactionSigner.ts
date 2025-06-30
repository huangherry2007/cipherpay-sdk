import { ethers } from 'ethers';
import { PublicKey, Transaction } from '@solana/web3.js';
import { ChainType } from '../core/WalletProvider';
import { NoteManager } from '../core/NoteManager';
import { ViewKeyManager } from '../core/ViewKeyManager';

export interface SignedTransaction {
  signature: string;
  transactionData: any;
  chainType: ChainType;
}

export interface SignerConfig {
  chainType: ChainType;
  privateKey: string;
  rpcUrl: string;
}

export interface TransactionSignerConfig {
  chainType: ChainType;
  privateKey?: string;
  rpcUrl?: string;
}

export class TransactionSigner {
  private readonly noteManager: NoteManager;
  private readonly viewKeyManager: ViewKeyManager;
  private readonly chainType: ChainType;
  private readonly privateKey?: string;
  private readonly provider: ethers.providers.JsonRpcProvider | null;

  constructor(
    noteManager: NoteManager,
    viewKeyManager: ViewKeyManager,
    config: TransactionSignerConfig
  ) {
    this.noteManager = noteManager;
    this.viewKeyManager = viewKeyManager;
    this.chainType = config.chainType;
    this.privateKey = config.privateKey;
    
    if (config.chainType === 'ethereum' && config.rpcUrl) {
      this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    } else {
      this.provider = null;
    }
  }

  /**
   * Signs a transaction
   * @param transactionData Transaction data to sign
   * @returns Signed transaction
   */
  async signTransaction(transactionData: any): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Private key not provided for transaction signing');
    }

    try {
      // Create transaction hash
      const transactionHash = this.createTransactionHash(transactionData);
      
      // Sign the transaction
      const wallet = new ethers.Wallet(this.privateKey);
      const signature = await wallet.signMessage(ethers.utils.arrayify(transactionHash));
      
      return signature;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Transaction signing failed: ${errorMessage}`);
    }
  }

  /**
   * Creates a hash of the transaction data
   * @param transactionData Transaction data
   * @returns Transaction hash
   */
  private createTransactionHash(transactionData: any): string {
    const dataString = JSON.stringify(transactionData);
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(dataString));
  }

  /**
   * Verifies a transaction signature
   * @param transactionData Original transaction data
   * @param signature Transaction signature
   * @param publicKey Signer's public key
   * @returns Whether the signature is valid
   */
  async verifySignature(
    transactionData: any,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const transactionHash = this.createTransactionHash(transactionData);
      const recoveredAddress = ethers.utils.verifyMessage(
        ethers.utils.arrayify(transactionHash),
        signature
      );
      
      return recoveredAddress.toLowerCase() === publicKey.toLowerCase();
    } catch (error) {
      return false;
    }
  }

  /**
   * Signs an Ethereum transaction
   * @param transactionData Transaction data
   * @returns Signed transaction
   */
  private async signEthereumTransaction(transactionData: any): Promise<SignedTransaction> {
    if (!this.provider || !this.privateKey) {
      throw new Error('Ethereum provider or private key not available');
    }

    const wallet = new ethers.Wallet(this.privateKey, this.provider);

    // Create the transaction object
    const tx = {
      to: transactionData.recipientAddress,
      value: ethers.utils.parseEther(transactionData.amount),
      gasLimit: transactionData.metadata?.gasLimit || '21000',
      maxFeePerGas: transactionData.metadata?.maxFeePerGas || ethers.utils.parseUnits('20', 'gwei'),
      maxPriorityFeePerGas: transactionData.metadata?.priorityFee || ethers.utils.parseUnits('2', 'gwei'),
      data: transactionData.proof || '0x'
    };

    // Sign the transaction
    const signedTx = await wallet.signTransaction(tx);

    return {
      signature: signedTx,
      transactionData,
      chainType: 'ethereum'
    };
  }

  /**
   * Gets transaction status
   * @param txHash Transaction hash
   * @returns Transaction status
   */
  async getTransactionStatus(txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    blockNumber?: number;
    gasUsed?: string;
  }> {
    try {
      if (this.chainType === 'ethereum' && this.provider) {
        const receipt = await this.provider.getTransactionReceipt(txHash);
        
        if (!receipt) {
          return { status: 'pending' };
        }

        return {
          status: receipt.confirmations > 0 ? 'confirmed' : 'pending',
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        };
      } else {
        // For Solana, return pending status
        return { status: 'pending' };
      }
    } catch (error) {
      return { status: 'failed' };
    }
  }
} 