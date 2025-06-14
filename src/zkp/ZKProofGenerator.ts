import { ShieldedNote } from '../core/NoteManager';
import * as snarkjs from 'snarkjs';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface TransferProofInput {
  inputNotes: ShieldedNote[];
  outputNote: ShieldedNote;
  viewKey: string;
}

export interface WithdrawProofInput {
  inputNotes: ShieldedNote[];
  recipientAddress: string;
  amount: bigint;
  viewKey: string;
}

export interface ReshieldProofInput {
  inputNotes: ShieldedNote[];
  amount: bigint;
  viewKey: string;
}

export interface ZKProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
  timestamp: number;
}

export class ZKProofGenerator {
  private readonly wasmBuffer: Buffer;
  private readonly zkeyBuffer: Buffer;
  private readonly verificationKey: any;

  constructor(
    wasmPath: string,
    zkeyPath: string,
    verificationKeyPath: string
  ) {
    try {
      this.wasmBuffer = readFileSync(wasmPath);
      this.zkeyBuffer = readFileSync(zkeyPath);
      this.verificationKey = JSON.parse(readFileSync(verificationKeyPath, 'utf8'));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load proof files: ${error.message}`);
      }
      throw new Error('Failed to load proof files: Unknown error');
    }
  }

  /**
   * Generates a zero-knowledge proof for a shielded transfer
   * @param input The input data for the proof generation
   * @returns The generated proof and public inputs
   */
  async generateTransferProof(input: TransferProofInput): Promise<ZKProof> {
    try {
      // Prepare witness
      const witness = {
        // Private inputs
        inAmount: input.inputNotes[0].amount.toString(),
        inNullifier: input.inputNotes[0].nullifier,
        inSecret: input.viewKey,
        inPathElements: input.inputNotes[0].merklePath.elements,
        inPathIndices: input.inputNotes[0].merklePath.indices,

        // Public inputs
        outCommitment: input.outputNote.commitment,
        merkleRoot: input.inputNotes[0].merkleRoot,
        recipientPubKey: input.outputNote.recipientPubKey
      };

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witness,
        this.wasmBuffer.toString(),
        this.zkeyBuffer.toString()
      );

      return {
        proof: {
          ...proof,
          curve: 'bn128' // Required by snarkjs type
        },
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate transfer proof: ${error.message}`);
      }
      throw new Error('Failed to generate transfer proof: Unknown error');
    }
  }

  /**
   * Generates a zero-knowledge proof for a withdrawal
   * @param input The input data for the proof generation
   * @returns The generated proof and public inputs
   */
  async generateWithdrawProof(input: WithdrawProofInput): Promise<ZKProof> {
    try {
      // Prepare witness
      const witness = {
        // Private inputs
        inAmount: input.amount.toString(),
        inNullifier: input.inputNotes[0].nullifier,
        inSecret: input.viewKey,
        inPathElements: input.inputNotes[0].merklePath.elements,
        inPathIndices: input.inputNotes[0].merklePath.indices,

        // Public inputs
        recipientAddress: input.recipientAddress,
        merkleRoot: input.inputNotes[0].merkleRoot
      };

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witness,
        this.wasmBuffer.toString(),
        this.zkeyBuffer.toString()
      );

      return {
        proof: {
          ...proof,
          curve: 'bn128' // Required by snarkjs type
        },
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate withdrawal proof: ${error.message}`);
      }
      throw new Error('Failed to generate withdrawal proof: Unknown error');
    }
  }

  /**
   * Generates a zero-knowledge proof for a reshield operation
   * @param input The input data for the proof generation
   * @returns The generated proof and public inputs
   */
  async generateReshieldProof(input: ReshieldProofInput): Promise<ZKProof> {
    try {
      // Prepare witness
      const witness = {
        // Private inputs
        inAmount: input.amount.toString(),
        inNullifier: input.inputNotes[0].nullifier,
        inSecret: input.viewKey,
        inPathElements: input.inputNotes[0].merklePath.elements,
        inPathIndices: input.inputNotes[0].merklePath.indices,

        // Public inputs
        merkleRoot: input.inputNotes[0].merkleRoot
      };

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witness,
        this.wasmBuffer.toString(),
        this.zkeyBuffer.toString()
      );

      return {
        proof: {
          ...proof,
          curve: 'bn128' // Required by snarkjs type
        },
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate reshield proof: ${error.message}`);
      }
      throw new Error('Failed to generate reshield proof: Unknown error');
    }
  }

  /**
   * Verifies a zero-knowledge proof
   * @param proof The proof to verify
   * @param publicSignals The public signals used in the proof
   * @returns boolean indicating if the proof is valid
   */
  async verifyProof(proof: ZKProof['proof'], publicSignals: string[]): Promise<boolean> {
    try {
      return await snarkjs.groth16.verify(
        this.verificationKey,
        publicSignals,
        proof
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to verify proof: ${error.message}`);
      }
      throw new Error('Failed to verify proof: Unknown error');
    }
  }
} 