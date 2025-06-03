import { MerkleTree } from 'merkletreejs';
import { createMerkleTree, getMerkleProof, verifyMerkleProof } from '../src/utils/merkle';
import { hash } from '../src/utils/hash';

describe('Merkle Tree Utilities', () => {
    describe('createMerkleTree', () => {
        it('should create a merkle tree from an array of leaves', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            expect(tree).toBeInstanceOf(MerkleTree);
            expect(tree.getLeafCount()).toBe(4);
        });

        it('should handle empty array of leaves', () => {
            const tree = createMerkleTree([]);
            expect(tree).toBeInstanceOf(MerkleTree);
            expect(tree.getLeafCount()).toBe(0);
        });

        it('should handle single leaf', () => {
            const leaves = ['leaf1'].map(hash);
            const tree = createMerkleTree(leaves);
            expect(tree).toBeInstanceOf(MerkleTree);
            expect(tree.getLeafCount()).toBe(1);
        });

        it('should handle odd number of leaves', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3'].map(hash);
            const tree = createMerkleTree(leaves);
            expect(tree).toBeInstanceOf(MerkleTree);
            expect(tree.getLeafCount()).toBe(3);
        });

        it('should create different trees for different leaves', () => {
            const leaves1 = ['leaf1', 'leaf2'].map(hash);
            const leaves2 = ['leaf2', 'leaf3'].map(hash);
            const tree1 = createMerkleTree(leaves1);
            const tree2 = createMerkleTree(leaves2);
            expect(tree1.getRoot().toString('hex')).not.toBe(tree2.getRoot().toString('hex'));
        });
    });

    describe('getMerkleProof', () => {
        it('should generate a valid merkle proof for a leaf', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            const leaf = leaves[1];
            const proof = getMerkleProof(tree, leaf);
            expect(proof).toBeTruthy();
            expect(Array.isArray(proof)).toBe(true);
            expect(proof.length).toBeGreaterThan(0);
        });

        it('should throw error for non-existent leaf', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            const nonExistentLeaf = hash('non-existent');
            expect(() => getMerkleProof(tree, nonExistentLeaf)).toThrow();
        });

        it('should generate different proofs for different leaves', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            const proof1 = getMerkleProof(tree, leaves[0]);
            const proof2 = getMerkleProof(tree, leaves[1]);
            expect(proof1).not.toEqual(proof2);
        });

        it('should handle single leaf tree', () => {
            const leaves = ['leaf1'].map(hash);
            const tree = createMerkleTree(leaves);
            const proof = getMerkleProof(tree, leaves[0]);
            expect(proof).toBeTruthy();
            expect(Array.isArray(proof)).toBe(true);
            expect(proof.length).toBe(0); // No siblings for single leaf
        });
    });

    describe('verifyMerkleProof', () => {
        it('should verify a valid merkle proof', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            const leaf = leaves[1];
            const proof = getMerkleProof(tree, leaf);
            const root = tree.getRoot().toString('hex');
            const isValid = verifyMerkleProof(proof, leaf, root);
            expect(isValid).toBe(true);
        });

        it('should reject invalid merkle proof', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            const leaf = leaves[1];
            const proof = getMerkleProof(tree, leaf);
            const wrongRoot = hash('wrong-root');
            const isValid = verifyMerkleProof(proof, leaf, wrongRoot);
            expect(isValid).toBe(false);
        });

        it('should reject modified leaf', () => {
            const leaves = ['leaf1', 'leaf2', 'leaf3', 'leaf4'].map(hash);
            const tree = createMerkleTree(leaves);
            const leaf = leaves[1];
            const proof = getMerkleProof(tree, leaf);
            const root = tree.getRoot().toString('hex');
            const modifiedLeaf = hash('modified-leaf');
            const isValid = verifyMerkleProof(proof, modifiedLeaf, root);
            expect(isValid).toBe(false);
        });

        it('should handle single leaf tree', () => {
            const leaves = ['leaf1'].map(hash);
            const tree = createMerkleTree(leaves);
            const leaf = leaves[0];
            const proof = getMerkleProof(tree, leaf);
            const root = tree.getRoot().toString('hex');
            const isValid = verifyMerkleProof(proof, leaf, root);
            expect(isValid).toBe(true);
        });

        it('should handle empty proof', () => {
            const leaves = ['leaf1'].map(hash);
            const tree = createMerkleTree(leaves);
            const leaf = leaves[0];
            const proof: string[] = [];
            const root = tree.getRoot().toString('hex');
            const isValid = verifyMerkleProof(proof, leaf, root);
            expect(isValid).toBe(true);
        });
    });
}); 