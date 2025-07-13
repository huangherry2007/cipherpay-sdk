// Browser-compatible ZKProver
// Import only what we can safely use in the browser
import { ZKProof, ZKInput, ProofInput, TransferProofInput, WithdrawProofInput, ReshieldProofInput } from '../types/ZKProof';
import { ErrorHandler, ErrorType, CipherPayError } from '../errors/ErrorHandler';
import { globalRateLimiter } from '../utils/RateLimiter';

// Import snarkjs for all environments
import * as snarkjs from 'snarkjs';

// Browser-compatible file loading utilities
const isBrowser = typeof window !== 'undefined';

// Conditional imports for Node.js environment
let fs: any, path: any;
if (!isBrowser) {
  try {
    fs = require('fs');
    path = require('path');
  } catch (error) {
    console.warn('Node.js modules not available');
  }
}

export interface CircuitConfig {
  wasmPath?: string;
  zkeyPath?: string;
  verifierPath?: string;
  // Browser-compatible alternatives
  wasmBuffer?: ArrayBuffer;
  zkeyBuffer?: ArrayBuffer;
  verifierData?: any;
}

export interface CircuitUrls {
  wasmUrl: string;
  zkeyUrl: string;
  verifierUrl: string;
}

export class ZKProver {
  private circuitPath?: string;
  private circuitConfigs: Map<string, CircuitConfig>;

  constructor(circuitConfigs?: Map<string, CircuitConfig>, circuitPath?: string) {
    this.circuitPath = circuitPath;
    this.circuitConfigs = circuitConfigs || new Map();
  }

  /**
   * Static factory method to create ZKProver from URLs (browser-friendly)
   */
  static async fromUrls(urlMap: Record<string, CircuitUrls>): Promise<ZKProver> {
    const configs = new Map<string, CircuitConfig>();

    for (const [circuit, urls] of Object.entries(urlMap)) {
      try {
        const [wasmResponse, zkeyResponse, verifierResponse] = await Promise.all([
          fetch(urls.wasmUrl),
          fetch(urls.zkeyUrl),
          fetch(urls.verifierUrl)
        ]);

        if (!wasmResponse.ok || !zkeyResponse.ok || !verifierResponse.ok) {
          throw new Error(`Failed to fetch circuit files for ${circuit}`);
        }

        const [wasmBuffer, zkeyBuffer, verifierData] = await Promise.all([
          wasmResponse.arrayBuffer(),
          zkeyResponse.arrayBuffer(),
          verifierResponse.json()
        ]);

        configs.set(circuit, {
          wasmBuffer,
          zkeyBuffer,
          verifierData
        });
      } catch (error) {
        console.warn(`Failed to load circuit ${circuit}:`, error);
      }
    }

    return new ZKProver(configs);
  }

  /**
   * Static factory method to create ZKProver from file paths (Node.js)
   */
  static fromFilePaths(circuitPath?: string): ZKProver {
    if (isBrowser) {
      throw new Error('fromFilePaths is not supported in browser environment. Use fromUrls instead.');
    }

    if (!fs || !path) {
      throw new Error('Node.js file system modules not available');
    }

    const prover = new ZKProver(undefined, circuitPath);
    prover.circuitConfigs = prover.loadCircuitConfigsFromFiles();
    return prover;
  }

  /**
   * Static factory method to create ZKProver from in-memory buffers
   */
  static fromBuffers(circuitBuffers: Record<string, {
    wasmBuffer: ArrayBuffer;
    zkeyBuffer: ArrayBuffer;
    verifierData: any;
  }>): ZKProver {
    const configs = new Map<string, CircuitConfig>();

    for (const [circuit, buffers] of Object.entries(circuitBuffers)) {
      configs.set(circuit, {
        wasmBuffer: buffers.wasmBuffer,
        zkeyBuffer: buffers.zkeyBuffer,
        verifierData: buffers.verifierData
      });
    }

    return new ZKProver(configs);
  }

