import { 
    WalletProvider, 
    NoteManager, 
    ZKProver,
    Logger
} from '../src';
import { TransferBuilder } from '../src/tx/TransferBuilder';
import { ShieldedNote } from '../src/types/Note';
import { ZKInput } from '../src/types/ZKProof';

// Get logger instance
const logger = Logger.getInstance();

/**
 * Example function to send a shielded transfer
 * This example demonstrates how to:
 * 1. Connect to a wallet
 * 2. Initialize the note manager
 * 3. Create input and output notes
 * 4. Generate a zero-knowledge proof
 * 5. Build and send a transfer transaction
 */
async function sendTransfer() {
    try {
        // 1. Initialize wallet provider
        // This connects to the user's wallet (e.g., MetaMask for Ethereum)
        const walletProvider = new WalletProvider('ethereum');
        await walletProvider.connect();
        logger.info('Wallet connected successfully');

        // 2. Initialize note manager
        // The note manager handles creation and management of shielded notes
        const noteManager = new NoteManager();
        logger.info('Note manager initialized');

        // 3. Initialize ZK prover
        // The ZK prover generates zero-knowledge proofs for transfers
        const zkProver = new ZKProver(
            './circuits/transfer.wasm',
            './circuits/transfer.zkey'
        );
        logger.info('ZK prover initialized');

        // 4. Create transfer proof input
        // This is the data needed to generate the zero-knowledge proof
        const proofInput: ZKInput = {
            // The nullifier hash prevents double-spending of input notes
            nullifierHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            
            // The commitment hash is a Pedersen hash of the note's components
            commitmentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            
            // The recipient's public key for the output note
            recipientPubKey: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
            
            // The amount to transfer (in the smallest unit, e.g., wei for ETH)
            amount: '1000000000000000000', // 1 ETH
            
            // The token contract address (use zero address for native token)
            tokenAddress: '0x0000000000000000000000000000000000000000',
            
            // The current merkle root of the note commitment tree
            merkleRoot: '0x1111111111111111111111111111111111111111111111111111111111111111',
            
            // The merkle path proving inclusion of the input note
            merklePath: [
                '0x2222222222222222222222222222222222222222222222222222222222222222',
                '0x3333333333333333333333333333333333333333333333333333333333333333',
                '0x4444444444444444444444444444444444444444444444444444444444444444'
            ],
            
            // The merkle path indices (0 for left, 1 for right)
            merklePathIndices: [0, 1, 0]
        };

        // 5. Generate proof
        // This creates a zero-knowledge proof that the transfer is valid
        const proof = await zkProver.generateTransferProof(proofInput);
        logger.info('Transfer proof generated');

        // 6. Create and send transfer
        // Use the TransferBuilder to construct and send the transfer
        const transferBuilder = new TransferBuilder(
            walletProvider,
            noteManager,
            zkProver
        );

        // Create input notes (in a real app, these would be retrieved from storage)
        const inputNotes: ShieldedNote[] = [{
            commitment: proofInput.commitmentHash,
            nullifier: proofInput.nullifierHash,
            amount: BigInt('1000000000000000000'), // 1 ETH
            encryptedNote: '', // This would be populated in a real app
            spent: false,
            timestamp: Date.now(),
            recipientAddress: walletProvider.getPublicAddress()
        }];

        // Create output note
        const outputNote: ShieldedNote = {
            commitment: proofInput.commitmentHash,
            nullifier: '0x0000000000000000000000000000000000000000000000000000000000000000', // Will be set when spent
            amount: BigInt('1000000000000000000'), // 1 ETH
            encryptedNote: '', // This would be populated in a real app
            spent: false,
            timestamp: Date.now(),
            recipientAddress: proofInput.recipientPubKey
        };

        // Build and send the transfer
        const transfer = await transferBuilder
            .setInputNotes(inputNotes)
            .setOutputNote(outputNote)
            .setProof(proof)
            .build();

        const receipt = await transfer.send();
        logger.info('Transfer sent successfully', { txHash: receipt.txHash });

        // 7. Clean up
        await walletProvider.disconnect();
        logger.info('Wallet disconnected');

    } catch (error) {
        if (error instanceof Error) {
            logger.error('Transfer failed', { error: error.message });
        } else {
            logger.error('Transfer failed with unknown error');
        }
        throw error;
    }
}

// Run the example
sendTransfer()
    .then(() => {
        logger.info('Example completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Example failed', { error });
        process.exit(1);
    });
