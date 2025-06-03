# Getting Started with CipherPay SDK

This guide will help you get started with the CipherPay SDK for building privacy-preserving applications.

## Installation

```bash
npm install @cipherpay/sdk
# or
yarn add @cipherpay/sdk
```

## Basic Usage

### 1. Initialize the SDK

```typescript
import { WalletProvider, NoteManager } from '@cipherpay/sdk';

// Initialize wallet provider
const wallet = new WalletProvider('ethereum');

// Initialize note manager
const noteManager = new NoteManager();
```

### 2. Connect Wallet

```typescript
// Connect to user's wallet
await wallet.connect();
const address = await wallet.getPublicAddress();
console.log('Connected wallet:', address);
```

### 3. Create and Manage Notes

```typescript
// Create a new shielded note
const note = createNote('1000000000000000000', recipientAddress); // 1 ETH
noteManager.addNote(note);

// Get spendable notes
const spendableNotes = noteManager.getSpendableNotes();
console.log('Spendable balance:', noteManager.getBalance());
```

### 4. Perform a Transfer

```typescript
import { TransferBuilder, ZKProver } from '@cipherpay/sdk';

// Initialize components
const zkProver = new ZKProver(
    './circuits/transfer.wasm',
    './circuits/transfer.zkey'
);

const builder = new TransferBuilder(
    wallet,
    noteManager,
    zkProver
);

// Build and send transfer
const transfer = await builder
    .setInputNotes(spendableNotes)
    .setOutputNote(outputNote)
    .setProof(proof)
    .build();

const receipt = await transfer.send();
console.log('Transfer successful:', receipt);
```

## Key Concepts

### Shielded Notes
Shielded notes are the basic unit of privacy in CipherPay. Each note contains:
- An amount
- A commitment (hash of the note)
- A nullifier (used to spend the note)
- Encryption for the recipient

### Zero-Knowledge Proofs
CipherPay uses zero-knowledge proofs to ensure:
- The sender has sufficient balance
- The transfer amount is correct
- No double-spending occurs
- All while maintaining privacy

### Merkle Trees
The system uses Merkle trees to:
- Efficiently prove note ownership
- Maintain a compact representation of all notes
- Enable privacy-preserving transfers

## Next Steps

1. Read the [API Reference](../API_REFERENCE.md) for detailed documentation
2. Check out the [Examples](./EXAMPLES.md) for more use cases
3. Review the [Security Best Practices](./SECURITY.md) before deploying to production
4. Join our [Discord community](https://discord.gg/cipherpay) for support

## Common Issues

### Wallet Connection
- Ensure MetaMask is installed and unlocked
- Check if you're on the correct network
- Verify the wallet has sufficient funds

### Note Management
- Notes must be properly encrypted for recipients
- Keep track of spent notes to avoid double-spending
- Regularly sync with the blockchain for new notes

### Transfer Issues
- Ensure sufficient balance in spendable notes
- Verify the proof generation is correct
- Check gas fees for the transaction

## Support

For additional help:
- Open an issue on [GitHub](https://github.com/cipherpay/sdk)
- Join our [Discord community](https://discord.gg/cipherpay)
- Email support@cipherpay.com 