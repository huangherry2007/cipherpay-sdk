import { ShieldedNote } from './Note';

export interface ProofInput {
  inputNotes: ShieldedNote[];
  viewKey: string;
}

export interface TransferProofInput extends ProofInput {
  outputNote: ShieldedNote;
}

export interface WithdrawProofInput extends ProofInput {
  recipientAddress: string;
  amount: bigint;
}

export interface ReshieldProofInput extends ProofInput {
  amount: bigint;
}

export interface ProofOutput {
  proof: string;
  publicInputs: string[];
}

export interface ProofVerificationResult {
  isValid: boolean;
  error?: string;
}

export interface CircuitConfig {
  circuitPath: string;
  provingKeyPath: string;
  verificationKeyPath: string;
}

export interface WitnessInput {
  privateInputs: {
    [key: string]: string | number | bigint;
  };
  publicInputs: {
    [key: string]: string | number | bigint;
  };
}

/**
 * Represents a zero-knowledge proof
 */
export interface ZKProof {
    /**
     * The actual proof data
     */
    proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
    };
    
    /**
     * Public signals associated with the proof
     */
    publicSignals: string[];
    
    /**
     * Timestamp when the proof was generated
     */
    timestamp: number;
}

/**
 * Input data for generating a zero-knowledge proof
 */
export interface ZKInput {
    /**
     * The nullifier hash
     */
    nullifierHash: string;
    
    /**
     * The commitment hash
     */
    commitmentHash: string;
    
    /**
     * The recipient's public key
     */
    recipientPubKey: string;
    
    /**
     * The amount being transferred
     */
    amount: string;
    
    /**
     * The token address
     */
    tokenAddress: string;
    
    /**
     * The merkle root
     */
    merkleRoot: string;
    
    /**
     * The merkle path
     */
    merklePath: string[];
    
    /**
     * The merkle path indices
     */
    merklePathIndices: number[];
}
