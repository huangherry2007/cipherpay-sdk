# Examples

This document provides examples of common use cases for the CipherPay SDK.

## Basic Usage

### Initialization

```typescript
import { CipherPay, Network } from '@cipherpay/sdk';

// Initialize SDK
const cipherPay = new CipherPay({
  network: Network.Testnet,
  rpcUrl: 'https://testnet.rpc.cipherpay.com',
  chainId: 1337,
  contractAddress: '0x...'
});

// Connect to network
await cipherPay.connect();
```

### Account Management

```typescript
// Get account
const account = await cipherPay.getAccount();
console.log(`Address: ${account.address}`);
console.log(`Balance: ${account.balance}`);

// Get notes
const notes = await cipherPay.getNotes();
console.log(`Number of notes: ${notes.length}`);
```

### Creating Notes

```typescript
// Create a new note
const note = await cipherPay.createNote(1000n);
console.log(`Created note with amount: ${note.amount}`);

// Encrypt note for storage
const encrypted = encryptNote(note, account.viewKey);
console.log(`Encrypted note: ${encrypted}`);
```

### Transfers

```typescript
// Transfer to recipient
const result = await cipherPay.transfer(
  [note],
  recipientAddress,
  500n
);
console.log(`Transaction hash: ${result.txHash}`);

// Wait for confirmation
const status = await cipherPay.getTransactionStatus(result.txHash);
console.log(`Transaction status: ${status}`);
```

## Advanced Usage

### Event Handling

```typescript
// Listen for transaction events
cipherPay.on('transactionSubmitted', (txHash) => {
  console.log(`Transaction submitted: ${txHash}`);
});

cipherPay.on('transactionConfirmed', (txHash) => {
  console.log(`Transaction confirmed: ${txHash}`);
});

cipherPay.on('transactionFailed', (error) => {
  console.error(`Transaction failed: ${error.message}`);
});

// Listen for account events
cipherPay.on('accountChanged', (account) => {
  console.log(`Account changed: ${account.address}`);
});

cipherPay.on('balanceChanged', (balance) => {
  console.log(`Balance changed: ${balance}`);
});

cipherPay.on('notesChanged', (notes) => {
  console.log(`Notes changed: ${notes.length}`);
});
```

### Error Handling

```typescript
try {
  await cipherPay.transfer(notes, recipient, amount);
} catch (error) {
  if (error instanceof CipherPayError) {
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        console.error('Insufficient balance for transfer');
        break;
      case 'TRANSACTION_FAILED':
        console.error('Transaction failed to execute');
        break;
      case 'PROOF_GENERATION_FAILED':
        console.error('Failed to generate zero-knowledge proof');
        break;
      default:
        console.error(`Unknown error: ${error.message}`);
    }
  }
}
```

### Note Management

```typescript
// Get all notes
const notes = await cipherPay.getNotes();

// Filter notes by amount
const largeNotes = notes.filter(note => note.amount > 1000n);

// Encrypt all notes
const encryptedNotes = notes.map(note => encryptNote(note, viewKey));

// Decrypt notes
const decryptedNotes = encryptedNotes.map(encrypted => 
  decryptNote(encrypted, viewKey)
);

// Calculate total balance
const totalBalance = notes.reduce((sum, note) => sum + note.amount, 0n);
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
if (!isValid) {
  throw new Error('Invalid proof');
}
```

### Merkle Tree Operations

```typescript
// Create merkle tree from notes
const leaves = notes.map(note => note.commitment);
const tree = createMerkleTree(leaves);

// Get proof for note
const proof = getMerkleProof(tree, note.commitment);

// Verify proof
const isValid = verifyMerkleProof(
  proof,
  note.commitment,
  tree.root
);
```

## Integration Examples

### Web3 Integration

```typescript
import { ethers } from 'ethers';
import { CipherPay } from '@cipherpay/sdk';

// Initialize Web3 provider
const provider = new ethers.providers.Web3Provider(window.ethereum);

// Initialize SDK with provider
const cipherPay = new CipherPay({
  network: Network.Mainnet,
  rpcUrl: provider.connection.url,
  chainId: (await provider.getNetwork()).chainId,
  contractAddress: '0x...'
});

// Connect wallet
await provider.send('eth_requestAccounts', []);
const signer = provider.getSigner();
await cipherPay.connect();
```

### React Integration

