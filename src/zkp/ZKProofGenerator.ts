import { ShieldedNote } from '../types/Note';
import * as snarkjs from 'snarkjs';
import { ZKProof, TransferProofInput, WithdrawProofInput, ReshieldProofInput } from '../types/ZKProof';
import { ErrorHandler, ErrorType, CipherPayError } from '../errors/ErrorHandler';

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

export interface ProofGeneratorConfig {
  wasmPath?: string;
  zkeyPath?: string;
  verificationKeyPath?: string;
  // Browser-compatible alternatives
  wasmBuffer?: ArrayBuffer;
  zkeyBuffer?: ArrayBuffer;
  verificationKey?: any;
}

export interface ProofGeneratorUrls {
  wasmUrl: string;
  zkeyUrl: string;
  verificationKeyUrl: string;
}

export class ZKProofGenerator {
  private readonly wasmBuffer: Uint8Array;
  private readonly zkeyBuffer: Uint8Array;
  private readonly verificationKey: any;

  constructor(config: ProofGeneratorConfig) {
    // Validate that we have the required data
    if (!config.wasmBuffer && !config.wasmPath) {
      throw new CipherPayError(
        'WASM buffer or path is required',
        ErrorType.MISSING_DEPENDENCY,
        { config },
        {
          action: 'Provide WASM data',
          description: 'WASM buffer or path is required for proof generation.'
        },
        false
      );
    }

    if (!config.zkeyBuffer && !config.zkeyPath) {
      throw new CipherPayError(
        'ZKey buffer or path is required',
        ErrorType.MISSING_DEPENDENCY,
        { config },
        {
          action: 'Provide ZKey data',
          description: 'ZKey buffer or path is required for proof generation.'
        },
        false
      );
    }

    if (!config.verificationKey && !config.verificationKeyPath) {
      throw new CipherPayError(
        'Verification key or path is required',
        ErrorType.MISSING_DEPENDENCY,
        { config },
        {
          action: 'Provide verification key data',
          description: 'Verification key or path is required for proof generation.'
        },
        false
      );
    }

    // Use provided buffers or load from paths
    this.wasmBuffer = config.wasmBuffer ? new Uint8Array(config.wasmBuffer) : this.loadBufferFromPath(config.wasmPath!);
    this.zkeyBuffer = config.zkeyBuffer ? new Uint8Array(config.zkeyBuffer) : this.loadBufferFromPath(config.zkeyPath!);
    this.verificationKey = config.verificationKey || this.loadVerificationKeyFromPath(config.verificationKeyPath!);
  }

  /**
   * Static factory method to create ZKProofGenerator from URLs (browser-friendly)
   */
  static async fromUrls(urls: ProofGeneratorUrls): Promise<ZKProofGenerator> {
    try {
      const [wasmResponse, zkeyResponse, verificationKeyResponse] = await Promise.all([
        fetch(urls.wasmUrl),
        fetch(urls.zkeyUrl),
        fetch(urls.verificationKeyUrl)
      ]);

      if (!wasmResponse.ok || !zkeyResponse.ok || !verificationKeyResponse.ok) {
        throw new Error('Failed to fetch proof files');
      }

      const [wasmArrayBuffer, zkeyArrayBuffer, verificationKey] = await Promise.all([
        wasmResponse.arrayBuffer(),
        zkeyResponse.arrayBuffer(),
        verificationKeyResponse.json()
      ]);

      return new ZKProofGenerator({
        wasmBuffer: wasmArrayBuffer,
        zkeyBuffer: zkeyArrayBuffer,
        verificationKey
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to load proof files from URLs: ${errorMessage}`,
        ErrorType.MISSING_DEPENDENCY,
        { urls },
        {
          action: 'Check URLs and network connectivity',
          description: 'Failed to load proof files from URLs. Please verify the URLs are correct and accessible.'
        },
        false
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Static factory method to create ZKProofGenerator from file paths (Node.js)
   */
  static fromFilePaths(wasmPath: string, zkeyPath: string, verificationKeyPath: string): ZKProofGenerator {
    if (isBrowser) {
      throw new Error('fromFilePaths is not supported in browser environment. Use fromUrls instead.');
    }

    if (!fs || !path) {
      throw new Error('Node.js file system modules not available');
    }

    return new ZKProofGenerator({
      wasmPath,
      zkeyPath,
      verificationKeyPath
    });
  }

  /**
   * Static factory method to create ZKProofGenerator from in-memory buffers
   */
  static fromBuffers(wasmBuffer: ArrayBuffer, zkeyBuffer: ArrayBuffer, verificationKey: any): ZKProofGenerator {
    return new ZKProofGenerator({
      wasmBuffer,
      zkeyBuffer,
      verificationKey
    });
  }

  /**
   * Loads a buffer from a file path (Node.js only)
   */
  private loadBufferFromPath(filePath: string): Uint8Array {
    if (isBrowser) {
      throw new Error('File paths are not supported in browser environment');
    }
    if (!fs) {
      throw new Error('Node.js file system not available');
    }

    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new CipherPayError(
        `Failed to load file from path: ${errorMessage}`,
        ErrorType.MISSING_DEPENDENCY,
        { filePath },
        {
          action: 'Check file path and permissions',
          description: 'Failed to load file from path. Please verify the file exists and is accessible.'
        },
        false
      );
    }
  }

  /**
   * Loads verification key from a file path (Node.js only)
   */
  private loadVerificationKeyFromPath(filePath: string): any {
    if (isBrowser) {
      throw new Error('File paths are not supported in browser environment');
    }
    if (!fs) {
      throw new Error('Node.js file system not available');
    }

    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new CipherPayError(
        `Failed to load verification key from path: ${errorMessage}`,
        ErrorType.MISSING_DEPENDENCY,
        { filePath },
        {
          action: 'Check file path and format',
          description: 'Failed to load verification key from path. Please verify the file exists and contains valid JSON.'
        },
        false
      );
    }
  }

  /**
   * Generates a transfer proof
   * @param input Transfer proof input
   * @returns ZK proof
   */
  async generateTransferProof(input: TransferProofInput): Promise<ZKProof> {
    try {
      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareTransferWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        this.wasmBuffer,
        this.zkeyBuffer
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
          inputNotesCount: input.inputNotes.length,
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
   * Generates a withdraw proof
   * @param input Withdraw proof input
   * @returns ZK proof
   */
  async generateWithdrawProof(input: WithdrawProofInput): Promise<ZKProof> {
    try {
      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareWithdrawWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        this.wasmBuffer,
        this.zkeyBuffer
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
          inputNotesCount: input.inputNotes.length,
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
   * Generates a reshield proof
   * @param input Reshield proof input
   * @returns ZK proof
   */
  async generateReshieldProof(input: ReshieldProofInput): Promise<ZKProof> {
    try {
      // Prepare witness inputs for the circuit
      const witnessInput = this.prepareReshieldWitness(input);

      // Generate proof using snarkjs
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        witnessInput,
        this.wasmBuffer,
        this.zkeyBuffer
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
          inputNotesCount: input.inputNotes.length,
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to verify proof: ${errorMessage}`,
        ErrorType.PROOF_VERIFICATION_FAILED,
        {
          publicSignalsCount: publicSignals.length,
          proofProtocol: proof.protocol,
          proofCurve: proof.curve
        },
        {
          action: 'Check proof and verification key',
          description: 'Failed to verify proof. Please verify the proof is valid and verification key is correct.'
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
} 