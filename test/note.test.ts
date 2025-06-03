import { ShieldedNote, NoteMetadata } from '../src/types/Note';
import { createNote, decryptNote, encryptNote } from '../src/utils/note';
import { generateEncryptionKey } from '../src/utils/encryption';

describe('Note Utilities', () => {
    describe('createNote', () => {
        it('should create a note with valid metadata', () => {
            const amount = '1000000000000000000'; // 1 ETH
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            expect(note).toHaveProperty('amount');
            expect(note).toHaveProperty('recipientAddress');
            expect(note).toHaveProperty('commitment');
            expect(note).toHaveProperty('nullifier');
            expect(note).toHaveProperty('encryptedNote');
            expect(note).toHaveProperty('spent');
            expect(note).toHaveProperty('timestamp');
            expect(note.amount).toBe(BigInt(amount));
            expect(note.recipientAddress).toBe(recipient);
            expect(note.spent).toBe(false);
        });

        it('should handle zero amount', () => {
            const amount = '0';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            expect(note.amount).toBe(BigInt(amount));
        });

        it('should handle large amounts', () => {
            const amount = '1000000000000000000000000000000000000000000';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            expect(note.amount).toBe(BigInt(amount));
        });

        it('should create different notes for different inputs', () => {
            const note1 = createNote('100', '0x1234567890123456789012345678901234567890');
            const note2 = createNote('200', '0x1234567890123456789012345678901234567890');
            expect(note1).not.toEqual(note2);
        });

        it('should create different notes for same amount but different recipients', () => {
            const note1 = createNote('100', '0x1234567890123456789012345678901234567890');
            const note2 = createNote('100', '0x0987654321098765432109876543210987654321');
            expect(note1).not.toEqual(note2);
        });
    });

    describe('encryptNote and decryptNote', () => {
        it('should encrypt and decrypt a note successfully', async () => {
            const amount = '1000000000000000000';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            const key = generateEncryptionKey();

            const encryptedNote = await encryptNote(note, key);
            expect(encryptedNote).toHaveProperty('ciphertext');
            expect(encryptedNote).toHaveProperty('ephemeralKey');
            expect(encryptedNote).toHaveProperty('nonce');
            expect(encryptedNote).toHaveProperty('metadata');
            expect(encryptedNote.ciphertext).not.toBe(JSON.stringify(note));

            const decryptedNote = await decryptNote(encryptedNote, key);
            expect(decryptedNote).toEqual(note);
        });

        it('should handle zero amount note', async () => {
            const amount = '0';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            const key = generateEncryptionKey();

            const encryptedNote = await encryptNote(note, key);
            const decryptedNote = await decryptNote(encryptedNote, key);
            expect(decryptedNote).toEqual(note);
        });

        it('should handle large amount note', async () => {
            const amount = '1000000000000000000000000000000000000000000';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            const key = generateEncryptionKey();

            const encryptedNote = await encryptNote(note, key);
            const decryptedNote = await decryptNote(encryptedNote, key);
            expect(decryptedNote).toEqual(note);
        });

        it('should throw error when decrypting with wrong key', async () => {
            const amount = '1000000000000000000';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            const key1 = generateEncryptionKey();
            const key2 = generateEncryptionKey();

            const encryptedNote = await encryptNote(note, key1);
            await expect(decryptNote(encryptedNote, key2)).rejects.toThrow();
        });

        it('should throw error when encrypting with invalid key', async () => {
            const amount = '1000000000000000000';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            const invalidKey = 'invalid-key';

            await expect(encryptNote(note, invalidKey)).rejects.toThrow();
        });

        it('should throw error when decrypting with invalid key', async () => {
            const amount = '1000000000000000000';
            const recipient = '0x1234567890123456789012345678901234567890';
            const note = createNote(amount, recipient);
            const key = generateEncryptionKey();
            const invalidKey = 'invalid-key';

            const encryptedNote = await encryptNote(note, key);
            await expect(decryptNote(encryptedNote, invalidKey)).rejects.toThrow();
        });
    });
}); 