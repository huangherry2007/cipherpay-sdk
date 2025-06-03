import { WalletProvider } from '../../src/core/WalletProvider';
import { NoteManager } from '../../src/core/NoteManager';
import { ZKProver } from '../../src/zk/ZKProver';
import { TransferBuilder } from '../../src/tx/TransferBuilder';
import { ShieldedNote } from '../../src/types/Note';
import { ZKInput } from '../../src/types/ZKProof';
import { Logger } from '../../src/utils/logger';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
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
        deposit: jest.fn().mockResolvedValue({
            wait: jest.fn().mockResolvedValue({
                transactionHash: '0xabc',
                status: 1,
                blockNumber: 123
            })
        })
    }))
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

describe('Transfer Flow Integration', () => {
    let walletProvider: WalletProvider;
    let noteManager: NoteManager;
    let zkProver: ZKProver;
    let transferBuilder: TransferBuilder;
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

    it('should complete a full transfer flow successfully', async () => {
        // 1. Create proof input
        const proofInput: ZKInput = {
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

        // 2. Generate proof
        const proof = await zkProver.generateTransferProof(proofInput);
        expect(proof).toBeDefined();
        expect(proof.proof).toBeDefined();
        expect(proof.publicSignals).toBeDefined();

        // 3. Create input notes
        const inputNotes: ShieldedNote[] = [{
            commitment: proofInput.commitmentHash,
            nullifier: proofInput.nullifierHash,
            amount: BigInt('1000000000000000000'),
            encryptedNote: '',
            spent: false,
            timestamp: Date.now(),
            recipientAddress: walletProvider.getPublicAddress()
        }];

        // 4. Create output note
        const outputNote: ShieldedNote = {
            commitment: proofInput.commitmentHash,
            nullifier: '0x0000000000000000000000000000000000000000000000000000000000000000',
            amount: BigInt('1000000000000000000'),
            encryptedNote: '',
            spent: false,
            timestamp: Date.now(),
            recipientAddress: proofInput.recipientPubKey
        };

        // 5. Build and send transfer
        const transfer = await transferBuilder
            .setInputNotes(inputNotes)
            .setOutputNote(outputNote)
            .setProof(proof)
            .build();

        const receipt = await transfer.send();
        expect(receipt).toBeDefined();
        expect(receipt.txHash).toBeDefined();
        expect(receipt.status).toBe('success');

        // 6. Verify logs
        expect(mockLogger.info).toHaveBeenCalledWith('Transfer sent successfully', expect.any(Object));
    });

    it('should handle transfer failure gracefully', async () => {
        // Mock ethers to throw an error
        const { Contract } = require('ethers');
        Contract.mockImplementationOnce(() => ({
            deposit: jest.fn().mockRejectedValue(new Error('Transaction failed'))
        }));

        // Create proof input
        const proofInput: ZKInput = {
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

        // Generate proof
        const proof = await zkProver.generateTransferProof(proofInput);

        // Create input notes
        const inputNotes: ShieldedNote[] = [{
            commitment: proofInput.commitmentHash,
            nullifier: proofInput.nullifierHash,
            amount: BigInt('1000000000000000000'),
            encryptedNote: '',
            spent: false,
            timestamp: Date.now(),
            recipientAddress: walletProvider.getPublicAddress()
        }];

        // Create output note
        const outputNote: ShieldedNote = {
            commitment: proofInput.commitmentHash,
            nullifier: '0x0000000000000000000000000000000000000000000000000000000000000000',
            amount: BigInt('1000000000000000000'),
            encryptedNote: '',
            spent: false,
            timestamp: Date.now(),
            recipientAddress: proofInput.recipientPubKey
        };

        // Build and attempt to send transfer
        const transfer = await transferBuilder
            .setInputNotes(inputNotes)
            .setOutputNote(outputNote)
            .setProof(proof)
            .build();

        await expect(transfer.send()).rejects.toThrow('Transaction failed');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
