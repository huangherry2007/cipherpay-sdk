// Import classes for global exposure
import { CipherPaySDK } from './core/CipherPaySDK';
import { ChainType } from './core/WalletProvider';

// Browser-compatible exports
export { CipherPaySDK } from './core/CipherPaySDK';
export { ChainType } from './core/WalletProvider';

// Default export
export { CipherPaySDK as default } from './core/CipherPaySDK';

// Type exports
export * from './types/Note';
export * from './types/ZKProof';
export * from './types/CipherTx';

// Utility exports
export * from './utils/encryption';
export * from './utils/hash';

// Error exports
export { ErrorHandler, ErrorType, ErrorContext } from './errors/ErrorHandler';

// Create ChainType value for global exposure
const ChainTypeValue = {
    ethereum: 'ethereum' as ChainType,
    solana: 'solana' as ChainType
};

// Global exposure for browser
if (typeof window !== 'undefined') {
    (window as any).CipherPaySDK = CipherPaySDK;
    (window as any).ChainType = ChainTypeValue;
}