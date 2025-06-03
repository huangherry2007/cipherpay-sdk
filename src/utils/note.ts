import { ShieldedNote, NoteMetadata, EncryptedNote } from '../types/Note';
import { encryptData, decryptData, generateEncryptionKey } from './encryption';

/**
 * Creates a new shielded note with the given amount and recipient
 * @param amount The amount to be shielded
 * @param recipient The recipient's address
 * @returns A new shielded note
 */
export function createNote(amount: string, recipient: string): ShieldedNote {
    const metadata: NoteMetadata = {
        version: 1,
        chainType: 'ethereum',
        network: 'mainnet',
        timestamp: Date.now()
    };

    return {
        commitment: '', // This should be computed using a hash function
        nullifier: '', // This should be computed using a hash function
        amount: BigInt(amount),
        encryptedNote: '', // This should be encrypted
        spent: false,
        timestamp: Date.now(),
        recipientAddress: recipient
    };
}

/**
 * Encrypts a shielded note using the provided key
 * @param note The note to encrypt
 * @param key The encryption key
 * @returns The encrypted note
 */
export async function encryptNote(note: ShieldedNote, key: string): Promise<EncryptedNote> {
    const { ciphertext, nonce } = await encryptData(JSON.stringify(note), key);
    return {
        ciphertext,
        ephemeralKey: key,
        nonce,
        metadata: {
            version: 1,
            chainType: 'ethereum',
            network: 'mainnet',
            timestamp: Date.now()
        }
    };
}

/**
 * Decrypts an encrypted note using the provided key
 * @param note The encrypted note
 * @param key The decryption key
 * @returns The decrypted note
 */
export async function decryptNote(note: EncryptedNote, key: string): Promise<ShieldedNote> {
    const decrypted = await decryptData(note.ciphertext, key, note.nonce);
    return JSON.parse(decrypted);
} 