  /**
   * Loads circuit configurations from files (Node.js only)
   */
  private loadCircuitConfigsFromFiles(): Map<string, CircuitConfig> {
    if (isBrowser || !fs || !path) {
      return new Map();
    }

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
      const wasmPath = path.join(this.circuitPath || '', `${circuit}.wasm`);
      const zkeyPath = path.join(this.circuitPath || '', `${circuit}.zkey`);
      const verifierPath = path.join(this.circuitPath || '', `verifier-${circuit}.json`);

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
   * Loads circuit files for a specific circuit type
   */
  private async loadCircuitFiles(circuitType: string): Promise<{
    wasmBuffer: Uint8Array;
    zkeyBuffer: Uint8Array;
    verifierData: any;
  }> {
    const config = this.circuitConfigs.get(circuitType);
    if (!config) {
      throw new CipherPayError(
        `${circuitType} circuit configuration not found`,
        ErrorType.MISSING_DEPENDENCY,
        { circuitType },
        {
          action: 'Load circuit configuration',
          description: `${circuitType} circuit configuration is missing. Please ensure the circuit is properly configured.`
        },
        false
      );
    }

    // If we already have buffers, use them
    if (config.wasmBuffer && config.zkeyBuffer && config.verifierData) {
      return {
        wasmBuffer: new Uint8Array(config.wasmBuffer),
        zkeyBuffer: new Uint8Array(config.zkeyBuffer),
        verifierData: config.verifierData
      };
    }

    // If we have file paths, load them (Node.js only)
    if (config.wasmPath && config.zkeyPath && config.verifierPath) {
      if (isBrowser) {
        throw new Error('File paths are not supported in browser environment');
      }
      if (!fs) {
        throw new Error('Node.js file system not available');
      }

      const [wasmBuffer, zkeyBuffer, verifierData] = await Promise.all([
        fs.promises.readFile(config.wasmPath),
        fs.promises.readFile(config.zkeyPath),
        fs.promises.readFile(config.verifierPath, 'utf8').then((data: string) => JSON.parse(data))
      ]);

      return { wasmBuffer, zkeyBuffer, verifierData };
    }

    throw new CipherPayError(
      `Incomplete circuit configuration for ${circuitType}`,
      ErrorType.MISSING_DEPENDENCY,
      { circuitType, config },
      {
        action: 'Provide complete circuit configuration',
        description: `Circuit configuration for ${circuitType} is incomplete. Please provide either file paths or buffers.`
      },
      false
    );
  }

  /**
   * Generates a transfer proof using real snarkjs
   * @param input The transfer proof input
   * @returns Promise<ZKProof> The generated proof
   */
  async generateTransferProof(input: TransferProofInput): Promise<ZKProof> {
    // Apply rate limiting
    globalRateLimiter.consume('PROOF_GENERATION', {
      proofType: 'transfer',
      inputNotesCount: input.inputNotes.length,
      userId: input.viewKey ? 'authenticated' : 'anonymous'
    });

    try {
      // Use snarkjs for all environments
      if (!snarkjs) {
        throw new Error('snarkjs not available');
      }

      const { wasmBuffer, zkeyBuffer } = await this.loadCircuitFiles('transfer');

      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareTransferWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        wasmBuffer,
        zkeyBuffer
      );

      return {
        proof,
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to generate transfer proof: ${errorMessage}`,
        ErrorType.PROOF_GENERATION_FAILED,
        {
          circuitType: 'transfer',
          inputNotes: input.inputNotes.length,
          outputNote: 'present'
        },
        {
          action: 'Check circuit files and inputs',
          description: 'Failed to generate transfer proof. Please verify circuit files are available and inputs are valid.'
        },
        true
      );

      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Generates a withdraw proof using real snarkjs
   * @param input The withdraw proof input
   * @returns Promise<ZKProof> The generated proof
   */
  async generateWithdrawProof(input: WithdrawProofInput): Promise<ZKProof> {
    // Apply rate limiting
    globalRateLimiter.consume('PROOF_GENERATION', {
      proofType: 'withdraw',
      inputNotesCount: input.inputNotes.length,
      userId: input.viewKey ? 'authenticated' : 'anonymous'
    });

    try {
      // Use snarkjs for all environments
      if (!snarkjs) {
        throw new Error('snarkjs not available');
      }

      const { wasmBuffer, zkeyBuffer } = await this.loadCircuitFiles('withdraw');

      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareWithdrawWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        wasmBuffer,
        zkeyBuffer
      );

      return {
        proof,
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to generate withdraw proof: ${errorMessage}`,
        ErrorType.PROOF_GENERATION_FAILED,
        {
          circuitType: 'withdraw',
          inputNotes: input.inputNotes.length,
          recipientAddress: input.recipientAddress
        },
        {
          action: 'Check circuit files and inputs',
          description: 'Failed to generate withdraw proof. Please verify circuit files are available and inputs are valid.'
        },
        true
      );

      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Generates a reshield proof using real snarkjs
   * @param input The reshield proof input
   * @returns Promise<ZKProof> The generated proof
   */
  async generateReshieldProof(input: ReshieldProofInput): Promise<ZKProof> {
    // Apply rate limiting
    globalRateLimiter.consume('PROOF_GENERATION', {
      proofType: 'reshield',
      inputNotesCount: input.inputNotes.length,
      userId: input.viewKey ? 'authenticated' : 'anonymous'
    });

    try {
      const { wasmBuffer, zkeyBuffer } = await this.loadCircuitFiles('transfer'); // Reshield uses transfer circuit

      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareReshieldWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        wasmBuffer,
        zkeyBuffer
      );

      return {
        proof,
        publicSignals,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to generate reshield proof: ${errorMessage}`,
        ErrorType.PROOF_GENERATION_FAILED,
        {
          circuitType: 'transfer', // Reshield uses transfer circuit
          inputNotes: input.inputNotes.length,
          outputNote: 'present'
        },
        {
          action: 'Check circuit files and inputs',
          description: 'Failed to generate reshield proof. Please verify circuit files are available and inputs are valid.'
        },
        true
      );

      throw ErrorHandler.getInstance().handleError(cipherPayError);
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
    // Apply rate limiting for proof verification
    globalRateLimiter.consume('PROOF_GENERATION', {
      operation: 'verify',
      circuitType,
      publicInputsCount: publicInputs.length
    });

    try {
      // Use snarkjs for all environments
      if (!snarkjs) {
        throw new Error('snarkjs not available');
      }

      const { verifierData } = await this.loadCircuitFiles(circuitType);

      // Add curve property to proof if missing
      const proofWithCurve = {
        ...proof.proof,
        curve: proof.proof.curve || 'bn128'
      };

      // Verify the proof using snarkjs
      const isValid = await snarkjs.groth16.verify(verifierData, publicInputs, proofWithCurve);

      return isValid;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to verify proof: ${errorMessage}`,
        ErrorType.PROOF_VERIFICATION_FAILED,
        {
          circuitType,
          publicInputsCount: publicInputs.length,
          proofTimestamp: proof.timestamp
        },
        {
          action: 'Check proof and circuit files',
          description: 'Failed to verify proof. Please verify the proof is valid and circuit files are available.'
        },
        true
      );

      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Prepares witness inputs for transfer proof generation
   */
  private prepareTransferWitness(input: TransferProofInput): any {
    // This is a simplified witness preparation
    // In a real implementation, this would include proper circuit-specific witness generation
    return {
      inputNotes: input.inputNotes.map(note => ({
        commitment: note.commitment,
        nullifier: note.nullifier,
        amount: note.amount,
        recipientAddress: note.recipientAddress
      })),
      outputNote: {
        commitment: input.outputNote.commitment,
        amount: input.outputNote.amount,
        recipientAddress: input.outputNote.recipientAddress
      },
      viewKey: input.viewKey || '0x0000000000000000000000000000000000000000000000000000000000000000'
    };
  }

  /**
   * Prepares witness inputs for withdraw proof generation
   */
  private prepareWithdrawWitness(input: WithdrawProofInput): any {
    return {
      inputNotes: input.inputNotes.map(note => ({
        commitment: note.commitment,
        nullifier: note.nullifier,
        amount: note.amount,
        recipientAddress: note.recipientAddress
      })),
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      viewKey: input.viewKey || '0x0000000000000000000000000000000000000000000000000000000000000000'
    };
  }

  /**
   * Prepares witness inputs for reshield proof generation
   */
  private prepareReshieldWitness(input: ReshieldProofInput): any {
    return {
      inputNotes: input.inputNotes.map(note => ({
        commitment: note.commitment,
        nullifier: note.nullifier,
        amount: note.amount,
        recipientAddress: note.recipientAddress
      })),
      amount: input.amount,
      viewKey: input.viewKey || '0x0000000000000000000000000000000000000000000000000000000000000000'
    };
  }

  /**
   * Gets available circuit types
   */
  getAvailableCircuits(): string[] {
    return Array.from(this.circuitConfigs.keys());
  }

  /**
   * Checks if a circuit type is available
   */
  isCircuitAvailable(circuitType: string): boolean {
    return this.circuitConfigs.has(circuitType);
  }
} 