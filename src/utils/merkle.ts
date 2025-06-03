import { MerkleTree } from 'merkletreejs';
import { hash } from './hash';

/**
 * Creates a merkle tree from an array of leaves
 * @param leaves Array of leaf values (already hashed)
 * @returns MerkleTree instance
 */
export function createMerkleTree(leaves: string[]): MerkleTree {
    return new MerkleTree(leaves, hash, { sortPairs: true });
}

/**
 * Gets a merkle proof for a leaf
 * @param tree MerkleTree instance
 * @param leaf Leaf value to get proof for
 * @returns Array of sibling hashes in the proof
 */
export function getMerkleProof(tree: MerkleTree, leaf: string): string[] {
    const proof = tree.getProof(leaf);
    if (!proof) {
        throw new Error('Leaf not found in tree');
    }
    return proof.map(p => p.data.toString('hex'));
}

/**
 * Verifies a merkle proof
 * @param proof Array of sibling hashes in the proof
 * @param leaf Leaf value to verify
 * @param root Root hash of the merkle tree
 * @returns True if the proof is valid, false otherwise
 */
export function verifyMerkleProof(proof: string[], leaf: string, root: string): boolean {
    const tree = new MerkleTree([leaf], hash, { sortPairs: true });
    return tree.verify(proof, leaf, root);
} 