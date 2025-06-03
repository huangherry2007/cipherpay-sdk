import { ethers } from 'ethers';
import { NoteManager, ShieldedNote } from '../core/NoteManager';
import { ViewKeyManager } from '../core/ViewKeyManager';
import { ChainType } from '../core/WalletProvider';
import { ZKProofGenerator } from '../zkp/ZKProofGenerator';

export interface EncryptedTx {
  proof: string;
  publicInputs: string[];
  encryptedNote: string;
  recipientAddress: string;
  amount: string;
  chainType: ChainType;
  metadata?: {
    gasLimit?: string;
    maxFeePerGas?: string;
    priorityFee?: string;
  };
}

export interface TransferParams {
  recipientPubKey: string;
  amount: bigint;
  chainType: ChainType;
  gasLimit?: string;
  maxFeePerGas?: string;
  priorityFee?: string;
}

export class TransactionBuilder {
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
   * Builds a shielded transfer transaction
   * @param params Transfer parameters including recipient and amount
   * @returns Encrypted transaction data
   */
  async buildTransfer(params: TransferParams): Promise<EncryptedTx> {
    const { recipientPubKey, amount, gasLimit, maxFeePerGas, priorityFee } = params;

    // Get spendable notes
    const spendableNotes = this.noteManager.getSpendableNotes();
    if (spendableNotes.length === 0) {
      throw new Error('No spendable notes available');
    }

    // Calculate total available balance
    const totalBalance = this.noteManager.getBalance();
    if (totalBalance < amount) {
      throw new Error('Insufficient balance for transfer');
    }

    // Select notes to spend (simple implementation - can be optimized)
    const selectedNotes = this.selectNotesToSpend(spendableNotes, amount);
    
    // Generate proof inputs
    const proofInputs = await this.generateProofInputs(selectedNotes, amount, recipientPubKey);

    // Generate zero-knowledge proof using external circuit
    const { proof, publicInputs } = await this.zkProofGenerator.generateTransferProof({
      inputNotes: selectedNotes,
      outputNote: {
        commitment: proofInputs.newNoteCommitment,
        nullifier: proofInputs.newNoteNullifier,
        amount: amount,
        encryptedNote: '',
        spent: false,
        timestamp: Date.now(),
        recipientAddress: recipientPubKey
      },
      viewKey: this.viewKeyManager.exportViewKey()
    });

    // Encrypt note for recipient
    const encryptedNote = this.noteManager.encryptNote(
      {
        commitment: proofInputs.newNoteCommitment,
        nullifier: proofInputs.newNoteNullifier,
        amount: amount,
        encryptedNote: '',
        spent: false,
        timestamp: Date.now(),
        recipientAddress: recipientPubKey
      },
      recipientPubKey
    );

    return {
      proof,
      publicInputs,
      encryptedNote: encryptedNote.ciphertext,
      recipientAddress: recipientPubKey,
      amount: amount.toString(),
      chainType: this.chainType,
      metadata: {
        gasLimit,
        maxFeePerGas,
        priorityFee
      }
    };
  }

  /**
   * Selects notes to spend based on the required amount
   * @param notes Available notes
   * @param amount Required amount
   * @returns Selected notes to spend
   */
  private selectNotesToSpend(notes: ShieldedNote[], amount: bigint): ShieldedNote[] {
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

  /**
   * Generates proof inputs for the transaction
   * @param inputNotes Notes being spent
   * @param amount Transfer amount
   * @param recipientPubKey Recipient's public key
   * @returns Proof inputs including commitment and nullifier
   */
  private async generateProofInputs(
    inputNotes: ShieldedNote[],
    amount: bigint,
    recipientPubKey: string
  ): Promise<{
    newNoteCommitment: string;
    newNoteNullifier: string;
  }> {
    // Generate new note commitment
    const newNoteCommitment = ethers.utils.keccak256(
      ethers.utils.concat([
        recipientPubKey,
        ethers.utils.defaultAbiCoder.encode(['uint256'], [amount])
      ])
    );

    // Generate new note nullifier
    const newNoteNullifier = ethers.utils.keccak256(
      ethers.utils.concat([
        newNoteCommitment,
        this.viewKeyManager.exportViewKey()
      ])
    );

    return {
      newNoteCommitment,
      newNoteNullifier
    };
  }
}
