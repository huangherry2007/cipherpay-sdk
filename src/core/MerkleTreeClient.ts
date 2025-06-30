import { ethers } from 'ethers';
import { poseidon1 } from 'poseidon-lite';
import { MerkleTree } from 'merkletreejs';

export interface MerkleProof {
  path: string[];
  indices: number[];
  root: string;
}

export class MerkleTreeClient {
  private contract: ethers.Contract;
  private tree: MerkleTree;
  private leaves: string[];

  constructor(contractInstance: ethers.Contract) {
    this.contract = contractInstance;
    this.leaves = [];
    this.tree = new MerkleTree([], (data: any) => poseidon1(data).toString(), { sortPairs: true });
  }

  /**
   * Fetches the latest Merkle root from the blockchain
   * @returns Promise<string> The current Merkle root
   */
  async fetchMerkleRoot(): Promise<string> {
    try {
      const root = await this.contract.getMerkleRoot();
      return root;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch Merkle root: ${errorMessage}`);
    }
  }

  /**
   * Gets the Merkle path for a given commitment
   * @param commitment The commitment hash to get the path for
   * @returns Promise<MerkleProof> The Merkle proof containing path, indices, and root
   */
  async getMerklePath(commitment: string): Promise<MerkleProof> {
    try {
      // Get the current root
      const root = await this.fetchMerkleRoot();

      // Get the proof from the contract
      const proof = await this.contract.getMerkleProof(commitment);
      
      // Convert the proof to the expected format
      const path = proof.path;
      const indices = proof.indices;

      return {
        path,
        indices,
        root
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get Merkle path: ${errorMessage}`);
    }
  }

  /**
   * Verifies a Merkle inclusion proof
   * @param commitment The commitment to verify
   * @param proof The Merkle proof
   * @param hashFn The hash function to use (defaults to poseidon1)
   * @returns boolean Whether the proof is valid
   */
  verifyPath(
    commitment: string,
    proof: MerkleProof,
    hashFn: (data: any) => string = (data) => poseidon1(data).toString()
  ): boolean {
    try {
      let current = commitment;
      
      // Reconstruct the path
      for (let i = 0; i < proof.path.length; i++) {
        const sibling = proof.path[i];
        const isLeft = proof.indices[i] === 0;
        
        // Hash the pair in the correct order
        current = isLeft 
          ? hashFn([current, sibling])
          : hashFn([sibling, current]);
      }

      // Compare with the root
      return current === proof.root;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to verify Merkle path: ${errorMessage}`);
    }
  }

  /**
   * Updates the local Merkle tree with new leaves
   * @param newLeaves Array of new commitment hashes to add
   */
  async updateTree(newLeaves: string[]): Promise<void> {
    try {
      // Add new leaves
      this.leaves = [...this.leaves, ...newLeaves];
      
      // Rebuild the tree
      this.tree = new MerkleTree(this.leaves, (data: any) => poseidon1(data).toString(), { sortPairs: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update Merkle tree: ${errorMessage}`);
    }
  }

  /**
   * Gets the current height of the Merkle tree
   * @returns number The height of the tree
   */
  getTreeHeight(): number {
    return this.tree.getDepth();
  }

  /**
   * Gets all leaves in the current tree
   * @returns string[] Array of all commitment hashes
   */
  getLeaves(): string[] {
    return this.leaves;
  }
} 