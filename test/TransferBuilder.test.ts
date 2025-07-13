import { TransferBuilder } from '../src/tx/TransferBuilder';
import { NoteManager } from '../src/core/NoteManager';
import { ViewKeyManager } from '../src/core/ViewKeyManager';
import { ZKProver } from '../src/zk/ZKProver';
import { ShieldedNote } from '../src/types/Note';
import { ZKProof } from '../src/types/ZKProof';
import { Logger } from '../src/monitoring/observability/logger';

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

describe('TransferBuilder', () => {
    let TransferBuilder: any;
    let WalletProvider: any;
    let ethers: any;
    let transferBuilder: any;
    let walletProvider: any;
    let noteManager: NoteManager;
    let zkProver: ZKProver;
    const mockLogger = Logger.getInstance();

    beforeEach(async () => {
        jest.resetModules();
        jest.doMock('ethers', () => {
            const mockSend = jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']);
            const mockGetAddress = jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890');
            const mockGetSigner = jest.fn().mockReturnValue({
                getAddress: mockGetAddress
            });
            const mockWeb3Provider = {
                send: mockSend,
                getSigner: mockGetSigner,
                provider: {
                    send: mockSend
                }
            };
            const mockContract = {
                transfer: jest.fn().mockResolvedValue({
                    wait: jest.fn().mockResolvedValue({
                        transactionHash: '0xabc',
                        status: 1,
                        blockNumber: 123
                    })
                }),
                deposit: jest.fn().mockResolvedValue({
                    wait: jest.fn().mockResolvedValue({
                        transactionHash: '0xabc',
                        status: 1,
                        blockNumber: 123
                    })
                })
            };
            return {
                ethers: {
                    providers: {
                        Web3Provider: jest.fn().mockImplementation(() => mockWeb3Provider),
                        JsonRpcProvider: jest.fn()
                    },
                    Contract: jest.fn().mockImplementation(() => mockContract),
                    utils: {
                        parseEther: jest.fn().mockReturnValue({ toString: () => '1000000000000000000' })
                    }
                }
            };
        });
        ethers = require('ethers').ethers;
        WalletProvider = require('../src/core/WalletProvider').WalletProvider;
        TransferBuilder = require('../src/tx/TransferBuilder').TransferBuilder;

        // Initialize components
        walletProvider = new WalletProvider('ethereum', { rpcUrl: 'http://localhost:8545' });
        noteManager = new NoteManager();
        zkProver = new ZKProver();
        transferBuilder = new TransferBuilder(
            walletProvider,
            noteManager,
            zkProver
        );

        // Mock window.ethereum
        const mockEthereum = {
            request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']),
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

        it('should throw error for empty input notes', async () => {
            await expect(transferBuilder.setInputNotes([]).build()).rejects.toThrow('No input notes provided');
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
                    protocol: 'groth16',
                    curve: 'bn128'
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
                    protocol: 'groth16',
                    curve: 'bn128'
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
                    protocol: 'groth16',
                    curve: 'bn128'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            await expect(transferBuilder
                .setOutputNote(outputNote)
                .setProof(proof)
                .build()
            ).rejects.toThrow('No input notes provided');
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
                    protocol: 'groth16',
                    curve: 'bn128'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            await expect(transferBuilder
                .setInputNotes(inputNotes)
                .setProof(proof)
                .build()
            ).rejects.toThrow('No output note provided');
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
            ).rejects.toThrow('No proof provided');
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
                    protocol: 'groth16',
                    curve: 'bn128'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            const transfer = await transferBuilder
                .setInputNotes(inputNotes)
                .setOutputNote(outputNote)
                .setProof(proof)
                .build();

            // Mock the sendEthereumTx method
            const mockReceipt = {
                transactionHash: '0xabc123',
                status: 1,
                blockNumber: 12345
            };
            transfer.sendEthereumTx = jest.fn().mockResolvedValue(mockReceipt);

            const receipt = await transfer.send();
            expect(receipt).toBeDefined();
            expect(receipt.transactionHash).toBe('0xabc123');
            expect(receipt.status).toBe(1);
        });

        it('should handle transfer failure', async () => {
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
                    protocol: 'groth16',
                    curve: 'bn128'
                },
                publicSignals: ['9', '10'],
                timestamp: Date.now()
            };

            const transfer = await transferBuilder
                .setInputNotes(inputNotes)
                .setOutputNote(outputNote)
                .setProof(proof)
                .build();

            // Mock the sendEthereumTx method to throw an error
            transfer.sendEthereumTx = jest.fn().mockRejectedValue(new Error('Transaction failed'));

            await expect(transfer.send()).rejects.toThrow('Transaction failed');
        });
    });
}); 