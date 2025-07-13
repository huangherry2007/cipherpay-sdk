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

// Environment detection
const isBrowser = typeof window !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

export class WalletProvider {
  private userAccount: UserAccount | null = null;
  private chainType: ChainType;
  private solanaConnection!: Connection;
  private connection!: Connection;
  private keypair: Keypair | null = null;
  private config: WalletConfig;
  private validator: InputValidator;
  private auditLogger: AuditLogger;
  private authManager: AuthManager;
  private connected: boolean = false;

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

    // Initialize Solana connection only in Node.js or when needed
    if (isNode || chainType === 'solana') {
      this.connection = new Connection(config.rpcUrl, {
        commitment: config.commitment || 'confirmed',
        confirmTransactionInitialTimeout: config.confirmTransactionInitialTimeout || 60000
      });
      if (chainType === 'solana') {
        this.solanaConnection = new Connection(config.rpcUrl || 'https://api.mainnet-beta.solana.com');
      }
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
   * Gets the address of the connected wallet
   * @returns string | null The address or null if not connected
   */
  getAddress(): string | null {
    return this.userAccount?.address || null;
  }

  /**
   * Gets the chain type
   * @returns ChainType The chain type
   */
  getChainType(): ChainType {
    return this.chainType;
  }

  /**
   * Checks if wallet is connected
   * @returns boolean True if connected
   */
  isConnected(): boolean {
    return this.connected && this.userAccount !== null;
  }

  /**
   * Disconnects from the wallet
   */
  async disconnect(): Promise<void> {
    if (!this.userAccount) {
      return;
    }

    if (this.chainType === 'solana' && this.userAccount.provider) {
      await this.userAccount.provider.disconnect();
    }

    this.userAccount = null;
    this.connected = false;
  }

  /**
   * Signs and sends a deposit transaction
   * @param to Recipient address
   * @param value Amount to send
   * @returns Promise<TxReceipt> Transaction receipt
   */
  async signAndSendDepositTx(to: string, value: string): Promise<TxReceipt> {
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

    // Validate input
    const amountValidation = this.validator.validateAmount(value);
    if (!amountValidation.isValid) {
      const cipherPayError = new CipherPayError(
        'Invalid deposit amount',
        ErrorType.INVALID_INPUT,
        { amount: value },
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
   * Connects to Ethereum wallet
   * @returns Promise<UserAccount> Connected user account
   */
  private async connectEthereum(): Promise<UserAccount> {
    if (isBrowser) {
      // Browser environment - try to use MetaMask
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          // Request account access
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          const address = accounts[0];

          this.userAccount = {
            address,
            chainType: 'ethereum',
            provider: window.ethereum
          };
          this.connected = true;

          return this.userAccount;
        } catch (error) {
          throw new Error('Failed to connect to MetaMask: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      } else {
        // Fallback to mock wallet for development
        const mockAddress = '0x' + Math.random().toString(16).substr(2, 40);
        this.userAccount = {
          address: mockAddress,
          chainType: 'ethereum',
          provider: null
        };
        this.connected = true;

        return this.userAccount;
      }
    } else if (isNode) {
      // Node.js environment - use ethers
      if (typeof (global as any).ethereum === 'undefined') {
        throw new CipherPayError(
          'Ethereum provider not available',
          ErrorType.WALLET_CONNECTION_FAILED,
          { walletType: 'Ethereum' },
          {
            action: 'Provide Ethereum provider',
            description: 'Ethereum provider is not available in this environment.'
          },
          false
        );
      }

      const provider = new ethers.providers.Web3Provider((global as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      this.userAccount = {
        address,
        chainType: 'ethereum',
        provider
      };
      this.connected = true;

      return this.userAccount;
    } else {
      // Other environments - fallback to mock
      const mockAddress = '0x' + Math.random().toString(16).substr(2, 40);
      this.userAccount = {
        address: mockAddress,
        chainType: 'ethereum',
        provider: null
      };
      this.connected = true;

      return this.userAccount;
    }
  }

  /**
   * Connects to Solana wallet
   * @returns Promise<UserAccount> Connected user account
   */
  private async connectSolana(): Promise<UserAccount> {
    if (isBrowser) {
      // Browser environment - try to use Phantom
      console.log('🔍 Checking for Phantom wallet in browser...');

      // Check for Phantom wallet in multiple ways
      const phantom = (window as any).phantom?.solana || (window as any).solana;

      if (phantom && phantom.isPhantom) {
        console.log('✅ Phantom wallet detected');
        try {
          // Request account access
          const response = await phantom.connect();
          const address = response.publicKey.toString();

          console.log('✅ Phantom wallet connected:', address);

          this.userAccount = {
            address,
            chainType: 'solana',
            provider: phantom
          };
          this.connected = true;

          return this.userAccount;
        } catch (error) {
          console.error('❌ Failed to connect to Phantom:', error);
          throw new Error('Failed to connect to Phantom: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      } else {
        console.log('❌ Phantom wallet not detected');
        console.log('Available window properties:', Object.keys(window).filter(key => key.toLowerCase().includes('solana') || key.toLowerCase().includes('phantom')));

        // Provide helpful error message
        const errorMessage = 'Phantom wallet not detected. Please ensure Phantom is installed and unlocked.';
        console.error(errorMessage);

        // For development, you can uncomment the mock wallet fallback
        // throw new Error(errorMessage);

        // Fallback to mock wallet for development
        console.log('🔄 Using mock wallet for development');
        const mockAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
        this.userAccount = {
          address: mockAddress,
          chainType: 'solana',
          provider: null
        };
        this.connected = true;

        return this.userAccount;
      }
    } else if (isNode) {
      // Node.js environment - use PhantomWalletAdapter
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
      this.connected = true;

      return this.userAccount;
    } else {
      // Other environments - fallback to mock
      const mockAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
      this.userAccount = {
        address: mockAddress,
        chainType: 'solana',
        provider: null
      };
      this.connected = true;

      return this.userAccount;
    }
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

    if (isBrowser) {
      // Browser environment - use window.ethereum
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
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
      } else {
        // Mock transaction for development
        return {
          txHash: '0x' + Math.random().toString(16).substr(2, 64),
          chainType: 'ethereum',
          status: 'success',
          blockNumber: Math.floor(Math.random() * 1000000)
        };
      }
    } else {
      // Node.js environment
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

    if (isBrowser) {
      // Browser environment - use window.solana
      if (typeof window !== 'undefined' && window.solana) {
        const wallet = window.solana;
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
      } else {
        // Mock transaction for development
        return {
          txHash: '0x' + Math.random().toString(16).substr(2, 64),
          chainType: 'solana',
          status: 'success',
          blockNumber: Math.floor(Math.random() * 1000000)
        };
      }
    } else {
      // Node.js environment
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
  }

  /**
   * Initializes the wallet with a keypair (Solana only)
   */
  async initialize(keypair?: Keypair): Promise<void> {
    if (this.chainType !== 'solana') {
      throw new Error('Keypair initialization is only supported for Solana');
    }

    if (keypair) {
      this.keypair = keypair;
    } else {
      // Generate a new keypair if none provided
      this.keypair = Keypair.generate();
    }
  }

  /**
   * Gets the wallet's public key (Solana only)
   */
  getPublicKey(): PublicKey | null {
    if (this.chainType !== 'solana') {
      return null;
    }
    return this.keypair?.publicKey || null;
  }

  /**
   * Gets the wallet's keypair (Solana only)
   */
  getKeypair(): Keypair | null {
    if (this.chainType !== 'solana') {
      return null;
    }
    return this.keypair;
  }

  /**
   * Gets the wallet's balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Balance checking is only supported for Solana with initialized keypair');
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
   * Sends a transaction (Solana only)
   */
  async sendTransaction(transaction: Transaction): Promise<string> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Transaction sending is only supported for Solana with initialized keypair');
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
   * Signs a transaction (Solana only)
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Transaction signing is only supported for Solana with initialized keypair');
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
   * Signs a message (Solana only)
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Message signing is only supported for Solana with initialized keypair');
    }

    try {
      return nacl.sign.detached(message, this.keypair.secretKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Message signing failed: ${errorMessage}`);
    }
  }

  /**
   * Verifies a message signature (Solana only)
   */
  async verifyMessage(message: Uint8Array, signature: Uint8Array, publicKey: PublicKey): Promise<boolean> {
    try {
      return nacl.sign.detached.verify(message, signature, publicKey.toBytes());
    } catch (error) {
      return false;
    }
  }

  /**
   * Generates a stealth address for privacy (Solana only)
   */
  async generateStealthAddress(recipientPublicKey: PublicKey): Promise<StealthAddress> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Stealth address generation is only supported for Solana with initialized keypair');
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
   * Scans for incoming stealth transactions (Solana only)
   */
  async scanForStealthTransactions(
    fromBlock: number,
    toBlock: number,
    viewKey: Uint8Array
  ): Promise<any[]> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Stealth transaction scanning is only supported for Solana with initialized keypair');
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
    if (this.chainType !== 'solana' || !this.keypair) {
      return null;
    }

    return Buffer.from(this.keypair.secretKey).toString('base64');
  }

  /**
   * Imports a wallet from a private key
   */
  async importFromPrivateKey(privateKeyBase64: string): Promise<void> {
    if (this.chainType !== 'solana') {
      throw new Error('Private key import is only supported for Solana');
    }

    try {
      const secretKey = Buffer.from(privateKeyBase64, 'base64');
      this.keypair = Keypair.fromSecretKey(secretKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to import private key: ${errorMessage}`);
    }
  }

  /**
   * Gets transaction history (Solana only)
   */
  async getTransactionHistory(limit: number = 100): Promise<any[]> {
    if (this.chainType !== 'solana' || !this.keypair) {
      throw new Error('Transaction history is only supported for Solana with initialized keypair');
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

// Add global type declarations for wallet providers
declare global {
  interface Window {
    ethereum?: any;
    solana?: any;
  }
}
