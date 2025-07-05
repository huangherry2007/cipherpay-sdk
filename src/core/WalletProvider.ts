import { ethers } from 'ethers';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import * as nacl from 'tweetnacl';
import { ErrorHandler, ErrorType, CipherPayError } from '../errors/ErrorHandler';
import { globalRateLimiter } from '../utils/RateLimiter';
import { InputValidator, ValidationSchemas } from '../security/validation';
import { AuditLogger } from '../security/audit';
import { AuthManager, Permissions } from '../security/auth';

export type ChainType = 'ethereum' | 'solana';

export interface UserAccount {
  address: string;
  chainType: ChainType;
  provider: any; // ethers.providers.Web3Provider | PhantomWalletAdapter
}

export interface TxReceipt {
  txHash: string;
  chainType: ChainType;
  status: 'success' | 'failed';
  blockNumber?: number;
}

export interface WalletConfig {
  rpcUrl: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  confirmTransactionInitialTimeout?: number;
}

export interface StealthAddress {
  address: string;
  ephemeralPublicKey: string;
  viewTag: string;
}

export interface WalletBalance {
  sol: number;
  lamports: number;
  tokens: Map<string, number>;
}

export class WalletProvider {
  private userAccount: UserAccount | null = null;
  private chainType: ChainType;
  private solanaConnection!: Connection;
  private connection: Connection;
  private keypair: Keypair | null = null;
  private config: WalletConfig;
  private validator: InputValidator;
  private auditLogger: AuditLogger;
  private authManager: AuthManager;

