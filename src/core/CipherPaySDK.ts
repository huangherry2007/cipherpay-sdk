import { NoteManager } from './NoteManager';
import { ViewKeyManager } from './ViewKeyManager';
import { WalletProvider, ChainType } from './WalletProvider';
import { MerkleTreeClient } from './MerkleTreeClient';
import { TransactionBuilder } from '../tx/TransactionBuilder';
import { TransactionSigner } from '../tx/TransactionSigner';
import { ReshieldBuilder } from '../tx/ReshieldBuilder';
import { WithdrawBuilder } from '../tx/WithdrawBuilder';
import { RelayerClient } from '../relayer/RelayerClient';
import { ZKProver } from '../zk/ZKProver';
import { ZKProofGenerator } from '../zkp/ZKProofGenerator';
import { EventMonitor } from '../events/EventMonitor';
import { StealthAddressManager } from './StealthAddressManager';
import { ComplianceManager, ComplianceConfig } from '../compliance/ComplianceManager';
import { CacheManager } from '../utils/CacheManager';
import { Logger } from '../monitoring/observability/logger';
import { ShieldedNote } from '../types/Note';
import { ZKProof } from '../types/ZKProof';

export interface CipherPaySDKConfig {
  chainType: ChainType;
  rpcUrl: string;
  relayerUrl?: string;
  relayerApiKey?: string;
  contractAddress?: string;
  programId?: string;
  enableCompliance?: boolean;
  complianceConfig?: ComplianceConfig;
  enableCaching?: boolean;
  cacheConfig?: {
    maxSize?: number;
    defaultTTL?: number;
  };
  enableStealthAddresses?: boolean;
  stealthAddressConfig?: {
    curve?: 'secp256k1' | 'ed25519';
    viewTagLength?: number;
  };
}

export interface TransferRequest {
  amount: bigint;
  recipientAddress: string;
  stealthAddress?: boolean;
  complianceCheck?: boolean;
  metadata?: Record<string, any>;
}

export interface TransferResult {
  success: boolean;
  txHash?: string;
  stealthAddress?: string;
  proof?: ZKProof;
  error?: string;
  complianceStatus?: {
    compliant: boolean;
    violations: string[];
    riskScore: number;
  };
}

export interface WithdrawRequest {
  amount: bigint;
  recipientAddress: string;
  complianceCheck?: boolean;
  metadata?: Record<string, any>;
}

export interface WithdrawResult {
  success: boolean;
  txHash?: string;
  proof?: ZKProof;
  error?: string;
  complianceStatus?: {
    compliant: boolean;
    violations: string[];
    riskScore: number;
  };
}

export class CipherPaySDK {
  private readonly config: CipherPaySDKConfig;
  private readonly logger: Logger;

  // Core components
  public readonly noteManager: NoteManager;
  public readonly viewKeyManager: ViewKeyManager;
  public readonly walletProvider: WalletProvider;
  public readonly merkleTreeClient: MerkleTreeClient;

  // Transaction components
  public readonly transactionBuilder: TransactionBuilder;
  public readonly transactionSigner: TransactionSigner;
  public readonly reshieldBuilder: ReshieldBuilder;
  public readonly withdrawBuilder: WithdrawBuilder;

  // ZK components
  public zkProver: ZKProver;
  public zkProofGenerator?: ZKProofGenerator;

  // Relayer and events
  public readonly relayerClient: RelayerClient;
  public readonly eventMonitor: EventMonitor;

  // Phase 2 enhancements
  public readonly stealthAddressManager?: StealthAddressManager;
  public readonly complianceManager?: ComplianceManager;
  public readonly cacheManager?: CacheManager;

