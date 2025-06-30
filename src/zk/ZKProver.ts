import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';
import { ZKProof, ZKInput, ProofInput, TransferProofInput, WithdrawProofInput, ReshieldProofInput } from '../types/ZKProof';

export interface CircuitConfig {
  wasmPath: string;
  zkeyPath: string;
  verifierPath: string;
}

export class ZKProver {
  private circuitPath: string;
  private circuitConfigs: Map<string, CircuitConfig>;

  constructor(circuitPath?: string) {
    this.circuitPath = circuitPath || path.join(__dirname, 'circuits');
    this.circuitConfigs = this.loadCircuitConfigs();
  }

  /**
   * Loads circuit configurations for all available circuits
   */
  private loadCircuitConfigs(): Map<string, CircuitConfig> {
    const configs = new Map<string, CircuitConfig>();
    
    const circuits = [
      'transfer',
      'merkle', 
      'nullifier',
      'zkStream',
      'zkSplit',
      'zkCondition',
      'audit_proof',
      'withdraw'
    ];

    circuits.forEach(circuit => {
      const wasmPath = path.join(this.circuitPath, `${circuit}.wasm`);
      const zkeyPath = path.join(this.circuitPath, `${circuit}.zkey`);
      const verifierPath = path.join(this.circuitPath, `verifier-${circuit}.json`);

      // Check if files exist
      if (fs.existsSync(wasmPath) && fs.existsSync(zkeyPath) && fs.existsSync(verifierPath)) {
        configs.set(circuit, {
          wasmPath,
          zkeyPath,
          verifierPath
        });
      }
    });

    return configs;
  }

  /**
   * Generates a transfer proof using real snarkjs
   * @param input The transfer proof input
   * @returns Promise<ZKProof> The generated proof
   */
  async generateTransferProof(input: TransferProofInput): Promise<ZKProof> {
    try {
      const config = this.circuitConfigs.get('transfer');
      if (!config) {
        throw new Error('Transfer circuit files not found');
      }

      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareTransferWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        config.wasmPath,
        config.zkeyPath
      );

      return {
        proof,
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate transfer proof: ${errorMessage}`);
    }
  }

  /**
   * Generates a withdraw proof using real snarkjs
   * @param input The withdraw proof input
   * @returns Promise<ZKProof> The generated proof
   */
  async generateWithdrawProof(input: WithdrawProofInput): Promise<ZKProof> {
    try {
      const config = this.circuitConfigs.get('withdraw');
      if (!config) {
        throw new Error('Withdraw circuit files not found');
      }

      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareWithdrawWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        config.wasmPath,
        config.zkeyPath
      );

      return {
        proof,
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate withdraw proof: ${errorMessage}`);
    }
  }

  /**
   * Generates a reshield proof using real snarkjs
   * @param input The reshield proof input
   * @returns Promise<ZKProof> The generated proof
   */
  async generateReshieldProof(input: ReshieldProofInput): Promise<ZKProof> {
    try {
      const config = this.circuitConfigs.get('transfer'); // Reshield uses transfer circuit
      if (!config) {
        throw new Error('Transfer circuit files not found');
      }

      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareReshieldWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        config.wasmPath,
        config.zkeyPath
      );

      return {
        proof,
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate reshield proof: ${errorMessage}`);
    }
  }

  /**
   * Verifies a zero-knowledge proof using real snarkjs
   * @param proof The proof to verify
   * @param publicInputs The public inputs
   * @param circuitType The type of circuit used
   * @returns Promise<boolean> Whether the proof is valid
   */
  async verifyProof(proof: ZKProof, publicInputs: string[], circuitType: string = 'transfer'): Promise<boolean> {
    try {
      const config = this.circuitConfigs.get(circuitType);
      if (!config) {
        throw new Error(`${circuitType} circuit files not found`);
      }

      // Load verification key
      const verificationKey = JSON.parse(fs.readFileSync(config.verifierPath, 'utf8'));

      // Add curve property to proof if missing
      const proofWithCurve = {
        ...proof.proof,
        curve: proof.proof.curve || 'bn128'
      };

      // Verify the proof using snarkjs
      const isValid = await snarkjs.groth16.verify(verificationKey, publicInputs, proofWithCurve);
      
      return isValid;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to verify proof: ${errorMessage}`);
    }
  }

  /**
   * Prepares witness inputs for transfer circuit
   */
  private prepareTransferWitness(input: TransferProofInput): any {
    // This is a simplified witness preparation
    // In a real implementation, this would match the exact circuit input format
    return {
      // Input notes
      inputNote1Amount: input.inputNotes[0].amount.toString(),
      inputNote1Nullifier: input.inputNotes[0].nullifier,
      inputNote1Commitment: input.inputNotes[0].commitment,
      
      // Output note
      outputNoteAmount: input.outputNote.amount.toString(),
      outputNoteCommitment: input.outputNote.commitment,
      outputNoteNullifier: input.outputNote.nullifier,
      
      // Public inputs
      recipientAddress: input.outputNote.recipientAddress,
      
      // Private inputs
      viewKey: input.viewKey,
      randomSeed: Math.floor(Math.random() * 1000000).toString()
    };
  }

  /**
   * Prepares witness inputs for withdraw circuit
   */
  private prepareWithdrawWitness(input: WithdrawProofInput): any {
    return {
      // Input notes
      inputNote1Amount: input.inputNotes[0].amount.toString(),
      inputNote1Nullifier: input.inputNotes[0].nullifier,
      inputNote1Commitment: input.inputNotes[0].commitment,
      
      // Withdrawal details
      withdrawAmount: input.amount.toString(),
      recipientAddress: input.recipientAddress,
      
      // Private inputs
      viewKey: input.viewKey,
      randomSeed: Math.floor(Math.random() * 1000000).toString()
    };
  }

  /**
   * Prepares witness inputs for reshield circuit
   */
  private prepareReshieldWitness(input: ReshieldProofInput): any {
    return {
      // Input note
      inputNoteAmount: input.inputNotes[0].amount.toString(),
      inputNoteNullifier: input.inputNotes[0].nullifier,
      inputNoteCommitment: input.inputNotes[0].commitment,
      
      // Reshield details
      reshieldAmount: input.amount.toString(),
      
      // Private inputs
      viewKey: input.viewKey,
      randomSeed: Math.floor(Math.random() * 1000000).toString()
    };
  }

  /**
   * Gets available circuit types
   */
  getAvailableCircuits(): string[] {
    return Array.from(this.circuitConfigs.keys());
  }

  /**
   * Checks if a circuit is available
   */
  isCircuitAvailable(circuitType: string): boolean {
    return this.circuitConfigs.has(circuitType);
  }
} 