  constructor(chainType: ChainType, config: WalletConfig) {
    // Validate chain type
    if (chainType !== 'ethereum' && chainType !== 'solana') {
      throw new CipherPayError(
        'Unsupported chain type',
        ErrorType.INVALID_INPUT,
        { chainType },
        {
          action: 'Use supported chain type',
          description: 'Only ethereum and solana chain types are supported.'
        },
        false
      );
    }
    
    this.chainType = chainType;
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment || 'confirmed',
      confirmTransactionInitialTimeout: config.confirmTransactionInitialTimeout || 60000
    });
    if (chainType === 'solana') {
      this.solanaConnection = new Connection(config.rpcUrl || 'https://api.mainnet-beta.solana.com');
    }

    // Initialize security components
    this.validator = InputValidator.getInstance();
    this.auditLogger = AuditLogger.getInstance();
    this.authManager = AuthManager.getInstance();
  }

  /**
   * Connects to the user's wallet
   * @returns Promise<UserAccount> The connected user account
   */
  async connect(): Promise<UserAccount> {
    // Apply rate limiting for wallet connection
    globalRateLimiter.consume('WALLET_OPERATIONS', {
      operation: 'connect',
      chainType: this.chainType
    });

    try {
      // Audit wallet connection attempt
      this.auditLogger.logEvent({
        userId: 'anonymous', // Will be updated with actual user ID when auth is implemented
        action: 'wallet_connection_attempt',
        resource: 'wallet',
        details: { chainType: this.chainType },
        success: true,
        severity: 'low',
        category: 'security'
      });

      if (this.chainType === 'ethereum') {
        const result = await this.connectEthereum();
        
        // Audit successful connection
        this.auditLogger.logEvent({
          userId: 'anonymous',
          action: 'wallet_connected',
          resource: 'wallet',
          resourceId: result.address,
          details: { chainType: this.chainType, address: result.address },
          success: true,
          severity: 'low',
          category: 'security'
        });
        
        return result;
      } else {
        const result = await this.connectSolana();
        
        // Audit successful connection
        this.auditLogger.logEvent({
          userId: 'anonymous',
          action: 'wallet_connected',
          resource: 'wallet',
          resourceId: result.address,
          details: { chainType: this.chainType, address: result.address },
          success: true,
          severity: 'low',
          category: 'security'
        });
        
        return result;
      }
    } catch (error) {
      // Audit failed connection
      this.auditLogger.logEvent({
        userId: 'anonymous',
        action: 'wallet_connection_failed',
        resource: 'wallet',
        details: { 
          chainType: this.chainType, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        },
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        severity: 'medium',
        category: 'security'
      });

      if (error instanceof Error) {
        const cipherPayError = new CipherPayError(
          `Failed to connect wallet: ${error.message}`,
          ErrorType.WALLET_CONNECTION_FAILED,
          { chainType: this.chainType },
          {
            action: 'Check wallet installation',
            description: 'Failed to connect to wallet. Please ensure the wallet is installed and accessible.'
          },
          true
        );
        throw ErrorHandler.getInstance().handleError(cipherPayError);
      }
      const cipherPayError = new CipherPayError(
        'Failed to connect wallet: Unknown error',
        ErrorType.WALLET_CONNECTION_FAILED,
        { chainType: this.chainType },
        {
          action: 'Check wallet installation',
          description: 'Failed to connect to wallet due to an unknown error.'
        },
        true
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Gets the public address of the connected wallet
   * @returns string The public address
   */
  getPublicAddress(): string {
    if (!this.userAccount) {
      throw new CipherPayError(
        'No wallet connected',
        ErrorType.WALLET_CONNECTION_FAILED,
        { chainType: this.chainType },
        {
          action: 'Connect wallet first',
          description: 'No wallet is currently connected. Please connect a wallet first.'
        },
        false
      );
    }
    return this.userAccount.address;
  }

  /**
   * Signs and sends a deposit transaction
   * @param amount The amount to deposit
   * @returns Promise<TxReceipt> The transaction receipt
   */
  async signAndSendDepositTx(amount: number): Promise<TxReceipt> {
    // Validate input
    const amountValidation = this.validator.validateAmount(amount.toString());
    if (!amountValidation.isValid) {
      const cipherPayError = new CipherPayError(
        'Invalid deposit amount',
        ErrorType.INVALID_INPUT,
        { amount: amount.toString() },
        {
          action: 'Provide a valid positive amount',
          description: 'Deposit amount must be a valid positive number.'
        },
        false
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }

    // Apply rate limiting for deposit transactions
    globalRateLimiter.consume('TRANSACTION_SIGNING', {
      operation: 'deposit',
      chainType: this.chainType,
      amount: amountValidation.sanitized.toString()
    });

    if (!this.userAccount) {
      throw new CipherPayError(
        'No wallet connected',
        ErrorType.WALLET_CONNECTION_FAILED,
        { chainType: this.chainType },
        {
          action: 'Connect wallet first',
          description: 'No wallet is currently connected. Please connect a wallet first.'
        },
        false
      );
    }

    // Audit deposit attempt
    this.auditLogger.logEvent({
      userId: 'anonymous',
      action: 'deposit_attempt',
      resource: 'transfer',
      resourceId: this.userAccount.address,
      details: { 
        chainType: this.chainType, 
        amount: amountValidation.sanitized,
        address: this.userAccount.address 
      },
      success: true,
      severity: 'medium',
      category: 'financial'
    });

    try {
      let result: TxReceipt;
      
      if (this.chainType === 'ethereum') {
        result = await this.sendEthereumDeposit(amountValidation.sanitized);
      } else {
        result = await this.sendSolanaDeposit(amountValidation.sanitized);
      }

      // Audit successful deposit
      this.auditLogger.logEvent({
        userId: 'anonymous',
        action: 'deposit_completed',
        resource: 'transfer',
        resourceId: result.txHash,
        details: { 
          chainType: this.chainType, 
          amount: amountValidation.sanitized,
          txHash: result.txHash,
          status: result.status 
        },
        success: true,
        severity: 'medium',
        category: 'financial'
      });

      return result;

    } catch (error) {
      // Audit failed deposit
      this.auditLogger.logEvent({
        userId: 'anonymous',
        action: 'deposit_failed',
        resource: 'transfer',
        resourceId: this.userAccount.address,
        details: { 
          chainType: this.chainType, 
          amount: amountValidation.sanitized,
          address: this.userAccount.address,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        severity: 'high',
        category: 'financial'
      });

      if (error instanceof Error) {
        const cipherPayError = new CipherPayError(
          `Failed to send deposit: ${error.message}`,
          ErrorType.TRANSACTION_FAILED,
          { chainType: this.chainType, amount: amountValidation.sanitized.toString() },
          {
            action: 'Check balance and retry',
            description: 'Failed to send deposit transaction. Please check your balance and try again.'
          },
          true
        );
        throw ErrorHandler.getInstance().handleError(cipherPayError);
      }
      const cipherPayError = new CipherPayError(
        'Failed to send deposit: Unknown error',
        ErrorType.TRANSACTION_FAILED,
        { chainType: this.chainType, amount: amountValidation.sanitized.toString() },
        {
          action: 'Check balance and retry',
          description: 'Failed to send deposit transaction due to an unknown error.'
        },
        true
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Connects to an Ethereum wallet
   */
  private async connectEthereum(): Promise<UserAccount> {
    if (typeof (window as any).ethereum === 'undefined') {
      throw new CipherPayError(
        'MetaMask not installed',
        ErrorType.WALLET_CONNECTION_FAILED,
        { walletType: 'MetaMask' },
        {
          action: 'Install MetaMask',
          description: 'MetaMask is not installed. Please install MetaMask from the Chrome Web Store.'
        },
        false
      );
    }

    console.log('DEBUG: connectEthereum - window.ethereum:', (window as any).ethereum);
    
    const provider = new ethers.providers.Web3Provider((window as any).ethereum);
    console.log('DEBUG: connectEthereum - provider:', provider);
    console.log('DEBUG: connectEthereum - provider.send:', typeof provider.send);
    let proto = Object.getPrototypeOf(provider);
    while (proto) {
      console.log('DEBUG: connectEthereum - provider proto:', proto);
      proto = Object.getPrototypeOf(proto);
    }
    
    await provider.send('eth_requestAccounts', []);
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    this.userAccount = {
      address,
      chainType: 'ethereum',
      provider
    };

    return this.userAccount;
  }

  /**
   * Connects to a Solana wallet
   */
  private async connectSolana(): Promise<UserAccount> {
    const phantom = new PhantomWalletAdapter();
    await phantom.connect();

    if (!phantom.publicKey) {
      throw new CipherPayError(
        'Failed to connect to Phantom wallet',
        ErrorType.WALLET_CONNECTION_FAILED,
        { walletType: 'Phantom' },
        {
          action: 'Check Phantom wallet',
          description: 'Failed to connect to Phantom wallet. Please ensure Phantom is installed and unlocked.'
        },
        true
      );
    }

    this.userAccount = {
      address: phantom.publicKey.toBase58(),
      chainType: 'solana',
      provider: phantom
    };

    return this.userAccount;
  }

  /**
   * Sends a deposit transaction on Ethereum
   */
  private async sendEthereumDeposit(amount: number): Promise<TxReceipt> {
    if (!this.userAccount || this.chainType !== 'ethereum') {
      throw new CipherPayError(
        'Invalid wallet state',
        ErrorType.WALLET_CONNECTION_FAILED,
        { chainType: this.chainType, hasUserAccount: !!this.userAccount },
        {
          action: 'Reconnect wallet',
          description: 'Invalid wallet state. Please reconnect your wallet.'
        },
        false
      );
    }

    const provider = this.userAccount.provider;
    const signer = provider.getSigner();

    // TODO: Replace with actual CipherPay contract address
    const contractAddress = '0x...';
    const contract = new ethers.Contract(contractAddress, [], signer);

    const tx = await contract.deposit({ value: ethers.utils.parseEther(amount.toString()) });
    const receipt = await tx.wait();

    return {
      txHash: receipt.transactionHash,
      chainType: 'ethereum',
      status: receipt.status === 1 ? 'success' : 'failed',
      blockNumber: receipt.blockNumber
    };
  }

  /**
   * Sends a deposit transaction on Solana
   */
  private async sendSolanaDeposit(amount: number): Promise<TxReceipt> {
    if (!this.userAccount || this.chainType !== 'solana') {
      throw new CipherPayError(
        'Invalid wallet state',
        ErrorType.WALLET_CONNECTION_FAILED,
        { chainType: this.chainType, hasUserAccount: !!this.userAccount },
        {
          action: 'Reconnect wallet',
          description: 'Invalid wallet state. Please reconnect your wallet.'
        },
        false
      );
    }

    const wallet = this.userAccount.provider;
    const publicKey = new PublicKey(this.userAccount.address);

    // TODO: Replace with actual CipherPay program ID
    const programId = new PublicKey('...');
    
    // Create deposit instruction
    const transaction = new Transaction().add({
      programId,
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        // Add other required account keys
      ],
      data: Buffer.from([/* deposit instruction data */])
    });

    const signature = await sendAndConfirmTransaction(
      this.solanaConnection,
      transaction,
      [wallet]
    );

    return {
      txHash: signature,
      chainType: 'solana',
      status: 'success'
    };
  }

  /**
   * Disconnects the current wallet
   */
  async disconnect(): Promise<void> {
    if (!this.userAccount) {
      return;
    }

    if (this.chainType === 'solana') {
      await this.userAccount.provider.disconnect();
    }

    this.userAccount = null;
  }

  /**
   * Gets the current chain type
   */
  getChainType(): ChainType {
    return this.chainType;
  }

  /**
   * Checks if a wallet is connected
   */
  isConnected(): boolean {
    return this.userAccount !== null;
  }

  /**
   * Initializes the wallet with a keypair
   */
  async initialize(keypair?: Keypair): Promise<void> {
    if (keypair) {
      this.keypair = keypair;
    } else {
      // Generate a new keypair if none provided
      this.keypair = Keypair.generate();
    }
  }

  /**
   * Gets the wallet's public key
   */
  getPublicKey(): PublicKey | null {
    return this.keypair?.publicKey || null;
  }

  /**
   * Gets the wallet's address
   */
  getAddress(): string | null {
    return this.keypair?.publicKey.toString() || null;
  }

  /**
   * Gets the wallet's keypair
   */
  getKeypair(): Keypair | null {
    return this.keypair;
  }

  /**
   * Gets the wallet's balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    const lamports = await this.connection.getBalance(this.keypair.publicKey);
    const sol = lamports / LAMPORTS_PER_SOL;

    // TODO: Add token balance fetching
    const tokens = new Map<string, number>();

    return {
      sol,
      lamports,
      tokens
    };
  }

  /**
   * Sends a transaction
   */
  async sendTransaction(transaction: Transaction): Promise<string> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.keypair],
        {
          commitment: this.config.commitment || 'confirmed'
        }
      );

      return signature;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Transaction failed: ${errorMessage}`);
    }
  }

  /**
   * Signs a transaction
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    try {
      transaction.sign(this.keypair);
      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Transaction signing failed: ${errorMessage}`);
    }
  }

  /**
   * Signs a message
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    try {
      return nacl.sign.detached(message, this.keypair.secretKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Message signing failed: ${errorMessage}`);
    }
  }

  /**
   * Verifies a message signature
   */
  async verifyMessage(message: Uint8Array, signature: Uint8Array, publicKey: PublicKey): Promise<boolean> {
    try {
      return nacl.sign.detached.verify(message, signature, publicKey.toBytes());
    } catch (error) {
      return false;
    }
  }

  /**
   * Generates a stealth address for privacy
   */
  async generateStealthAddress(recipientPublicKey: PublicKey): Promise<StealthAddress> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    try {
      // Generate ephemeral keypair
      const ephemeralKeypair = Keypair.generate();
      
      // Create shared secret using ECDH
      const sharedSecret = nacl.scalarMult(
        this.keypair.secretKey.slice(0, 32),
        ephemeralKeypair.publicKey.toBytes()
      );

      // Derive stealth address
      const stealthAddress = this.deriveStealthAddress(recipientPublicKey, sharedSecret);
      
      // Generate view tag for efficient scanning
      const viewTag = this.generateViewTag(sharedSecret);

      return {
        address: stealthAddress.toString(),
        ephemeralPublicKey: ephemeralKeypair.publicKey.toString(),
        viewTag
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Stealth address generation failed: ${errorMessage}`);
    }
  }

  /**
   * Derives a stealth address from a public key and shared secret
   */
  private deriveStealthAddress(publicKey: PublicKey, sharedSecret: Uint8Array): PublicKey {
    // Hash the shared secret
    const hash = nacl.hash(sharedSecret);
    
    // Add the hash to the public key
    const stealthBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      stealthBytes[i] = publicKey.toBytes()[i] ^ hash[i];
    }
    
    return new PublicKey(stealthBytes);
  }

  /**
   * Generates a view tag for efficient stealth address scanning
   */
  private generateViewTag(sharedSecret: Uint8Array): string {
    const hash = nacl.hash(sharedSecret);
    return hash[0].toString(16).padStart(2, '0');
  }

  /**
   * Scans for incoming stealth transactions
   */
  async scanForStealthTransactions(
    fromBlock: number,
    toBlock: number,
    viewKey: Uint8Array
  ): Promise<any[]> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    const transactions: any[] = [];

    try {
      // Get recent transactions
      const signatures = await this.connection.getSignaturesForAddress(
        this.keypair.publicKey,
        { limit: 1000 }
      );

      for (const sig of signatures) {
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            commitment: 'confirmed'
          });

          if (tx && this.isStealthTransaction(tx, viewKey)) {
            transactions.push({
              signature: sig.signature,
              blockTime: sig.blockTime,
              transaction: tx
            });
          }
        } catch (error) {
          // Skip failed transaction fetches
          continue;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Stealth transaction scanning failed: ${errorMessage}`);
    }

    return transactions;
  }

  /**
   * Checks if a transaction is a stealth transaction for this wallet
   */
  private isStealthTransaction(transaction: any, viewKey: Uint8Array): boolean {
    // This is a simplified check - in a real implementation,
    // you would check for stealth address patterns and view tags
    try {
      // Check if transaction contains stealth address patterns
      const accountKeys = transaction.transaction.message.accountKeys;
      
      for (const account of accountKeys) {
        // Check if this account could be a stealth address for this wallet
        if (this.couldBeStealthAddress(account, viewKey)) {
          return true;
        }
      }
    } catch (error) {
      return false;
    }

    return false;
  }

  /**
   * Checks if an account could be a stealth address for this wallet
   */
  private couldBeStealthAddress(account: string, viewKey: Uint8Array): boolean {
    // This is a simplified check - in a real implementation,
    // you would perform proper stealth address derivation and comparison
    try {
      const accountBytes = new PublicKey(account).toBytes();
      
      // Check view tag (first byte of hash)
      const potentialViewTag = accountBytes[0];
      const expectedViewTag = nacl.hash(viewKey)[0];
      
      return potentialViewTag === expectedViewTag;
    } catch (error) {
      return false;
    }
  }

  /**
   * Exports the wallet's private key (use with caution)
   */
  exportPrivateKey(): string | null {
    if (!this.keypair) {
      return null;
    }

    return Buffer.from(this.keypair.secretKey).toString('base64');
  }

  /**
   * Imports a wallet from a private key
   */
  async importFromPrivateKey(privateKeyBase64: string): Promise<void> {
    try {
      const secretKey = Buffer.from(privateKeyBase64, 'base64');
      this.keypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to import private key: ${errorMessage}`);
    }
  }

  /**
   * Gets transaction history
   */
  async getTransactionHistory(limit: number = 100): Promise<any[]> {
    if (!this.keypair) {
      throw new Error('Wallet not initialized');
    }

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        this.keypair.publicKey,
        { limit }
      );

      const transactions = [];
      for (const sig of signatures) {
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            commitment: 'confirmed'
          });
          
          if (tx) {
            transactions.push({
              signature: sig.signature,
              blockTime: sig.blockTime,
              transaction: tx
            });
          }
        } catch (error) {
          // Skip failed transaction fetches
          continue;
        }
      }

      return transactions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get transaction history: ${errorMessage}`);
    }
  }
}
