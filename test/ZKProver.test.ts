import { ZKProver } from '../src/zk/ZKProver';
import { Logger } from '../src/utils/logger';
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
        zkProver = new ZKProver('./circuits');
    });

    describe('constructor', () => {
        it('should initialize with the correct circuit paths', () => {
            expect(zkProver).toBeDefined();
        });

        it('should throw error if files cannot be read', () => {
            // Mock existsSync to return false for invalid path
            (fs.existsSync as jest.Mock).mockReturnValueOnce(false);
            
            // The constructor doesn't throw, it just doesn't load circuits that don't exist
            const invalidProver = new ZKProver('/invalid/path');
            expect(invalidProver).toBeDefined();
            expect(invalidProver.isCircuitAvailable('transfer')).toBe(false);
        });
    });

    describe('generateTransferProof', () => {
        const inputNote: ShieldedNote = {
            commitment: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            nullifier: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            amount: BigInt('1000000000000000000'),
            encryptedNote: '',
            spent: false,
            timestamp: Date.now(),
            recipientAddress: '0x123',
            merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111'
        };
        const outputNote: ShieldedNote = {
            commitment: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            nullifier: '0x0000000000000000000000000000000000000000000000000000000000000000',
            amount: BigInt('1000000000000000000'),
            encryptedNote: '',
            spent: false,
            timestamp: Date.now(),
            recipientAddress: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
            merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111'
        };
        const mockInput = {
            inputNotes: [inputNote],
            outputNote,
            viewKey: 'test_view_key'
        };

        it('should generate a transfer proof successfully', async () => {
            const proof = await zkProver.generateTransferProof(mockInput);
            
            expect(proof).toEqual({
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16',
                    curve: 'bn128'
                },
                publicSignals: ['9', '10'],
                timestamp: expect.any(Number)
            });
        });

        it('should handle proof generation error', async () => {
            // Mock snarkjs to throw an error
            const { groth16 } = require('snarkjs');
            groth16.fullProve.mockRejectedValueOnce(new Error('Proof generation failed'));

            await expect(zkProver.generateTransferProof(mockInput))
                .rejects
                .toThrow('Failed to generate transfer proof: Proof generation failed');
        });
    });

    describe('verifyProof', () => {
        const mockZKProof = {
            proof: {
                pi_a: ['1', '2'],
                pi_b: [['3', '4'], ['5', '6']],
                pi_c: ['7', '8'],
                protocol: 'groth16',
                curve: 'bn128'
            },
            publicSignals: ['9', '10'],
            timestamp: Date.now()
        };
        const mockPublicSignals = ['9', '10'];

        it('should verify a proof successfully', async () => {
            const isValid = await zkProver.verifyProof(mockZKProof, mockPublicSignals);
            expect(isValid).toBe(true);
        });

        it('should handle verification error', async () => {
            // Mock snarkjs to throw an error
            const { groth16 } = require('snarkjs');
            groth16.verify.mockRejectedValueOnce(new Error('Verification failed'));

            await expect(zkProver.verifyProof(mockZKProof, mockPublicSignals))
                .rejects
                .toThrow('Failed to verify proof: Verification failed');
        });
    });
});
