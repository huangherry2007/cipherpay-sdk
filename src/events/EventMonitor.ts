import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { ChainType } from '../core/WalletProvider';
import { ShieldedNote } from '../core/NoteManager';
import { ErrorHandler, ErrorType, ErrorContext } from '../errors/ErrorHandler';

export interface EventConfig {
  chainType: ChainType;
  rpcUrl: string;
  contractAddress?: string;  // For Ethereum
  programId?: string;        // For Solana
  startBlock?: number;       // For Ethereum
  startSlot?: number;        // For Solana
}

export interface ShieldedTransferEvent {
  type: 'shielded_transfer';
  from: string;
  to: string;
  amount: string;
  commitment: string;
  nullifier: string;
  timestamp: number;
  blockNumber?: number;
  slot?: number;
}

export interface NoteSpentEvent {
  type: 'note_spent';
  nullifier: string;
  timestamp: number;
  blockNumber?: number;
  slot?: number;
}

export type ShieldedEvent = ShieldedTransferEvent | NoteSpentEvent;

export type EventCallback = (event: ShieldedEvent) => void;

export class EventMonitor {
  private readonly config: EventConfig;
  private readonly provider: ethers.providers.JsonRpcProvider | null;
  private readonly solanaConnection: Connection | null;
  private readonly callbacks: Map<string, EventCallback[]>;
  private readonly errorHandler: ErrorHandler;
  private isMonitoring: boolean;
  private lastProcessedBlock: number;
  private lastProcessedSlot: number;

  constructor(config: EventConfig) {
    this.config = config;
    this.callbacks = new Map();
    this.isMonitoring = false;
    this.lastProcessedBlock = config.startBlock || 0;
    this.lastProcessedSlot = config.startSlot || 0;
    this.errorHandler = new ErrorHandler();

    if (config.chainType === 'ethereum') {
      this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      this.solanaConnection = null;
    } else {
      this.provider = null;
      this.solanaConnection = new Connection(config.rpcUrl);
    }
  }

  /**
   * Starts monitoring for events
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    if (this.config.chainType === 'ethereum') {
      await this.monitorEthereumEvents();
    } else {
      await this.monitorSolanaEvents();
    }
  }

  /**
   * Stops monitoring for events
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
  }

  /**
   * Registers a callback for a specific event type
   * @param eventType The type of event to listen for
   * @param callback The callback function
   */
  on(eventType: ShieldedEvent['type'], callback: EventCallback): void {
    const callbacks = this.callbacks.get(eventType) || [];
    callbacks.push(callback);
    this.callbacks.set(eventType, callbacks);
  }

  /**
   * Removes a callback for a specific event type
   * @param eventType The type of event
   * @param callback The callback function to remove
   */
  off(eventType: ShieldedEvent['type'], callback: EventCallback): void {
    const callbacks = this.callbacks.get(eventType) || [];
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
      this.callbacks.set(eventType, callbacks);
    }
  }

  /**
   * Monitors Ethereum events
   */
  private async monitorEthereumEvents(): Promise<void> {
    if (!this.provider || !this.config.contractAddress) {
      throw new Error('Ethereum provider or contract address not initialized');
    }

    const contract = new ethers.Contract(
      this.config.contractAddress,
      [
        'event ShieldedTransfer(address indexed from, address indexed to, uint256 amount, bytes32 commitment, bytes32 nullifier)',
        'event NoteSpent(bytes32 indexed nullifier)'
      ],
      this.provider
    );

    while (this.isMonitoring) {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        
        if (currentBlock > this.lastProcessedBlock) {
          // Get events from the last processed block to the current block
          const transferEvents = await contract.queryFilter(
            contract.filters.ShieldedTransfer(),
            this.lastProcessedBlock,
            currentBlock
          );

          const spentEvents = await contract.queryFilter(
            contract.filters.NoteSpent(),
            this.lastProcessedBlock,
            currentBlock
          );

          // Process transfer events
          for (const event of transferEvents) {
            try {
              const args = (event.args as unknown) as {
                from: string;
                to: string;
                amount: ethers.BigNumber;
                commitment: string;
                nullifier: string;
              };
              const transferEvent: ShieldedTransferEvent = {
                type: 'shielded_transfer',
                from: args.from,
                to: args.to,
                amount: args.amount.toString(),
                commitment: args.commitment,
                nullifier: args.nullifier,
                timestamp: (await event.getBlock()).timestamp,
                blockNumber: event.blockNumber
              };

              this.emit('shielded_transfer', transferEvent);
            } catch (error) {
              await this.errorHandler.handleError(error as Error, {
                chainType: 'ethereum',
                operation: 'process_transfer_event',
                details: { event },
                timestamp: Date.now()
              });
            }
          }

          // Process spent events
          for (const event of spentEvents) {
            try {
              const args = (event.args as unknown) as {
                nullifier: string;
              };
              const spentEvent: NoteSpentEvent = {
                type: 'note_spent',
                nullifier: args.nullifier,
                timestamp: (await event.getBlock()).timestamp,
                blockNumber: event.blockNumber
              };

              this.emit('note_spent', spentEvent);
            } catch (error) {
              await this.errorHandler.handleError(error as Error, {
                chainType: 'ethereum',
                operation: 'process_spent_event',
                details: { event },
                timestamp: Date.now()
              });
            }
          }

          this.lastProcessedBlock = currentBlock;
        }

        // Wait for new blocks
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        await this.errorHandler.handleError(error as Error, {
          chainType: 'ethereum',
          operation: 'monitor_ethereum_events',
          details: { lastProcessedBlock: this.lastProcessedBlock },
          timestamp: Date.now()
        });
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Monitors Solana events
   */
  private async monitorSolanaEvents(): Promise<void> {
    if (!this.solanaConnection || !this.config.programId) {
      throw new Error('Solana connection or program ID not initialized');
    }

    const programId = new PublicKey(this.config.programId);

    while (this.isMonitoring) {
      try {
        const currentSlot = await this.solanaConnection.getSlot();
        
        if (currentSlot > this.lastProcessedSlot) {
          // TODO: Implement Solana event monitoring
          // This would involve:
          // 1. Getting program logs for the relevant slots
          // 2. Parsing the logs to extract events
          // 3. Converting the events to our ShieldedEvent format
          // 4. Emitting the events

          this.lastProcessedSlot = currentSlot;
        }

        // Wait for new slots
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        await this.errorHandler.handleError(error as Error, {
          chainType: 'solana',
          operation: 'monitor_solana_events',
          details: { lastProcessedSlot: this.lastProcessedSlot },
          timestamp: Date.now()
        });
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Emits an event to all registered callbacks
   * @param eventType The type of event
   * @param event The event data
   */
  private emit(eventType: ShieldedEvent['type'], event: ShieldedEvent): void {
    const callbacks = this.callbacks.get(eventType) || [];
    for (const callback of callbacks) {
      try {
        callback(event);
      } catch (error) {
        this.errorHandler.handleError(error as Error, {
          chainType: this.config.chainType,
          operation: 'event_callback',
          details: { eventType, event },
          timestamp: Date.now()
        });
      }
    }
  }
} 