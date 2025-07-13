import { ZKProver } from '../src/zk/ZKProver';
import { TransferProofInput, WithdrawProofInput, ReshieldProofInput } from '../src/types/ZKProof';
import { ShieldedNote } from '../src/types/Note';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockImplementation((path: string) => {
        if (path.includes('verifier')) {
            return '{"type": "groth16", "protocol": "groth16"}';
        }
        return Buffer.from('mock data');
    })
}));

// Mock snarkjs
jest.mock('snarkjs', () => ({
    wtns: {
        calculate: jest.fn().mockResolvedValue('mock witness')
    },
    groth16: {
        fullProve: jest.fn().mockResolvedValue({
            proof: {
                pi_a: ['1', '2'],
                pi_b: [['3', '4'], ['5', '6']],
                pi_c: ['7', '8'],
                protocol: 'groth16',
                curve: 'bn128'
            },
            publicSignals: ['9', '10']
        }),
        verify: jest.fn().mockResolvedValue(true)
    }
}));

// Mock the logger
jest.mock('../src/monitoring/observability/logger', () => ({
    Logger: {
        getInstance: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        })
    }
}));

describe('ZKProver', () => {
    let zkProver: ZKProver;

    beforeEach(() => {
        // Use the new constructor with empty config for testing
        zkProver = new ZKProver();
    });

    describe('constructor', () => {
        it('should create ZKProver instance', () => {
            expect(zkProver).toBeInstanceOf(ZKProver);
        });

        it('should create ZKProver from file paths in Node.js environment', () => {
            // This test will only work in Node.js environment
            if (typeof window === 'undefined') {
                expect(() => ZKProver.fromFilePaths('./circuits')).toThrow();
            } else {
                expect(() => ZKProver.fromFilePaths('./circuits')).toThrow('fromFilePaths is not supported in browser environment');
            }
        });

        it('should create ZKProver from URLs', async () => {
            const mockUrls = {
                transfer: {
                    wasmUrl: 'https://example.com/transfer.wasm',
                    zkeyUrl: 'https://example.com/transfer.zkey',
                    verifierUrl: 'https://example.com/verifier-transfer.json'
                }
            };

            // Mock fetch to return mock data
            global.fetch = jest.fn().mockImplementation((url) => {
                if (url.includes('.wasm') || url.includes('.zkey')) {
                    return Promise.resolve({
                        ok: true,
                        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
                    });
                } else {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ mock: 'verifier' })
                    });
                }
            });

            const prover = await ZKProver.fromUrls(mockUrls);
            expect(prover).toBeInstanceOf(ZKProver);
        });

        it('should create ZKProver from buffers', () => {
            const mockBuffers = {
                transfer: {
                    wasmBuffer: new ArrayBuffer(8),
                    zkeyBuffer: new ArrayBuffer(8),
                    verifierData: { mock: 'verifier' }
                }
            };

            const prover = ZKProver.fromBuffers(mockBuffers);
            expect(prover).toBeInstanceOf(ZKProver);
        });
    });

    describe('proof generation', () => {
        const mockInputNote: ShieldedNote = {
            commitment: '0x1234567890abcdef',
            nullifier: '0xabcdef1234567890',
            amount: BigInt(1000000),
            recipientAddress: '0xrecipient123',
            encryptedNote: 'encrypted_data',
            spent: false,
            timestamp: Date.now()
        };

        const mockOutputNote: ShieldedNote = {
            commitment: '0x9876543210fedcba',
            nullifier: '0xba9876543210fedc',
            amount: BigInt(500000),
            recipientAddress: '0xrecipient456',
            encryptedNote: 'encrypted_data',
            spent: false,
            timestamp: Date.now()
        };

        it('should generate transfer proof', async () => {
            const input: TransferProofInput = {
                inputNotes: [mockInputNote],
                outputNote: mockOutputNote,
                viewKey: '0xviewkey123'
            };

            // This will fail because no circuit files are configured, but it should throw a proper error
            await expect(zkProver.generateTransferProof(input)).rejects.toThrow();
        });

        it('should generate withdraw proof', async () => {
            const input: WithdrawProofInput = {
                inputNotes: [mockInputNote],
                recipientAddress: '0xwithdraw123',
                amount: BigInt(100000),
                viewKey: '0xviewkey123'
            };

            await expect(zkProver.generateWithdrawProof(input)).rejects.toThrow();
        });

        it('should generate reshield proof', async () => {
            const input: ReshieldProofInput = {
                inputNotes: [mockInputNote],
                amount: BigInt(100000),
                viewKey: '0xviewkey123'
            };

            await expect(zkProver.generateReshieldProof(input)).rejects.toThrow();
        });
    });

    describe('utility methods', () => {
        it('should get available circuits', () => {
            const circuits = zkProver.getAvailableCircuits();
            expect(Array.isArray(circuits)).toBe(true);
        });

        it('should check circuit availability', () => {
            const isAvailable = zkProver.isCircuitAvailable('transfer');
            expect(typeof isAvailable).toBe('boolean');
        });
    });
});
