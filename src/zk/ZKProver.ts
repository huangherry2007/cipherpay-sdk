/*
generateTransferProof(input: ZKInput): ZKProof
verifyProof(proof: ZKProof): boolean
*/

// src/zk/ZKProver.ts
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { ZKProof, ZKInput } from '../types/ZKProof';

/**
 * ZKProver class for generating and verifying zero-knowledge proofs
 */
export class ZKProver {
    private wasmBuffer: Buffer;
    private zkeyBuffer: Buffer;

    /**
     * Creates a new ZKProver instance
     * @param wasmPath Path to the WebAssembly file
     * @param zkeyPath Path to the zkey file
     * @throws Error if files cannot be read
     */
    constructor(
        private readonly wasmPath: string,
        private readonly zkeyPath: string
    ) {
        try {
            this.wasmBuffer = fs.readFileSync(path.resolve(wasmPath));
            this.zkeyBuffer = fs.readFileSync(path.resolve(zkeyPath));
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Failed to load proof files: ${error.message}`);
            }
            throw new Error('Failed to load proof files: Unknown error');
        }
    }

    /**
     * Generates a zero-knowledge proof for a transfer
     * @param input The input data for the proof
     * @returns The generated proof and public signals
     * @throws Error if proof generation fails
     */
    async generateTransferProof(input: ZKInput): Promise<ZKProof> {
        try {
            // Calculate witness
            const witness = await snarkjs.wtns.calculate(input, this.wasmBuffer);
            
            // Generate proof
            const { proof, publicSignals } = await snarkjs.groth16.prove(
                this.zkeyBuffer,
                witness
            );

            return {
                proof,
                publicSignals,
                timestamp: Date.now()
            };
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Failed to generate transfer proof: ${error.message}`);
            }
            throw new Error('Failed to generate transfer proof: Unknown error');
        }
    }

    /**
     * Verifies a zero-knowledge proof
     * @param proof The proof to verify
     * @param publicSignals The public signals associated with the proof
     * @param verifierKey The verifier key for the circuit
     * @returns True if the proof is valid, false otherwise
     * @throws Error if verification fails
     */
    async verifyProof(
        proof: ZKProof['proof'],
        publicSignals: string[],
        verifierKey: any
    ): Promise<boolean> {
        try {
            return await snarkjs.groth16.verify(verifierKey, publicSignals, proof);
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Failed to verify proof: ${error.message}`);
            }
            throw new Error('Failed to verify proof: Unknown error');
        }
    }

    /**
     * Loads a verifier key from a file
     * @param verifierKeyPath Path to the verifier key file
     * @returns The loaded verifier key
     * @throws Error if file cannot be read
     */
    static async loadVerifierKey(verifierKeyPath: string): Promise<any> {
        try {
            const verifierKeyBuffer = fs.readFileSync(path.resolve(verifierKeyPath));
            return JSON.parse(verifierKeyBuffer.toString());
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new Error(`Failed to load verifier key: ${error.message}`);
            }
            throw new Error('Failed to load verifier key: Unknown error');
        }
    }
}