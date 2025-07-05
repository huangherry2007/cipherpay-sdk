// Core exports
export { NoteManager, ShieldedNote } from './core/NoteManager';
export { ViewKeyManager } from './core/ViewKeyManager';
export { WalletProvider, ChainType } from './core/WalletProvider';
export { MerkleTreeClient } from './core/MerkleTreeClient';
export { CipherPaySDK } from './core/CipherPaySDK';

// Phase 2 enhancements
export { StealthAddressManager, StealthAddress, StealthAddressConfig } from './core/StealthAddressManager';
export { ComplianceManager, ComplianceConfig, ComplianceRule, AuditTrail, ComplianceReport } from './compliance/ComplianceManager';
export { CacheManager, CacheConfig, CacheEntry } from './utils/CacheManager';

// Transaction exports
export { TransactionBuilder } from './tx/TransactionBuilder';
export { TransactionSigner } from './tx/TransactionSigner';
export { ReshieldBuilder } from './tx/ReshieldBuilder';
export { WithdrawBuilder } from './tx/WithdrawBuilder';

// Relayer exports
export { RelayerClient } from './relayer/RelayerClient';
export { RelayerAPI, RelayerConfig, RelayerRequest, RelayerResponse } from './relayer/RelayerAPI';

// ZK exports
export { ZKProver } from './zk/ZKProver';
export { ZKProofGenerator } from './zkp/ZKProofGenerator';

// Event exports
export { EventMonitor } from './events/EventMonitor';

// Type exports
export * from './types/Note';
export * from './types/ZKProof';
export * from './types/CipherTx';

// Utility exports
export * from './utils/encryption';
export * from './utils/hash';

// Monitoring & Observability exports
export * from './monitoring';

// Error exports
export { ErrorHandler, ErrorType, ErrorContext } from './errors/ErrorHandler';