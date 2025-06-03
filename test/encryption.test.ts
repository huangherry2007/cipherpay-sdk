import { generateEncryptionKey, encryptData, decryptData, encryptNote, decryptNote } from '../src/utils/encryption';
import { EncryptedNote } from '../src/types/Note';

describe('Encryption Utilities', () => {
    describe('generateEncryptionKey', () => {
        it('should generate a valid encryption key', () => {
            const key = generateEncryptionKey();
            expect(key).toMatch(/^0x[0-9a-f]{64}$/);
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

            const { ciphertext, nonce } = await encryptData(data, key);
            expect(ciphertext).toMatch(/^0x[0-9a-f]+$/);
            expect(nonce).toMatch(/^0x[0-9a-f]{24}$/);

            const decrypted = await decryptData(ciphertext, key, nonce);
            expect(decrypted).toBe(data);
        });

        it('should handle empty data', async () => {
            const data = '';
            const key = generateEncryptionKey();

            const { ciphertext, nonce } = await encryptData(data, key);
            const decrypted = await decryptData(ciphertext, key, nonce);
            expect(decrypted).toBe(data);
        });

        it('should handle large data', async () => {
            const data = 'x'.repeat(10000);
            const key = generateEncryptionKey();

            const { ciphertext, nonce } = await encryptData(data, key);
            const decrypted = await decryptData(ciphertext, key, nonce);
            expect(decrypted).toBe(data);
        });

        it('should throw error when decrypting with wrong key', async () => {
            const data = 'test data';
            const key1 = generateEncryptionKey();
            const key2 = generateEncryptionKey();

            const { ciphertext, nonce } = await encryptData(data, key1);
            await expect(decryptData(ciphertext, key2, nonce)).rejects.toThrow();
        });

        it('should throw error when decrypting with wrong nonce', async () => {
            const data = 'test data';
            const key = generateEncryptionKey();

            const { ciphertext, nonce } = await encryptData(data, key);
            const wrongNonce = nonce.replace(/[0-9a-f]$/, '0');
            await expect(decryptData(ciphertext, key, wrongNonce)).rejects.toThrow();
        });
    });

    describe('encryptNote and decryptNote', () => {
        it('should encrypt and decrypt a note successfully', async () => {
            const note = 'test note';
            const recipientPubKey = '0x' + '1'.repeat(64);
            const privateKey = '0x' + '2'.repeat(64);

            const encryptedNote = await encryptNote(note, recipientPubKey);
            expect(encryptedNote).toHaveProperty('ciphertext');
            expect(encryptedNote).toHaveProperty('ephemeralKey');
            expect(encryptedNote).toHaveProperty('nonce');
            expect(encryptedNote).toHaveProperty('metadata');
            expect(encryptedNote.ciphertext).not.toBe(note);

            const decrypted = await decryptNote(encryptedNote, privateKey);
            expect(decrypted).toBe(note);
        });

        it('should handle empty note', async () => {
            const note = '';
            const recipientPubKey = '0x' + '1'.repeat(64);
            const privateKey = '0x' + '2'.repeat(64);

            const encryptedNote = await encryptNote(note, recipientPubKey);
            const decrypted = await decryptNote(encryptedNote, privateKey);
            expect(decrypted).toBe(note);
        });

        it('should handle large note', async () => {
            const note = 'x'.repeat(10000);
            const recipientPubKey = '0x' + '1'.repeat(64);
            const privateKey = '0x' + '2'.repeat(64);

            const encryptedNote = await encryptNote(note, recipientPubKey);
            const decrypted = await decryptNote(encryptedNote, privateKey);
            expect(decrypted).toBe(note);
        });

        it('should throw error when decrypting with wrong private key', async () => {
            const note = 'test note';
            const recipientPubKey = '0x' + '1'.repeat(64);
            const privateKey1 = '0x' + '2'.repeat(64);
            const privateKey2 = '0x' + '3'.repeat(64);

            const encryptedNote = await encryptNote(note, recipientPubKey);
            await expect(decryptNote(encryptedNote, privateKey2)).rejects.toThrow();
        });

        it('should throw error when encrypting with invalid public key', async () => {
            const note = 'test note';
            const invalidPubKey = 'invalid-key';

            await expect(encryptNote(note, invalidPubKey)).rejects.toThrow();
        });

        it('should throw error when decrypting with invalid private key', async () => {
            const note = 'test note';
            const recipientPubKey = '0x' + '1'.repeat(64);
            const invalidPrivateKey = 'invalid-key';

            const encryptedNote = await encryptNote(note, recipientPubKey);
            await expect(decryptNote(encryptedNote, invalidPrivateKey)).rejects.toThrow();
        });
    });
}); 