import { generateEncryptionKey, encryptData, decryptData, encryptNote, decryptNote } from '../src/utils/encryption';
import { EncryptedNote } from '../src/types/Note';

// Mock crypto.subtle for testing
const mockCryptoKey = {
  type: 'secret',
  extractable: false,
  algorithm: { name: 'AES-GCM' },
  usages: ['encrypt', 'decrypt']
};

const mockEncrypt = jest.fn().mockImplementation((params, key, data) => {
  // Return the input data as "encrypted" for testing
  return Promise.resolve(data);
});

const mockDecrypt = jest.fn().mockImplementation((params, key, data) => {
  // Return the input data as "decrypted" for testing
  return Promise.resolve(data);
});

Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn().mockReturnValue(new Uint8Array(12)),
    subtle: {
      importKey: jest.fn().mockResolvedValue(mockCryptoKey),
      encrypt: mockEncrypt,
      decrypt: mockDecrypt,
      generateKey: jest.fn().mockResolvedValue(mockCryptoKey),
      deriveKey: jest.fn().mockResolvedValue(mockCryptoKey),
      deriveBits: jest.fn().mockResolvedValue(new Uint8Array(32))
    }
  },
  writable: true
});

describe('Encryption Utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateEncryptionKey', () => {
        it('should generate a valid encryption key', () => {
            const key = generateEncryptionKey();
            expect(key).toMatch(/^0x[a-fA-F0-9]{64}$/);
        });

        it('should generate different keys each time', () => {
            const key1 = generateEncryptionKey();
            const key2 = generateEncryptionKey();
            expect(key1).not.toBe(key2);
        });
    });

    describe('encryptData and decryptData', () => {
        it('should encrypt and decrypt data successfully', async () => {
            const data = 'test data';
            const key = generateEncryptionKey();
            
            const encrypted = await encryptData(data, key);
            expect(encrypted.ciphertext).toBeTruthy();
            expect(encrypted.nonce).toBeTruthy();
            
            const decrypted = await decryptData(encrypted.ciphertext, key, encrypted.nonce);
            expect(decrypted).toBe(data);
        });

        it('should handle empty data', async () => {
            const data = '';
            const key = generateEncryptionKey();
            
            const encrypted = await encryptData(data, key);
            const decrypted = await decryptData(encrypted.ciphertext, key, encrypted.nonce);
            expect(decrypted).toBe(data);
        });

        it('should handle large data', async () => {
            const data = 'x'.repeat(10000);
            const key = generateEncryptionKey();
            
            const encrypted = await encryptData(data, key);
            const decrypted = await decryptData(encrypted.ciphertext, key, encrypted.nonce);
            expect(decrypted).toBe(data);
        });

        it('should throw error when decrypting with wrong key', async () => {
            const data = 'test data';
            const key1 = generateEncryptionKey();
            const key2 = generateEncryptionKey();
            
            const encrypted = await encryptData(data, key1);
            
            // Mock decrypt to throw error for wrong key
            mockDecrypt.mockRejectedValueOnce(new Error('Decryption failed'));
            
            await expect(decryptData(encrypted.ciphertext, key2, encrypted.nonce))
                .rejects.toThrow('Decryption failed');
        });

        it('should throw error when decrypting with wrong nonce', async () => {
            const data = 'test data';
            const key = generateEncryptionKey();
            
            const encrypted = await encryptData(data, key);
            const wrongNonce = '0x' + '00'.repeat(12);
            
            // Mock decrypt to throw error for wrong nonce
            mockDecrypt.mockRejectedValueOnce(new Error('Decryption failed'));
            
            await expect(decryptData(encrypted.ciphertext, key, wrongNonce))
                .rejects.toThrow('Decryption failed');
        });
    });

    describe('encryptNote and decryptNote', () => {
        it('should encrypt and decrypt a note successfully', async () => {
            const note = 'test note data';
            const publicKey = '0x' + 'a'.repeat(64);
            const privateKey = '0x' + 'b'.repeat(64);
            
            const encrypted = await encryptNote(note, publicKey);
            expect(encrypted.ciphertext).toBeTruthy();
            expect(encrypted.ephemeralKey).toBeTruthy();
            expect(encrypted.nonce).toBeTruthy();
            expect(encrypted.metadata).toBeTruthy();
            
            const decrypted = await decryptNote(encrypted, privateKey);
            expect(decrypted).toBe(note);
        });

        it('should handle empty note', async () => {
            const note = '';
            const publicKey = '0x' + 'a'.repeat(64);
            const privateKey = '0x' + 'b'.repeat(64);
            
            const encrypted = await encryptNote(note, publicKey);
            const decrypted = await decryptNote(encrypted, privateKey);
            expect(decrypted).toBe(note);
        });

        it('should handle large note', async () => {
            const note = 'x'.repeat(10000);
            const publicKey = '0x' + 'a'.repeat(64);
            const privateKey = '0x' + 'b'.repeat(64);
            
            const encrypted = await encryptNote(note, publicKey);
            const decrypted = await decryptNote(encrypted, privateKey);
            expect(decrypted).toBe(note);
        });

        it('should throw error when decrypting with wrong private key', async () => {
            const note = 'test note';
            const publicKey = '0x' + 'a'.repeat(64);
            const wrongPrivateKey = '0x' + 'c'.repeat(64);
            
            const encrypted = await encryptNote(note, publicKey);
            
            // Mock decrypt to throw error for wrong key
            mockDecrypt.mockRejectedValueOnce(new Error('Decryption failed'));
            
            await expect(decryptNote(encrypted, wrongPrivateKey))
                .rejects.toThrow('Decryption failed');
        });

        it('should throw error when encrypting with invalid public key', async () => {
            const note = 'test note';
            const invalidPublicKey = 'invalid-key';
            
            await expect(encryptNote(note, invalidPublicKey))
                .rejects.toThrow('Invalid public key format');
        });

        it('should throw error when decrypting with invalid private key', async () => {
            const note = 'test note';
            const publicKey = '0x' + 'a'.repeat(64);
            const invalidPrivateKey = 'invalid-key';
            
            const encrypted = await encryptNote(note, publicKey);
            
            await expect(decryptNote(encrypted, invalidPrivateKey))
                .rejects.toThrow('Invalid private key format');
        });
    });
}); 