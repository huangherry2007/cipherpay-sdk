import { ethers } from 'ethers';
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

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

export class WalletProvider {
  private userAccount: UserAccount | null = null;
  private chainType: ChainType;
  private solanaConnection!: Connection;

  constructor(chainType: ChainType, rpcUrl?: string) {
    this.chainType = chainType;
    if (chainType === 'solana') {
      this.solanaConnection = new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com');
    }
  }

  /**
   * Connects to the user's wallet
   * @returns Promise<UserAccount> The connected user account
   */
  async connect(): Promise<UserAccount> {
    try {
      if (this.chainType === 'ethereum') {
        return await this.connectEthereum();
      } else {
        return await this.connectSolana();
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect wallet: ${error.message}`);
      }
      throw new Error('Failed to connect wallet: Unknown error');
    }
  }

  /**
   * Gets the public address of the connected wallet
   * @returns string The public address
   */
  getPublicAddress(): string {
    if (!this.userAccount) {
      throw new Error('No wallet connected');
    }
    return this.userAccount.address;
  }

  /**
   * Signs and sends a deposit transaction
   * @param amount The amount to deposit
   * @returns Promise<TxReceipt> The transaction receipt
   */
  async signAndSendDepositTx(amount: number): Promise<TxReceipt> {
    if (!this.userAccount) {
      throw new Error('No wallet connected');
    }

    try {
      if (this.chainType === 'ethereum') {
        return await this.sendEthereumDeposit(amount);
      } else {
        return await this.sendSolanaDeposit(amount);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to send deposit: ${error.message}`);
      }
      throw new Error('Failed to send deposit: Unknown error');
    }
  }

  /**
   * Connects to an Ethereum wallet
   */
  private async connectEthereum(): Promise<UserAccount> {
    if (typeof (window as any).ethereum === 'undefined') {
      throw new Error('MetaMask not installed');
    }

    const provider = new ethers.providers.Web3Provider((window as any).ethereum);
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
      throw new Error('Failed to connect to Phantom wallet');
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
      throw new Error('Invalid wallet state');
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
      throw new Error('Invalid wallet state');
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
}
