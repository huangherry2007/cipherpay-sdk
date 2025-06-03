# CipherPay Wallet SDK

> Privacy-preserving SDK for shielded token transfers on Ethereum, Solana, and other blockchains using zero-knowledge proofs.

---

## Overview

The CipherPay SDK provides developers with the tools to generate, manage, and submit zero-knowledge private transactions on supported blockchains. It enables wallet providers, dApps, and relayers to build end-to-end private payment flows using zk-SNARKs or zk-STARKs.

- **Shielded transfers**
- **Merkle tree proof generation**
- **Encrypted note handling**
- **Gasless relayer support**
- **View key export for audits**

---

## Features

- Generate zkProofs for shielded transfers (Circom or RISC Zero)
- Encrypt/decrypt notes and commitments
- Build and sign meta-transactions
- Submit to relayer networks
- Interface with MetaMask, Phantom, or custom providers
- Export selective view keys for compliance

---

## Installation

```bash
npm install @cipherpay/sdk
# or
yarn add @cipherpay/sdk

## Usage Example

import { WalletProvider, TransactionBuilder, RelayerClient } from '@cipherpay/sdk'

// 1. Connect to user wallet
const wallet = new WalletProvider()
await wallet.connect()

// 2. Build shielded transfer
const builder = new TransactionBuilder(wallet)
const encryptedTx = await builder.buildTransfer({
  recipient: '0xRecipientStealthKey',
  amount: 100,
})

// 3. Send via relayer
const relayer = new RelayerClient()
const result = await relayer.sendToRelayer(encryptedTx)
console.log('Tx submitted:', result)

---
