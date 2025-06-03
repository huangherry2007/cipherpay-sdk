# CipherPay Wallet SDK – API Reference

This document provides reference-level documentation for each module and method in the CipherPay Wallet SDK.

---

## `WalletProvider`

### Example:
```ts
const wallet = new WalletProvider();
await wallet.connect();
console.log(await wallet.getPublicAddress());
```

### Methods:
- `connect(): Promise<void>`  
  Prompts the user to connect their MetaMask wallet.

- `getPublicAddress(): string`  
  Returns the connected wallet's public address.

- `signAndSendDepositTx(to: string, value: string): Promise<string>`  
  Signs and sends a deposit transaction to the shielded vault.

- `disconnect(): Promise<void>`  
  Disconnects the current wallet connection.

---

## `NoteManager`

### Example:
```ts
const noteManager = new NoteManager();
noteManager.addNote({ commitment: '0xabc', nullifier: '0x123', amount: '100', encryptedNote: '', spent: false });
const notes = noteManager.getSpendableNotes();
```

### Methods:
- `addNote(note: ShieldedNote): void`  
  Adds a new note to the user's local wallet.

- `getSpendableNotes(): ShieldedNote[]`  
  Returns all unspent notes.

- `markNoteSpent(nullifier: string): void`  
  Marks a note as spent using its nullifier.

- `encryptNote(note: ShieldedNote, key: string): string`  
  Encrypts a shielded note for the recipient.

- `decryptNote(encrypted: string, key: string): ShieldedNote`  
  Decrypts a shielded note using a private key.

- `getAllNotes(): ShieldedNote[]`  
  Returns all notes in the wallet.

- `getNoteByNullifier(nullifier: string): ShieldedNote | undefined`  
  Retrieves a note by its nullifier.

- `getNotesByRecipient(recipient: string): ShieldedNote[]`  
  Returns all notes for a specific recipient.

- `getBalance(): bigint`  
  Returns the total balance of unspent notes.

---

## `MerkleTreeClient`

### Example:
```ts
const treeClient = new MerkleTreeClient(contractInstance);
const root = await treeClient.fetchMerkleRoot();
const path = await treeClient.getMerklePath('0xabc');
```

### Methods:
- `fetchMerkleRoot(): Promise<string>`  
  Fetches the latest Merkle root from the blockchain.

- `getMerklePath(commitment: string): Promise<MerkleProof>`  
  Returns a Merkle path for a given commitment.

- `verifyPath(commitment, proof, hashFn): boolean`  
  Verifies a Merkle inclusion proof.

---

## `TransactionBuilder`

### Example:
```ts
const builder = new TransactionBuilder(noteManager, treeClient, zkProver);
const tx = await builder.buildTransfer('0xRecipientKey', '100');
```

### Methods:
- `buildTransfer(recipientPublicKey: string, amount: string): Promise<any>`  
  Creates a fully shielded encrypted transaction payload for the specified recipient and amount.

- `setInputNotes(notes: ShieldedNote[]): TransactionBuilder`  
  Sets the input notes for the transaction.

- `setOutputNote(note: ShieldedNote): TransactionBuilder`  
  Sets the output note for the transaction.

- `setProof(proof: ZKProof): TransactionBuilder`  
  Sets the zero-knowledge proof for the transaction.

- `build(): Promise<Transfer>`  
  Builds the final transfer object.

---

## `ZKProver`

### Example:
```ts
const prover = new ZKProver('./transfer.wasm', './transfer.zkey');
const proof = await prover.generateTransferProof(input);
```

### Methods:
- `generateTransferProof(input: any): Promise<any>`  
  Constructs a Groth16 zk-proof for a transfer circuit.

- `verifyProof(proof: any, publicSignals: string[], verifierKey: any): Promise<boolean>`  
  Verifies a zk-proof against a verifier key.

---

## `RelayerClient`

### Example:
```ts
const relayer = new RelayerClient();
const receipt = await relayer.sendToRelayer(txPayload);
```

### Methods:
- `sendToRelayer(payload: any): Promise<{ txHash: string }>`  
  Sends the zk transaction to a relayer node.

