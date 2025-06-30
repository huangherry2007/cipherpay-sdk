import { WalletProvider } from '../src/core/WalletProvider';
import { Logger } from '../src/utils/logger';

// Mock ethers at the module level
jest.doMock('ethers', () => {
  const mockSend = jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']);
  const mockGetAddress = jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890');
  const mockGetSigner = jest.fn().mockReturnValue({
    getAddress: mockGetAddress
  });

  const mockWeb3Provider = {
    send: mockSend,
    getSigner: mockGetSigner,
    provider: {
      send: mockSend
    }
  };

  const mockContract = {
    deposit: jest.fn().mockResolvedValue({
      wait: jest.fn().mockResolvedValue({
        transactionHash: '0xabc123',
        status: 1,
        blockNumber: 12345
      })
    })
  };

  return {
    ethers: {
      providers: {
        Web3Provider: jest.fn().mockImplementation(() => mockWeb3Provider),
        JsonRpcProvider: jest.fn()
      },
      Contract: jest.fn().mockImplementation(() => mockContract),
      utils: {
        parseEther: jest.fn().mockReturnValue({ toString: () => '1000000000000000000' })
      }
    }
  };
});

// Import ethers after mocking
const { ethers } = require('ethers');

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
    let WalletProvider: any;
    let ethers: any;
    let walletProvider: any;
    const mockLogger = Logger.getInstance();

    beforeEach(() => {
        jest.resetModules();
        jest.doMock('ethers', () => {
            const mockSend = jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']);
            const mockGetAddress = jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890');
            const mockGetSigner = jest.fn().mockReturnValue({
                getAddress: mockGetAddress
            });
            const mockWeb3Provider = {
                send: mockSend,
                getSigner: mockGetSigner,
                provider: {
                    send: mockSend
                }
            };
            const mockContract = {
                deposit: jest.fn().mockResolvedValue({
                    wait: jest.fn().mockResolvedValue({
                        transactionHash: '0xabc123',
                        status: 1,
                        blockNumber: 12345
                    })
                })
            };
            return {
                ethers: {
                    providers: {
                        Web3Provider: jest.fn().mockImplementation(() => mockWeb3Provider),
                        JsonRpcProvider: jest.fn()
                    },
                    Contract: jest.fn().mockImplementation(() => mockContract),
                    utils: {
                        parseEther: jest.fn().mockReturnValue({ toString: () => '1000000000000000000' })
                    }
                }
            };
        });
        ethers = require('ethers').ethers;
        WalletProvider = require('../src/core/WalletProvider').WalletProvider;
        walletProvider = new WalletProvider('ethereum', {
            rpcUrl: 'https://mainnet.infura.io/v3/test'
        });
        delete (window as any).ethereum;
    });

    describe('constructor', () => {
        it('should initialize with the correct chain type', () => {
            expect(walletProvider.getChainType()).toBe('ethereum');
        });

        it('should throw error for unsupported chain type', () => {
            expect(() => new WalletProvider('unsupported' as any, {
                rpcUrl: 'https://mainnet.infura.io/v3/test'
            })).toThrow('Unsupported chain type');
        });
    });

    describe('connect', () => {
        it('should connect successfully to Ethereum', async () => {
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
            };
            (window as any).ethereum = mockEthereum;

            console.log('DEBUG: Test - window.ethereum:', (window as any).ethereum);
            console.log('DEBUG: Test - ethers.providers.Web3Provider:', ethers.providers.Web3Provider);
            console.log('DEBUG: Test - ethers.providers.Web3Provider constructor:', typeof ethers.providers.Web3Provider);

            try {
                const result = await walletProvider.connect();
                console.log('DEBUG: Test - result.provider:', result.provider);
                console.log('DEBUG: Test - result.provider prototype:', Object.getPrototypeOf(result.provider));
                if (result.provider) {
                    let proto = Object.getPrototypeOf(result.provider);
                    while (proto) {
                        console.log('DEBUG: Test - provider proto:', proto);
                        proto = Object.getPrototypeOf(proto);
                    }
                }
                expect(result.address).toBe('0x1234567890123456789012345678901234567890');
                expect(result.chainType).toBe('ethereum');
            } catch (error) {
                console.log('DEBUG: Test - Error caught:', error);
                throw error;
            }
        });

        it('should handle connection error', async () => {
            const mockEthereum = {
                request: jest.fn().mockRejectedValue(new Error('User rejected'))
            };
            (window as any).ethereum = mockEthereum;

            // Mock the Web3Provider to throw an error
            const mockWeb3Provider = {
                send: jest.fn().mockRejectedValue(new Error('User rejected')),
                getSigner: jest.fn().mockReturnValue({
                    getAddress: jest.fn().mockRejectedValue(new Error('User rejected'))
                }),
                provider: mockEthereum
            };
            (ethers.providers.Web3Provider as unknown as jest.Mock).mockImplementation(() => mockWeb3Provider);

            await expect(walletProvider.connect()).rejects.toThrow('Failed to connect wallet: User rejected');
        });

        it('should throw error if MetaMask is not installed', async () => {
            await expect(walletProvider.connect()).rejects.toThrow('Failed to connect wallet: MetaMask not installed');
        });
    });

    describe('disconnect', () => {
        it('should disconnect successfully', async () => {
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            await walletProvider.disconnect();
            expect(walletProvider.isConnected()).toBe(false);
        });
    });

    describe('getPublicAddress', () => {
        it('should return the public address', async () => {
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            const address = walletProvider.getPublicAddress();
            expect(address).toBe('0x1234567890123456789012345678901234567890');
        });

        it('should throw error if not connected', () => {
            expect(() => walletProvider.getPublicAddress()).toThrow('No wallet connected');
        });
    });

    describe('signAndSendDepositTx', () => {
        it('should send deposit transaction successfully', async () => {
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            const result = await walletProvider.signAndSendDepositTx(1.0);
            expect(result.txHash).toBe('0xabc123');
            expect(result.status).toBe('success');
        });

        it('should throw error if not connected', async () => {
            await expect(walletProvider.signAndSendDepositTx(1.0)).rejects.toThrow('No wallet connected');
        });
    });

    describe('isConnected', () => {
        it('should return false when not connected', () => {
            expect(walletProvider.isConnected()).toBe(false);
        });

        it('should return true when connected', async () => {
            const mockEthereum = {
                request: jest.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890'])
            };
            (window as any).ethereum = mockEthereum;

            await walletProvider.connect();
            expect(walletProvider.isConnected()).toBe(true);
        });
    });
});

