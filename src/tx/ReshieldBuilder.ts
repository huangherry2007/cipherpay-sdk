import { ethers } from 'ethers';
import { NoteManager, ShieldedNote } from '../core/NoteManager';
import { ViewKeyManager } from '../core/ViewKeyManager';
import { ChainType } from '../core/WalletProvider';
import { ZKProofGenerator } from '../zkp/ZKProofGenerator';

export interface ReshieldRequest {
  amount: bigint;
  chainType: ChainType;
  gasLimit?: string;
  maxFeePerGas?: string;
  priorityFee?: string;
}

export interface ReshieldResult {
  success: boolean;
  txHash?: string;
  error?: string;
  proof?: any;
}

export class ReshieldBuilder {
  private readonly noteManager: NoteManager;
  private readonly viewKeyManager: ViewKeyManager;
  private readonly zkProofGenerator: ZKProofGenerator;
  private readonly chainType: ChainType;

  constructor(
    noteManager: NoteManager,
    viewKeyManager: ViewKeyManager,
    zkProofGenerator: ZKProofGenerator,
    chainType: ChainType
  ) {
    this.noteManager = noteManager;
    this.viewKeyManager = viewKeyManager;
    this.zkProofGenerator = zkProofGenerator;
    this.chainType = chainType;
  }

  /**
   * Builds a reshield transaction
   * @param request Reshield request parameters
   * @returns Reshield result
   */
  async buildReshield(request: ReshieldRequest): Promise<ReshieldResult> {
    try {
      // Get spendable notes
      const spendableNotes = this.noteManager.getSpendableNotes();
      if (spendableNotes.length === 0) {
        return {
          success: false,
          error: 'No spendable notes available'
        };
      }

      // Check balance
      const totalBalance = this.noteManager.getBalance();
      if (totalBalance < request.amount) {
        return {
          success: false,
          error: 'Insufficient balance for reshield'
        };
      }

      // Select notes to spend
      const selectedNotes = this.selectNotesToReshield(spendableNotes, request.amount);

      // Generate proof
      const proof = await this.zkProofGenerator.generateReshieldProof({
        inputNotes: selectedNotes,
        amount: request.amount,
        viewKey: this.viewKeyManager.exportViewKey()
      });

      return {
        success: true,
        proof
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Reshield failed: ${errorMessage}`
      };
    }
  }

  /**
   * Selects notes to reshield based on the required amount
   * @param notes Available notes
   * @param amount Required amount
   * @returns Selected notes to reshield
   */
  private selectNotesToReshield(notes: ShieldedNote[], amount: bigint): ShieldedNote[] {
    // Sort notes by amount in descending order
    const sortedNotes = [...notes].sort((a, b) => 
      b.amount > a.amount ? 1 : -1
    );

    const selectedNotes: ShieldedNote[] = [];
    let remainingAmount = amount;

    for (const note of sortedNotes) {
      if (remainingAmount <= BigInt(0)) break;
      
      selectedNotes.push(note);
      remainingAmount -= note.amount;
    }

    if (remainingAmount > BigInt(0)) {
      throw new Error('Insufficient balance in selected notes');
    }

    return selectedNotes;
  }
} 