- `checkTxStatus(txHash: string): Promise<'pending' | 'success' | 'failed'>`  
  Queries the status of a submitted transaction.

---

## `ViewKeyManager`

### Example:
```ts
const viewKeyManager = new ViewKeyManager();
const key = viewKeyManager.exportViewKey();
const proof = viewKeyManager.generateProofOfPayment(note);
```

### Methods:
- `exportViewKey(): string`  
  Exports a user's view key for external sharing.

- `generateProofOfPayment(note: ShieldedNote): { proof: string, metadata: any }`  
  Generates a proof of payment for a specific note.

- `verifyProofOfPayment(proof: string, note: ShieldedNote, viewKey: string): boolean`  
  Verifies a proof of payment against a view key.

---

## Utility Functions

### Math Utilities
- `add(a: bigint, b: bigint): bigint`  
  Adds two bigint values with overflow protection.

- `subtract(a: bigint, b: bigint): bigint`  
  Subtracts two bigint values with overflow protection.

- `multiply(a: bigint, b: bigint): bigint`  
  Multiplies two bigint values with overflow protection.

- `divide(a: bigint, b: bigint): bigint`  
  Divides two bigint values with overflow protection.

- `modPow(base: bigint, exponent: bigint, modulus: bigint): bigint`  
  Computes modular exponentiation.

- `modInverse(a: bigint, m: bigint): bigint`  
  Computes modular multiplicative inverse.

- `modAdd(a: bigint, b: bigint, m: bigint): bigint`  
  Computes modular addition.

- `modSub(a: bigint, b: bigint, m: bigint): bigint`  
  Computes modular subtraction.

- `modMul(a: bigint, b: bigint, m: bigint): bigint`  
  Computes modular multiplication.

### Hash Utilities
- `hash(input: string): string`  
  Hashes a string using keccak256.

- `hashToField(input: string): bigint`  
  Hashes a string to a field element.

- `hashToGroup(input: string): { x: bigint, y: bigint }`  
  Hashes a string to a group element.

- `poseidonHash(input: bigint): bigint`  
  Hashes a single input using Poseidon hash function.

- `poseidonHashMany(inputs: bigint[]): bigint`  
  Hashes multiple inputs using Poseidon hash function.

### Merkle Tree Utilities
- `createMerkleTree(leaves: string[]): MerkleTree`  
  Creates a merkle tree from an array of leaves.

- `getMerkleProof(tree: MerkleTree, leaf: string): string[]`  
  Gets a merkle proof for a leaf.

- `verifyMerkleProof(proof: string[], leaf: string, root: string): boolean`  
  Verifies a merkle proof.

### Note Utilities
- `createNote(amount: string, recipient: string): ShieldedNote`  
  Creates a new shielded note.

- `encryptNote(note: ShieldedNote, key: string): Promise<EncryptedNote>`  
  Encrypts a shielded note.

- `decryptNote(note: EncryptedNote, key: string): Promise<ShieldedNote>`  
  Decrypts an encrypted note.

### Encryption Utilities
- `generateEncryptionKey(): string`  
  Generates a new encryption key.

- `encryptData(data: string, key: string): Promise<{ ciphertext: string, nonce: string }>`  
  Encrypts data using the provided key.

- `decryptData(ciphertext: string, key: string, nonce: string): Promise<string>`  
  Decrypts data using the provided key and nonce.

---

## Types

### ShieldedNote
```ts
interface ShieldedNote {
    commitment: string;
    nullifier: string;
    amount: bigint;
    encryptedNote: string;
    spent: boolean;
    timestamp: number;
    recipientAddress: string;
}
```

### EncryptedNote
```ts
interface EncryptedNote {
    ciphertext: string;
    ephemeralKey: string;
    nonce: string;
    metadata: NoteMetadata;
}
```

### NoteMetadata
```ts
interface NoteMetadata {
    version: number;
    chainType: string;
    network: string;
    timestamp: number;
}
```

### ZKProof
```ts
interface ZKProof {
    proof: {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
    };
    publicSignals: string[];
    timestamp: number;
}
```

### MerkleProof
```ts
interface MerkleProof {
    siblings: string[];
    path: number[];
}
```
