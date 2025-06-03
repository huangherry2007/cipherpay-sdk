import { TransferBuilder } from '../src/tx/TransferBuilder';
import { WalletProvider } from '../src/core/WalletProvider';
import { NoteManager } from '../src/core/NoteManager';
import { ZKProver } from '../src/zk/ZKProver';
import { ShieldedNote } from '../src/types/Note';
import { ZKProof } from '../src/types/ZKProof';
import { Logger } from '../src/utils/logger';

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

// Mock ethers
jest.mock('ethers', () => ({
    providers: {
        Web3Provider: jest.fn().mockImplementation(() => ({
            send: jest.fn().mockResolvedValue(['0x123']),
            getSigner: jest.fn().mockReturnValue({
                getAddress: jest.fn().mockResolvedValue('0x123')
            })
        }))
    },
    utils: {
        parseEther: jest.fn().mockReturnValue('1000000000000000000')
    },
    Contract: jest.fn().mockImplementation(() => ({
        transfer: jest.fn().mockResolvedValue({
            wait: jest.fn().mockResolvedValue({
                transactionHash: '0xabc',
                status: 1,
                blockNumber: 123
            })
        })
    }))
}));

describe('TransferBuilder', () => {
    let transferBuilder: TransferBuilder;
    let walletProvider: WalletProvider;
    let noteManager: NoteManager;
    let zkProver: ZKProver;
    const mockLogger = Logger.getInstance();

    beforeEach(async () => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Initialize components
        walletProvider = new WalletProvider('ethereum');
        noteManager = new NoteManager();
        zkProver = new ZKProver(
            './circuits/transfer.wasm',
            './circuits/transfer.zkey'
        );
        transferBuilder = new TransferBuilder(
            walletProvider,
            noteManager,
            zkProver
        );

        // Mock window.ethereum
        const mockEthereum = {
            request: jest.fn().mockResolvedValue(['0x123']),
            on: jest.fn(),
            removeListener: jest.fn()
        };
        (window as any).ethereum = mockEthereum;

        // Connect wallet
        await walletProvider.connect();
    });

    afterEach(async () => {
        // Clean up
        await walletProvider.disconnect();
    });

    describe('setInputNotes', () => {
        it('should set input notes successfully', () => {
            const inputNotes: ShieldedNote[] = [{
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            }];

            const builder = transferBuilder.setInputNotes(inputNotes);
            expect(builder).toBe(transferBuilder);
        });

        it('should throw error for empty input notes', () => {
            expect(() => transferBuilder.setInputNotes([])).toThrow('Input notes cannot be empty');
        });
    });

    describe('setOutputNote', () => {
        it('should set output note successfully', () => {
            const outputNote: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const builder = transferBuilder.setOutputNote(outputNote);
            expect(builder).toBe(transferBuilder);
        });
    });

    describe('setProof', () => {
        it('should set proof successfully', () => {
            const proof: ZKProof = {
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            const builder = transferBuilder.setProof(proof);
            expect(builder).toBe(transferBuilder);
        });
    });

    describe('build', () => {
        it('should build transfer successfully', async () => {
            const inputNotes: ShieldedNote[] = [{
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            }];

            const outputNote: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const proof: ZKProof = {
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            const transfer = await transferBuilder
                .setInputNotes(inputNotes)
                .setOutputNote(outputNote)
                .setProof(proof)
                .build();

            expect(transfer).toBeDefined();
            expect(transfer.send).toBeDefined();
        });

        it('should throw error if input notes not set', async () => {
            const outputNote: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const proof: ZKProof = {
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            await expect(transferBuilder
                .setOutputNote(outputNote)
                .setProof(proof)
                .build()
            ).rejects.toThrow('Input notes must be set');
        });

        it('should throw error if output note not set', async () => {
            const inputNotes: ShieldedNote[] = [{
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            }];

            const proof: ZKProof = {
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            await expect(transferBuilder
                .setInputNotes(inputNotes)
                .setProof(proof)
                .build()
            ).rejects.toThrow('Output note must be set');
        });

        it('should throw error if proof not set', async () => {
            const inputNotes: ShieldedNote[] = [{
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            }];

            const outputNote: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            await expect(transferBuilder
                .setInputNotes(inputNotes)
                .setOutputNote(outputNote)
                .build()
            ).rejects.toThrow('Proof must be set');
        });
    });

    describe('Transfer.send', () => {
        it('should send transfer successfully', async () => {
            const inputNotes: ShieldedNote[] = [{
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            }];

            const outputNote: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const proof: ZKProof = {
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            const transfer = await transferBuilder
                .setInputNotes(inputNotes)
                .setOutputNote(outputNote)
                .setProof(proof)
                .build();

            const receipt = await transfer.send();
            expect(receipt).toEqual({
                txHash: '0xabc',
                chainType: 'ethereum',
                status: 'success',
                blockNumber: 123
            });
        });

        it('should handle transfer failure', async () => {
            // Mock ethers to throw an error
            const { Contract } = require('ethers');
            Contract.mockImplementationOnce(() => ({
                transfer: jest.fn().mockRejectedValue(new Error('Transaction failed'))
            }));

            const inputNotes: ShieldedNote[] = [{
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            }];

            const outputNote: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const proof: ZKProof = {
                proof: {
                    pi_a: ['1', '2'],
                    pi_b: [['3', '4'], ['5', '6']],
                    pi_c: ['7', '8'],
                    protocol: 'groth16'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            const transfer = await transferBuilder
                .setInputNotes(inputNotes)
                .setOutputNote(outputNote)
                .setProof(proof)
                .build();

            await expect(transfer.send()).rejects.toThrow('Transaction failed');
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
}); 