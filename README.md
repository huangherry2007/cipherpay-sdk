# CipherPay Wallet SDK

> Privacy-preserving SDK for shielded token transfers on Ethereum, Solana, and other blockchains using zero-knowledge proofs.

---

## Overview

The CipherPay SDK provides developers with the tools to generate, manage, and submit zero-knowledge private transactions on supported blockchains. It enables wallet providers, dApps, and relayers to build end-to-end private payment flows using zk-SNARKs or zk-STARKs.

- **Shielded transfers** - Private token transfers with zero-knowledge proofs
- **Merkle tree proof generation** - Efficient proof of note ownership
- **Encrypted note handling** - Secure storage and management of shielded notes
- **Gasless relayer support** - Optional meta-transaction support
- **View key export for audits** - Compliance-friendly selective disclosure

---

## Features

- Generate zkProofs for shielded transfers (Circom or RISC Zero)
- Encrypt/decrypt notes and commitments
- Build and sign meta-transactions
- Submit to relayer networks
- Interface with MetaMask, Phantom, or custom providers
- Export selective view keys for compliance
- Support for multiple token standards (ERC20, SPL, etc.)
- Cross-chain compatibility
- Gas optimization strategies
- Comprehensive error handling

---

## Installation

```bash
# Using npm
npm install @cipherpay/sdk

# Using yarn
yarn add @cipherpay/sdk

# Using pnpm
pnpm add @cipherpay/sdk
```

### Prerequisites

- Node.js >= 16.x
- TypeScript >= 4.5
- Web3 provider (MetaMask, WalletConnect, etc.)

---

## Quick Start

```typescript
import { 
  WalletProvider, 
  TransactionBuilder, 
  RelayerClient,
  NoteManager 
} from '@cipherpay/sdk'

// 1. Initialize SDK components
const wallet = new WalletProvider()
const noteManager = new NoteManager()
const relayer = new RelayerClient()

// 2. Connect to user wallet
await wallet.connect()
const address = await wallet.getPublicAddress()

// 3. Create and manage notes
const note = await noteManager.createNote({
  amount: 100n,
  recipient: address
})

// 4. Build shielded transfer
const builder = new TransactionBuilder(wallet)
const encryptedTx = await builder.buildTransfer({
  inputNotes: [note],
  recipient: '0xRecipientStealthKey',
  amount: 50n,
})

// 5. Send via relayer
const result = await relayer.sendToRelayer(encryptedTx)
console.log('Transaction submitted:', result)
```

---

## Core Components

### WalletProvider
Handles wallet connections and transaction signing:
```typescript
const wallet = new WalletProvider({
  provider: 'metamask', // or 'phantom', 'walletconnect'
  network: 'ethereum'   // or 'solana', 'polygon'
})

// Connect wallet
await wallet.connect()

// Get public address
const address = await wallet.getPublicAddress()

// Sign message
const signature = await wallet.signMessage(message)
```

### NoteManager
Manages shielded notes and commitments:
```typescript
const noteManager = new NoteManager()

// Create new note
const note = await noteManager.createNote({
  amount: 100n,
  recipient: address
})

// Get spendable notes
const spendableNotes = noteManager.getSpendableNotes()

// Calculate total balance
const balance = noteManager.getBalance()
```

### TransactionBuilder
Builds and signs private transactions:
```typescript
const builder = new TransactionBuilder(wallet)

// Build transfer
const tx = await builder.buildTransfer({
  inputNotes: notes,
  recipient: recipientAddress,
  amount: 50n
})

// Build withdrawal
const withdrawal = await builder.buildWithdrawal({
  inputNotes: notes,
  recipient: recipientAddress,
  amount: 25n
})
```

### RelayerClient
Handles meta-transactions and gasless transfers:
```typescript
const relayer = new RelayerClient({
  apiKey: 'your-api-key',
  network: 'ethereum'
})

// Send transaction
const result = await relayer.sendToRelayer(tx)

// Check status
const status = await relayer.getTransactionStatus(txHash)
```

---

## Advanced Usage

### Zero-Knowledge Proofs
```typescript
import { ZKProver } from '@cipherpay/sdk'

const prover = new ZKProver({
  circuit: './circuits/transfer.wasm',
  provingKey: './circuits/transfer.zkey'
})

// Generate proof
const proof = await prover.generateProof({
  notes: inputNotes,
  recipient: recipientAddress,
  amount: transferAmount
})

// Verify proof
const isValid = await prover.verifyProof(proof)
```

### Merkle Tree Operations
```typescript
import { createMerkleTree, getMerkleProof } from '@cipherpay/sdk'

// Create tree from notes
const tree = createMerkleTree(notes.map(note => note.commitment))

// Get proof for note
const proof = getMerkleProof(tree, note.commitment)

// Verify proof
const isValid = verifyMerkleProof(proof, note.commitment, tree.root)
```

### Note Encryption
```typescript
import { encryptNote, decryptNote } from '@cipherpay/sdk'

// Encrypt note for storage
const encrypted = encryptNote(note, viewKey)

// Decrypt note for spending
const decrypted = decryptNote(encrypted, viewKey)
```

---

## Security Considerations

- Never store private keys in plain text
- Use secure key storage solutions
- Implement proper access controls
- Regular security audits
- Follow best practices for key management
- Implement proper error handling
- Use secure RPC endpoints

---

## Error Handling

```typescript
try {
  await wallet.connect()
} catch (error) {
  if (error instanceof CipherPayError) {
    switch (error.code) {
      case 'WALLET_CONNECTION_ERROR':
        // Handle wallet connection error
        break
      case 'INSUFFICIENT_BALANCE':
        // Handle insufficient balance
        break
      default:
        // Handle other errors
    }
  }
}
```

---

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- [Documentation](https://docs.cipherpay.com)
- [GitHub Issues](https://github.com/cipherpay/sdk/issues)
- [Discord Community](https://discord.gg/cipherpay)
- Email: support@cipherpay.com

---
