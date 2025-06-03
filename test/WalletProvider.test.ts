import { WalletProvider } from '../src/core/WalletProvider';
import { Logger } from '../src/utils/logger';
import { ethers } from 'ethers';

// Mock ethers
jest.mock('ethers', () => ({
    providers: {
        Web3Provider: jest.fn().mockImplementation(() => ({
            send: jest.fn().mockResolvedValue(['0x123']),
            getSigner: jest.fn().mockReturnValue({
                getAddress: jest.fn().mockResolvedValue('0x123')
            })
        }))
    },
    utils: {
        parseEther: jest.fn().mockReturnValue('1000000000000000000')
    },
    Contract: jest.fn().mockImplementation(() => ({
        deposit: jest.fn().mockResolvedValue({
            wait: jest.fn().mockResolvedValue({
                transactionHash: '0xabc',
                status: 1,
                blockNumber: 123
            })
        })
    }))
}));

// Mock the logger
jest.mock('../src/utils/logger', () => ({
    Logger: {
        getInstance: jest.fn().mockReturnValue({
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn()
        })
    }
}));

describe('WalletProvider', () => {
    let walletProvider: WalletProvider;
    const mockLogger = Logger.getInstance();

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Create a new instance for each test
        walletProvider = new WalletProvider('ethereum');
    });

    describe('constructor', () => {
        it('should initialize with the correct chain type', () => {
            expect(walletProvider.getChainType()).toBe('ethereum');
        });

        it('should throw error for unsupported chain type', () => {
            expect(() => new WalletProvider('unsupported' as any)).toThrow('Unsupported chain type: unsupported');
        });
    });

    describe('connect', () => {
        it('should connect successfully to Ethereum', async () => {
            // Mock window.ethereum
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x123']),
                on: jest.fn(),
                removeListener: jest.fn()
            };
            (window as any).ethereum = mockEthereum;

            const account = await walletProvider.connect();
            expect(account.address).toBe('0x123');
            expect(account.chainType).toBe('ethereum');
        });

        it('should handle connection error', async () => {
            // Mock window.ethereum with error
            const mockEthereum = {
                request: jest.fn().mockRejectedValue(new Error('User rejected')),
                on: jest.fn(),
                removeListener: jest.fn()
            };
            (window as any).ethereum = mockEthereum;

            await expect(walletProvider.connect()).rejects.toThrow('Failed to connect wallet: User rejected');
        });

        it('should throw error if MetaMask is not installed', async () => {
            (window as any).ethereum = undefined;
            await expect(walletProvider.connect()).rejects.toThrow('MetaMask not installed');
        });
    });

    describe('disconnect', () => {
        it('should disconnect successfully', async () => {
            // Mock window.ethereum
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x123']),
                on: jest.fn(),
                removeListener: jest.fn()
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            await walletProvider.disconnect();
            expect(walletProvider.isConnected()).toBe(false);
        });
    });

    describe('getPublicAddress', () => {
        it('should return the public address', async () => {
            // Mock window.ethereum
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x123']),
                on: jest.fn(),
                removeListener: jest.fn()
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            expect(walletProvider.getPublicAddress()).toBe('0x123');
        });

        it('should throw error if not connected', () => {
            expect(() => walletProvider.getPublicAddress()).toThrow('No wallet connected');
        });
    });

    describe('signAndSendDepositTx', () => {
        it('should send deposit transaction successfully', async () => {
            // Mock window.ethereum
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x123']),
                on: jest.fn(),
                removeListener: jest.fn()
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            const receipt = await walletProvider.signAndSendDepositTx(1);
            expect(receipt).toEqual({
                txHash: '0xabc',
                chainType: 'ethereum',
                status: 'success',
                blockNumber: 123
            });
        });

        it('should throw error if not connected', async () => {
            await expect(walletProvider.signAndSendDepositTx(1)).rejects.toThrow('No wallet connected');
        });
    });

    describe('isConnected', () => {
        it('should return false when not connected', () => {
            expect(walletProvider.isConnected()).toBe(false);
        });

        it('should return true when connected', async () => {
            // Mock window.ethereum
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x123']),
                on: jest.fn(),
                removeListener: jest.fn()
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            expect(walletProvider.isConnected()).toBe(true);
        });
    });
});

