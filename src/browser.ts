// Browser-specific entry point for CipherPay SDK
import { CipherPaySDK } from './core/CipherPaySDK';
import { WalletProvider } from './core/WalletProvider';

// Export the main SDK class
export { CipherPaySDK };

// Export types and utilities
export { WalletProvider };

// Make it available globally for browser use
if (typeof window !== 'undefined') {
    (window as any).CipherPaySDK = CipherPaySDK;
    (window as any).WalletProvider = WalletProvider;
} 