  constructor(config: CipherPaySDKConfig) {
    this.config = config;
    this.logger = Logger.getInstance();

    // Initialize core components
    this.noteManager = new NoteManager();
    this.viewKeyManager = new ViewKeyManager(config.chainType);
    this.walletProvider = new WalletProvider(config.chainType, {
      rpcUrl: config.rpcUrl
    });

    // Initialize MerkleTreeClient with chain-specific configuration
    if (config.chainType === 'solana') {
      // For Solana, initialize without contract but with relayer URL
      this.merkleTreeClient = new MerkleTreeClient(undefined, 'solana', config.relayerUrl);
    } else {
      // For EVM, initialize with mock contract (would be replaced with actual contract instance)
      const mockContract = {} as any; // This would be replaced with actual contract instance
      this.merkleTreeClient = new MerkleTreeClient(mockContract, 'evm');
    }

    // Initialize transaction components - ZK components will be configured later with circuit files
    this.zkProver = new ZKProver(); // Will be configured later with circuit files
    // ZKProofGenerator will be initialized when configureZKComponents is called

    // Initialize relayer first since TransactionBuilder needs it
    this.relayerClient = new RelayerClient({
      chainType: config.chainType,
      endpoint: config.relayerUrl || 'http://localhost:3000',
      maxRetries: 3,
      timeout: 30000,
      retryDelay: 1000
    });

    this.transactionBuilder = new TransactionBuilder(
      this.relayerClient,
      this.walletProvider,
      this.zkProver,
      {
        maxRetries: 3,
        retryDelay: 1000
      }
    );

    this.transactionSigner = new TransactionSigner(
      this.noteManager,
      this.viewKeyManager,
      {
        chainType: config.chainType,
        rpcUrl: config.rpcUrl
      }
    );

    // These builders will be initialized when ZK components are configured
    // For now, create them with placeholder ZKProofGenerator instances
    const placeholderZKGenerator = new ZKProofGenerator({
      wasmBuffer: new ArrayBuffer(0),
      zkeyBuffer: new ArrayBuffer(0),
      verificationKey: {}
    });

    this.reshieldBuilder = new ReshieldBuilder(
      this.noteManager,
      this.viewKeyManager,
      placeholderZKGenerator,
      config.chainType
    );

    this.withdrawBuilder = new WithdrawBuilder(
      this.noteManager,
      this.viewKeyManager,
      placeholderZKGenerator,
      config.chainType
    );

    // Initialize events
    this.eventMonitor = new EventMonitor({
      chainType: config.chainType,
      rpcUrl: config.rpcUrl,
      contractAddress: config.contractAddress,
      programId: config.programId
    });

    // Initialize Phase 2 enhancements
    if (config.enableStealthAddresses) {
      this.stealthAddressManager = new StealthAddressManager(config.stealthAddressConfig);
    }

    if (config.enableCompliance) {
      this.complianceManager = new ComplianceManager(config.complianceConfig || {
        enableAuditTrail: true,
        enableRealTimeMonitoring: true
      });
    }

    if (config.enableCaching) {
      this.cacheManager = new CacheManager(config.cacheConfig);
    }

    this.logger.info('CipherPay SDK initialized', { config: { chainType: config.chainType } });
  }

