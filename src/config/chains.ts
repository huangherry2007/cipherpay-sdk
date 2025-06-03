import { ChainType } from '../core/WalletProvider';

/**
 * Chain configuration interface
 */
export interface ChainConfig {
    /**
     * Chain ID
     */
    chainId: number;
    
    /**
     * Chain name
     */
    name: string;
    
    /**
     * RPC URL for the chain
     */
    rpcUrl: string;
    
    /**
     * Block explorer URL
     */
    explorerUrl: string;
    
    /**
     * Native currency symbol
     */
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    
    /**
     * Contract addresses for this chain
     */
    contracts: {
        /**
         * CipherPay contract address
         */
        cipherPay: string;
        
        /**
         * Token registry contract address
         */
        tokenRegistry: string;
        
        /**
         * Relayer contract address
         */
        relayer: string;
    };
    
    /**
     * Chain type (EVM or Solana)
     */
    type: ChainType;
}

/**
 * Supported chain configurations
 */
export const CHAINS: { [key: string]: ChainConfig } = {
    // Ethereum Mainnet
    ethereum: {
        chainId: 1,
        name: 'Ethereum',
        rpcUrl: 'https://mainnet.infura.io/v3/YOUR-PROJECT-ID',
        explorerUrl: 'https://etherscan.io',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18
        },
        contracts: {
            cipherPay: '0x...', // Replace with actual address
            tokenRegistry: '0x...', // Replace with actual address
            relayer: '0x...' // Replace with actual address
        },
        type: 'ethereum'
    },
    
    // Ethereum Goerli Testnet
    goerli: {
        chainId: 5,
        name: 'Goerli',
        rpcUrl: 'https://goerli.infura.io/v3/YOUR-PROJECT-ID',
        explorerUrl: 'https://goerli.etherscan.io',
        nativeCurrency: {
            name: 'Goerli Ether',
            symbol: 'ETH',
            decimals: 18
        },
        contracts: {
            cipherPay: '0x...', // Replace with actual address
            tokenRegistry: '0x...', // Replace with actual address
            relayer: '0x...' // Replace with actual address
        },
        type: 'ethereum'
    },
    
    // Solana Mainnet
    solana: {
        chainId: 0, // Solana doesn't use chainId
        name: 'Solana',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        explorerUrl: 'https://explorer.solana.com',
        nativeCurrency: {
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9
        },
        contracts: {
            cipherPay: '...', // Replace with actual program ID
            tokenRegistry: '...', // Replace with actual program ID
            relayer: '...' // Replace with actual program ID
        },
        type: 'solana'
    },
    
    // Solana Devnet
    'solana-devnet': {
        chainId: 0, // Solana doesn't use chainId
        name: 'Solana Devnet',
        rpcUrl: 'https://api.devnet.solana.com',
        explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
        nativeCurrency: {
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9
        },
        contracts: {
            cipherPay: '...', // Replace with actual program ID
            tokenRegistry: '...', // Replace with actual program ID
            relayer: '...' // Replace with actual program ID
        },
        type: 'solana'
    }
};

/**
 * Get chain configuration by chain ID
 * @param chainId Chain ID to look up
 * @returns Chain configuration or undefined if not found
 */
export function getChainById(chainId: number): ChainConfig | undefined {
    return Object.values(CHAINS).find(chain => chain.chainId === chainId);
}

/**
 * Get chain configuration by name
 * @param name Chain name to look up
 * @returns Chain configuration or undefined if not found
 */
export function getChainByName(name: string): ChainConfig | undefined {
    return CHAINS[name.toLowerCase()];
}

/**
 * Get all supported chains
 * @returns Array of chain configurations
 */
export function getSupportedChains(): ChainConfig[] {
    return Object.values(CHAINS);
}

/**
 * Get chains by type
 * @param type Chain type to filter by
 * @returns Array of chain configurations of the specified type
 */
export function getChainsByType(type: ChainType): ChainConfig[] {
    return Object.values(CHAINS).filter(chain => chain.type === type);
}