```typescript
import React, { useEffect, useState } from 'react';
import { CipherPay } from '@cipherpay/sdk';

function App() {
  const [cipherPay, setCipherPay] = useState<CipherPay | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);

  useEffect(() => {
    // Initialize SDK
    const sdk = new CipherPay({
      network: Network.Testnet,
      rpcUrl: 'https://testnet.rpc.cipherpay.com',
      chainId: 1337,
      contractAddress: '0x...'
    });

    // Connect to network
    sdk.connect().then(() => {
      setCipherPay(sdk);
    });

    // Cleanup
    return () => {
      sdk.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!cipherPay) return;

    // Get account
    cipherPay.getAccount().then(setAccount);

    // Listen for account changes
    const handleAccountChange = (newAccount: Account) => {
      setAccount(newAccount);
    };

    cipherPay.on('accountChanged', handleAccountChange);

    return () => {
      cipherPay.off('accountChanged', handleAccountChange);
    };
  }, [cipherPay]);

  useEffect(() => {
    if (!cipherPay) return;

    // Get balance
    cipherPay.getBalance().then(setBalance);

    // Listen for balance changes
    const handleBalanceChange = (newBalance: bigint) => {
      setBalance(newBalance);
    };

    cipherPay.on('balanceChanged', handleBalanceChange);

    return () => {
      cipherPay.off('balanceChanged', handleBalanceChange);
    };
  }, [cipherPay]);

  return (
    <div>
      <h1>CipherPay Demo</h1>
      {account && (
        <div>
          <p>Address: {account.address}</p>
          <p>Balance: {balance.toString()}</p>
        </div>
      )}
    </div>
  );
}
```

### Node.js Integration

```typescript
import { CipherPay } from '@cipherpay/sdk';
import { ethers } from 'ethers';

async function main() {
  // Initialize provider
  const provider = new ethers.providers.JsonRpcProvider(
    'https://testnet.rpc.cipherpay.com'
  );

  // Initialize SDK
  const cipherPay = new CipherPay({
    network: Network.Testnet,
    rpcUrl: provider.connection.url,
    chainId: (await provider.getNetwork()).chainId,
    contractAddress: '0x...'
  });

  // Connect to network
  await cipherPay.connect();

  // Get account
  const account = await cipherPay.getAccount();
  console.log(`Address: ${account.address}`);

  // Create note
  const note = await cipherPay.createNote(1000n);
  console.log(`Created note: ${note.commitment}`);

  // Transfer
  const result = await cipherPay.transfer(
    [note],
    recipientAddress,
    500n
  );
  console.log(`Transaction hash: ${result.txHash}`);
}

main().catch(console.error);
```

## Testing Examples

### Unit Testing

```typescript
import { CipherPay } from '@cipherpay/sdk';
import { expect } from 'chai';

describe('CipherPay', () => {
  let cipherPay: CipherPay;

  beforeEach(() => {
    cipherPay = new CipherPay({
      network: Network.Testnet,
      rpcUrl: 'https://testnet.rpc.cipherpay.com',
      chainId: 1337,
      contractAddress: '0x...'
    });
  });

  it('should connect to network', async () => {
    await cipherPay.connect();
    expect(cipherPay.isConnected()).to.be.true;
  });

  it('should create note', async () => {
    const note = await cipherPay.createNote(1000n);
    expect(note.amount).to.equal(1000n);
  });

  it('should transfer notes', async () => {
    const note = await cipherPay.createNote(1000n);
    const result = await cipherPay.transfer(
      [note],
      recipientAddress,
      500n
    );
    expect(result.txHash).to.be.a('string');
  });
});
```

### Integration Testing

```typescript
import { CipherPay } from '@cipherpay/sdk';
import { expect } from 'chai';

describe('CipherPay Integration', () => {
  let cipherPay: CipherPay;

  before(async () => {
    cipherPay = new CipherPay({
      network: Network.Testnet,
      rpcUrl: 'https://testnet.rpc.cipherpay.com',
      chainId: 1337,
      contractAddress: '0x...'
    });
    await cipherPay.connect();
  });

  after(async () => {
    await cipherPay.disconnect();
  });

  it('should handle full transfer flow', async () => {
    // Create note
    const note = await cipherPay.createNote(1000n);
    expect(note.amount).to.equal(1000n);

    // Get initial balance
    const initialBalance = await cipherPay.getBalance();

    // Transfer
    const result = await cipherPay.transfer(
      [note],
      recipientAddress,
      500n
    );
    expect(result.txHash).to.be.a('string');

    // Wait for confirmation
    const status = await cipherPay.getTransactionStatus(result.txHash);
    expect(status).to.equal('confirmed');

    // Check final balance
    const finalBalance = await cipherPay.getBalance();
    expect(finalBalance).to.be.below(initialBalance);
  });
});
```

## Support

For more examples and help:
- Check the [GitHub repository](https://github.com/cipherpay/sdk)
- Join the [Discord community](https://discord.gg/cipherpay)
- Contact support at support@cipherpay.com 