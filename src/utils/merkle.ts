import { MerkleTree } from 'merkletreejs';
import { hash } from './hash';
import { ErrorHandler, ErrorType, CipherPayError } from '../errors/ErrorHandler';

/**
 * Creates a merkle tree from an array of leaves
 * @param leaves Array of leaf values (already hashed)
 * @returns MerkleTree instance
 */
export function createMerkleTree(leaves: string[]): MerkleTree {
    // Convert hex strings to Buffer objects for merkletreejs
    // Strip 0x prefix if present
    const leafBuffers = leaves.map(leaf => Buffer.from(leaf.replace(/^0x/, ''), 'hex'));
    return new MerkleTree(leafBuffers, hash, { sortPairs: true });
}

/**
 * Gets a merkle proof for a leaf
 * @param tree MerkleTree instance
 * @param leaf Leaf value to get proof for (hex string)
 * @returns Array of sibling hashes in the proof
 */
export function getMerkleProof(tree: MerkleTree, leaf: string): string[] {
    // Convert leaf to Buffer for comparison with tree leaves
    // Strip 0x prefix if present
    const leafBuffer = Buffer.from(leaf.replace(/^0x/, ''), 'hex');
    const leaves = tree.getLeaves();
    
    // Check if the leaf exists in the tree
    const leafExists = leaves.some(l => l.equals(leafBuffer));
    if (!leafExists) {
        throw new CipherPayError(
            'Leaf not found in tree',
            ErrorType.NOTE_NOT_FOUND,
            { 
                leaf,
                treeLeavesCount: leaves.length
            },
            {
                action: 'Check leaf value',
                description: 'The specified leaf was not found in the Merkle tree. Please verify the leaf value is correct.'
            },
            false
        );
    }
    
    const proof = tree.getProof(leafBuffer);
    return proof.map(p => p.data.toString('hex'));
}

/**
 * Verifies a merkle proof
 * @param proof Array of sibling hashes in the proof
 * @param leaf Leaf value to verify (hex string)
 * @param root Root hash of the merkle tree (hex string)
 * @returns True if the proof is valid, false otherwise
 */
export function verifyMerkleProof(proof: string[], leaf: string, root: string): boolean {
    // Convert proof back to Buffer objects for verification
    // Strip 0x prefix if present
    const proofBuffers = proof.map(p => Buffer.from(p.replace(/^0x/, ''), 'hex'));
    const leafBuffer = Buffer.from(leaf.replace(/^0x/, ''), 'hex');
    const rootBuffer = Buffer.from(root.replace(/^0x/, ''), 'hex');
    
    // For single-leaf trees, the proof is empty and we just compare the leaf to the root
    if (proofBuffers.length === 0) {
        return leafBuffer.equals(rootBuffer);
    }
    
    // Use the tree's verify method with proper Buffer objects
    return MerkleTree.verify(proofBuffers, leafBuffer, rootBuffer, hash, { sortPairs: true });
} 