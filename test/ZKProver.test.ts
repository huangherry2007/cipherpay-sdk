import { ZKProver } from '../src/zk/ZKProver';
import { Logger } from '../src/utils/logger';
import { ZKInput } from '../src/types/ZKProof';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(Buffer.from('mock data'))
}));

// Mock snarkjs
jest.mock('snarkjs', () => ({
    wtns: {
        calculate: jest.fn().mockResolvedValue('mock witness')
    },
    groth16: {
        prove: jest.fn().mockResolvedValue({
            proof: {
                pi_a: ['1', '2'],
                pi_b: [['3', '4'], ['5', '6']],
                pi_c: ['7', '8'],
                protocol: 'groth16'
            },
            publicSignals: ['9', '10']
        }),
        verify: jest.fn().mockResolvedValue(true)
    }
}));

// Mock the logger
jest.mock('../src/utils/logger', () => ({
    Logger: {
        getInstance: jest.fn().mockReturnValue({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn()
        })
    }
}));

describe('ZKProver', () => {
    let zkProver: ZKProver;
    const mockLogger = Logger.getInstance();

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Create a new instance for each test
        zkProver = new ZKProver(
            './circuits/transfer.wasm',
            './circuits/transfer.zkey'
        );
    });

    describe('constructor', () => {
        it('should initialize with the correct circuit paths', () => {
            expect(zkProver).toBeDefined();
            expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('./circuits/transfer.wasm'));
            expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('./circuits/transfer.zkey'));
        });

        it('should throw error if files cannot be read', () => {
            (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
                throw new Error('File not found');
            });

            expect(() => new ZKProver(
                './circuits/transfer.wasm',
                './circuits/transfer.zkey'
            )).toThrow('Failed to load proof files: File not found');
        });
    });

    describe('generateTransferProof', () => {
        const mockInput: ZKInput = {
            nullifierHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            commitmentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            recipientPubKey: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
            amount: '1000000000000000000',
            tokenAddress: '0x0000000000000000000000000000000000000000',
            merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
            merklePath: [
                '0x2222222222222222222222222222222222222222222222222222222222222222',
                '0x3333333333333333333333333333333333333333333333333333333333333333',
                '0x4444444444444444444444444444444444444444444444444444444444444444'
            ],
            merklePathIndices: [0, 1, 0]
        };

        it('should generate a transfer proof successfully', async () => {
            const proof = await zkProver.generateTransferProof(mockInput);
            
            expect(proof).toEqual({
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: expect.any(Number)
            });
        });

        it('should handle proof generation error', async () => {
            // Mock snarkjs to throw an error
            const { groth16 } = require('snarkjs');
            groth16.prove.mockRejectedValueOnce(new Error('Proof generation failed'));

            await expect(zkProver.generateTransferProof(mockInput))
                .rejects
                .toThrow('Failed to generate transfer proof: Proof generation failed');
        });
    });

    describe('verifyProof', () => {
        const mockProof = {
            pi_a: ['1', '2'],
            pi_b: [['3', '4'], ['5', '6']],
            pi_c: ['7', '8'],
            protocol: 'groth16'
        };
        const mockPublicSignals = ['9', '10'];
        const mockVerifierKey = { key: 'value' };

        it('should verify a proof successfully', async () => {
            const isValid = await zkProver.verifyProof(mockProof, mockPublicSignals, mockVerifierKey);
            expect(isValid).toBe(true);
        });

        it('should handle verification error', async () => {
            // Mock snarkjs to throw an error
            const { groth16 } = require('snarkjs');
            groth16.verify.mockRejectedValueOnce(new Error('Verification failed'));

            await expect(zkProver.verifyProof(mockProof, mockPublicSignals, mockVerifierKey))
                .rejects
                .toThrow('Failed to verify proof: Verification failed');
        });
    });

    describe('loadVerifierKey', () => {
        it('should load verifier key successfully', async () => {
            const mockKey = { key: 'value' };
            (fs.readFileSync as jest.Mock).mockReturnValueOnce(Buffer.from(JSON.stringify(mockKey)));

            const key = await ZKProver.loadVerifierKey('./circuits/verifier_key.json');
            expect(key).toEqual(mockKey);
        });

        it('should handle file read error', async () => {
            (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
                throw new Error('File not found');
            });

            await expect(ZKProver.loadVerifierKey('./circuits/verifier_key.json'))
                .rejects
                .toThrow('Failed to load verifier key: File not found');
        });

        it('should handle invalid JSON', async () => {
            (fs.readFileSync as jest.Mock).mockReturnValueOnce(Buffer.from('invalid json'));

            await expect(ZKProver.loadVerifierKey('./circuits/verifier_key.json'))
                .rejects
                .toThrow('Failed to load verifier key: Unexpected token');
        });
    });
});
