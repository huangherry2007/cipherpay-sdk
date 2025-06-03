# API Reference

This document provides a comprehensive reference for the CipherPay SDK API.

## Core Classes

### CipherPay

The main class for interacting with the CipherPay protocol.

```typescript
class CipherPay {
  constructor(config: CipherPayConfig);
  
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Account Management
  getAccount(): Promise<Account>;
  getBalance(): Promise<bigint>;
  getNotes(): Promise<Note[]>;
  
  // Transaction Management
  createNote(amount: bigint): Promise<Note>;
  transfer(notes: Note[], recipient: string, amount: bigint): Promise<TransferResult>;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
  
  // Event Handling
  on(event: string, callback: Function): void;
  off(event: string, callback: Function): void;
}
```

### Account

Represents a user's account in the CipherPay protocol.

```typescript
interface Account {
  address: string;
  privateKey: string;
  viewKey: string;
  notes: Note[];
  balance: bigint;
}
```

### Note

Represents a shielded note in the CipherPay protocol.

```typescript
interface Note {
  amount: bigint;
  owner: string;
  commitment: string;
  nullifier: string;
  encrypted: string;
}
```

## Configuration

### CipherPayConfig

Configuration options for the CipherPay SDK.

```typescript
interface CipherPayConfig {
  network: Network;
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  gasLimit?: number;
  gasPrice?: bigint;
}
```

### Network

Supported networks.

```typescript
enum Network {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  Local = 'local'
}
```

## Events

### Connection Events

- `connect`: Emitted when successfully connected
- `disconnect`: Emitted when disconnected
- `error`: Emitted when an error occurs

### Account Events

- `accountChanged`: Emitted when the account changes
- `balanceChanged`: Emitted when the balance changes
- `notesChanged`: Emitted when notes change

### Transaction Events

- `transactionSubmitted`: Emitted when a transaction is submitted
- `transactionConfirmed`: Emitted when a transaction is confirmed
- `transactionFailed`: Emitted when a transaction fails

## Error Handling

### CipherPayError

Base error class for CipherPay SDK errors.

```typescript
class CipherPayError extends Error {
  code: string;
  details?: any;
}
```

### Common Error Codes

- `CONNECTION_ERROR`: Failed to connect to the network
- `INVALID_ACCOUNT`: Invalid account configuration
- `INSUFFICIENT_BALANCE`: Insufficient balance for transaction
- `INVALID_NOTE`: Invalid note configuration
- `TRANSACTION_FAILED`: Transaction failed to execute
- `PROOF_GENERATION_FAILED`: Failed to generate zero-knowledge proof
- `VERIFICATION_FAILED`: Failed to verify zero-knowledge proof

## Zero-Knowledge Proofs

### Proof Generation

```typescript
interface ProofInput {
  notes: Note[];
  recipient: string;
  amount: bigint;
  privateKey: string;
}

function generateProof(input: ProofInput): Promise<Proof>;
```

### Proof Verification

```typescript
interface Proof {
  proof: string;
  publicInputs: string[];
}

function verifyProof(proof: Proof): Promise<boolean>;
```

## Merkle Tree

### Tree Management

```typescript
interface MerkleTree {
  root: string;
  leaves: string[];
  depth: number;
}

function createMerkleTree(leaves: string[]): MerkleTree;
function getMerkleProof(tree: MerkleTree, leaf: string): string[];
function verifyMerkleProof(proof: string[], leaf: string, root: string): boolean;
```

## Encryption

### Note Encryption

```typescript
function encryptNote(note: Note, key: string): string;
function decryptNote(encrypted: string, key: string): Note;
```

## Hashing

### Hash Functions

```typescript
function hash(input: string): string;
function poseidonHash(input: bigint): bigint;
function poseidonHashMany(inputs: bigint[]): bigint;
```

## Math Utilities

### Modular Arithmetic

```typescript
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint;
function modInverse(value: bigint, modulus: bigint): bigint;
function modAdd(a: bigint, b: bigint, modulus: bigint): bigint;
function modSub(a: bigint, b: bigint, modulus: bigint): bigint;
function modMul(a: bigint, b: bigint, modulus: bigint): bigint;
```

## Constants

### Protocol Constants

```typescript
const MAX_NOTE_AMOUNT: bigint = 2n ** 64n - 1n;
const MIN_NOTE_AMOUNT: bigint = 1n;
const NOTE_COMMITMENT_TREE_DEPTH: number = 32;
const MERKLE_TREE_DEPTH: number = 32;
```

## Type Definitions

### Common Types

```typescript
type Address = string;
type PrivateKey = string;
type ViewKey = string;
type Commitment = string;
type Nullifier = string;
type Proof = string;
type MerkleProof = string[];
```

## Best Practices

### Error Handling

```typescript
try {
  await cipherPay.transfer(notes, recipient, amount);
} catch (error) {
  if (error instanceof CipherPayError) {
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        // Handle insufficient balance
        break;
      case 'TRANSACTION_FAILED':
        // Handle transaction failure
        break;
      default:
        // Handle other errors
    }
  }
}
```

### Event Handling

```typescript
cipherPay.on('transactionSubmitted', (txHash) => {
  console.log(`Transaction submitted: ${txHash}`);
});

cipherPay.on('transactionConfirmed', (txHash) => {
  console.log(`Transaction confirmed: ${txHash}`);
});
```

### Note Management

```typescript
// Create a new note
const note = await cipherPay.createNote(amount);

// Encrypt note for storage
const encrypted = encryptNote(note, viewKey);

// Decrypt note for spending
const decrypted = decryptNote(encrypted, viewKey);
```

### Proof Generation

```typescript
// Generate proof for transfer
const proof = await generateProof({
  notes: [note1, note2],
  recipient: recipientAddress,
  amount: transferAmount,
  privateKey: account.privateKey
});

// Verify proof
const isValid = await verifyProof(proof);
```

## Examples

### Basic Usage

```typescript
// Initialize SDK
const cipherPay = new CipherPay({
  network: Network.Testnet,
  rpcUrl: 'https://testnet.rpc.cipherpay.com',
  chainId: 1337,
  contractAddress: '0x...'
});

// Connect to network
await cipherPay.connect();

// Get account
const account = await cipherPay.getAccount();

// Create note
const note = await cipherPay.createNote(1000n);

// Transfer
const result = await cipherPay.transfer(
  [note],
  recipientAddress,
  500n
);
```

### Advanced Usage

```typescript
// Handle events
cipherPay.on('transactionSubmitted', async (txHash) => {
  const status = await cipherPay.getTransactionStatus(txHash);
  console.log(`Transaction status: ${status}`);
});

// Error handling
try {
  await cipherPay.transfer(notes, recipient, amount);
} catch (error) {
  if (error instanceof CipherPayError) {
    console.error(`Error: ${error.message}`);
  }
}

// Note management
const notes = await cipherPay.getNotes();
const encrypted = notes.map(note => encryptNote(note, viewKey));
```

## Support

For API-related issues:
- Check the [GitHub repository](https://github.com/cipherpay/sdk)
- Join the [Discord community](https://discord.gg/cipherpay)
- Contact support at support@cipherpay.com 