  /**
   * Connects to a wallet
   * @returns Wallet information
   */
  async connectWallet(): Promise<any> {
    try {
      this.logger.info('Attempting to connect wallet...');
      const result = await this.walletProvider.connect();
      this.logger.info('Wallet connected successfully', { address: result.address });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to connect wallet', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Disconnects from the wallet
   */
  async disconnectWallet(): Promise<void> {
    try {
      this.logger.info('Disconnecting wallet...');
      await this.walletProvider.disconnect();
      this.logger.info('Wallet disconnected successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to disconnect wallet', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Gets the current wallet information
   * @returns Wallet information or null if not connected
   */
  getWalletInfo(): any {
    if (!this.walletProvider.isConnected()) {
      return null;
    }
    return {
      address: this.walletProvider.getAddress(),
      chainType: this.walletProvider.getChainType(),
      connected: this.walletProvider.isConnected()
    };
  }

  /**
   * Checks if wallet is connected
   * @returns True if wallet is connected
   */
  isWalletConnected(): boolean {
    return this.walletProvider.isConnected();
  }

  /**
   * Performs a shielded transfer
   * @param request Transfer request
   * @returns Transfer result
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    try {
      this.logger.info('Starting shielded transfer', { amount: request.amount.toString(), recipient: request.recipientAddress });

      // Generate stealth address if requested
      let stealthAddress: string | undefined;
      if (request.stealthAddress && this.stealthAddressManager) {
        const stealthResult = this.stealthAddressManager.generateStealthAddress(request.recipientAddress);
        stealthAddress = stealthResult.address;
        request.recipientAddress = stealthAddress;
      }

      // Compliance check if enabled
      let complianceStatus;
      if (this.complianceManager && request.complianceCheck !== false) {
        const senderAddress = await this.walletProvider.getAddress() || 'unknown';
        complianceStatus = await this.complianceManager.validateTransaction({
          amount: request.amount,
          recipientAddress: request.recipientAddress,
          senderAddress,
          type: 'transfer'
        }, 'user');

        if (!complianceStatus.compliant) {
          return {
            success: false,
            error: `Compliance check failed: ${complianceStatus.violations.join(', ')}`,
            complianceStatus
          };
        }
      }

      // For now, return a mock successful result
      // In a real implementation, this would build and submit the transaction
      return {
        success: true,
        txHash: 'mock-tx-hash',
        stealthAddress,
        complianceStatus
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Transfer failed', { error: errorMessage, request });

      return {
        success: false,
        error: `Transfer failed: ${errorMessage}`
      };
    }
  }

  /**
   * Performs a withdrawal
   * @param request Withdraw request
   * @returns Withdraw result
   */
  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    try {
      this.logger.info('Starting withdrawal', { amount: request.amount.toString(), recipient: request.recipientAddress });

      // Compliance check if enabled
      let complianceStatus;
      if (this.complianceManager && request.complianceCheck !== false) {
        const senderAddress = await this.walletProvider.getAddress() || 'unknown';
        complianceStatus = await this.complianceManager.validateTransaction({
          amount: request.amount,
          recipientAddress: request.recipientAddress,
          senderAddress,
          type: 'withdraw'
        }, 'user');

        if (!complianceStatus.compliant) {
          return {
            success: false,
            error: `Compliance check failed: ${complianceStatus.violations.join(', ')}`,
            complianceStatus
          };
        }
      }

      // For now, return a mock successful result
      // In a real implementation, this would build and submit the withdrawal
      return {
        success: true,
        txHash: 'mock-withdraw-tx-hash',
        complianceStatus
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Withdrawal failed', { error: errorMessage, request });

      return {
        success: false,
        error: `Withdrawal failed: ${errorMessage}`
      };
    }
  }

  /**
   * Gets the current balance
   * @returns Current balance
   */
  getBalance(): bigint {
    return this.noteManager.getBalance();
  }

  /**
   * Gets all notes
   * @returns Array of notes
   */
  async getNotes(): Promise<ShieldedNote[]> {
    return this.noteManager.getNotes();
  }

  /**
   * Gets spendable notes
   * @returns Array of spendable notes
   */
  getSpendableNotes(): ShieldedNote[] {
    return this.noteManager.getSpendableNotes();
  }

  /**
   * Configures ZK components with circuit files (browser-compatible)
   */
  async configureZKComponents(circuitUrls: Record<string, {
    wasmUrl: string;
    zkeyUrl: string;
    verifierUrl: string;
  }>): Promise<void> {
    try {
      // Configure ZKProver with circuit URLs
      this.zkProver = await ZKProver.fromUrls(circuitUrls);

      // Configure ZKProofGenerator with the first circuit (assuming they're compatible)
      const firstCircuit = Object.values(circuitUrls)[0];
      if (firstCircuit) {
        this.zkProofGenerator = await ZKProofGenerator.fromUrls({
          wasmUrl: firstCircuit.wasmUrl,
          zkeyUrl: firstCircuit.zkeyUrl,
          verificationKeyUrl: firstCircuit.verifierUrl
        });
      }

      this.logger.info('ZK components configured successfully', { circuitCount: Object.keys(circuitUrls).length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to configure ZK components', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Starts event monitoring
   */
  async startEventMonitoring(): Promise<void> {
    await this.eventMonitor.startMonitoring();
  }

  /**
   * Stops event monitoring
   */
  stopEventMonitoring(): void {
    this.eventMonitor.stopMonitoring();
  }

  /**
   * Generates a compliance report
   * @param startTime Start timestamp
   * @param endTime End timestamp
   * @returns Compliance report
   */
  generateComplianceReport(startTime: number, endTime: number): any {
    if (!this.complianceManager) {
      throw new Error('Compliance manager not enabled');
    }
    return this.complianceManager.generateComplianceReport(startTime, endTime);
  }

  /**
   * Gets cache statistics
   * @returns Cache statistics
   */
  getCacheStats(): any {
    if (!this.cacheManager) {
      throw new Error('Cache manager not enabled');
    }
    return this.cacheManager.getStats();
  }

  /**
   * Destroys the SDK and cleans up resources
   */
  destroy(): void {
    this.stopEventMonitoring();
    if (this.cacheManager) {
      this.cacheManager.destroy();
    }
    this.logger.info('CipherPay SDK destroyed');
  }
} 