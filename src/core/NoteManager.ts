import { ethers } from 'ethers';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

export interface ShieldedNote {
  commitment: string;
  nullifier: string;
  amount: bigint;
  encryptedNote: string;
  spent: boolean;
  timestamp: number;
  recipientAddress?: string;
}

export interface NoteEncryption {
  ciphertext: string;
  ephemeralPublicKey: string;
  iv: string;
}

export class NoteManager {
  private notes: Map<string, ShieldedNote>;
  private readonly encryptionKey: Buffer;

  constructor(encryptionKey?: string) {
    this.notes = new Map();
    this.encryptionKey = encryptionKey 
      ? Buffer.from(encryptionKey, 'hex')
      : randomBytes(32);
  }

  /**
   * Adds a new note to the manager
   * @param note The shielded note to add
   */
  addNote(note: ShieldedNote): void {
    if (this.notes.has(note.nullifier)) {
      throw new Error('Note with this nullifier already exists');
    }
    this.notes.set(note.nullifier, {
      ...note,
      timestamp: note.timestamp || Date.now()
    });
  }

  /**
   * Gets all unspent notes
   * @returns Array of unspent shielded notes
   */
  getSpendableNotes(): ShieldedNote[] {
    return Array.from(this.notes.values())
      .filter(note => !note.spent);
  }

  /**
   * Gets all notes (both spent and unspent)
   * @returns Array of all shielded notes
   */
  getAllNotes(): ShieldedNote[] {
    return Array.from(this.notes.values());
  }

  /**
   * Marks a note as spent using its nullifier
   * @param nullifier The nullifier of the note to mark as spent
   */
  markNoteSpent(nullifier: string): void {
    const note = this.notes.get(nullifier);
    if (!note) {
      throw new Error('Note not found');
    }
    note.spent = true;
    this.notes.set(nullifier, note);
  }

  /**
   * Encrypts a shielded note for a recipient
   * @param note The note to encrypt
   * @param recipientPublicKey The recipient's public key
   * @returns The encrypted note data
   */
  encryptNote(note: ShieldedNote, recipientPublicKey: string): NoteEncryption {
    try {
      // Generate ephemeral key pair
      const ephemeralKeyPair = ethers.Wallet.createRandom();
      
      // Create shared secret using ECDH
      const sharedSecret = createHash('sha256')
        .update(ephemeralKeyPair.privateKey + recipientPublicKey)
        .digest();

      // Generate IV
      const iv = randomBytes(16);

      // Create cipher
      const cipher = createCipheriv('aes-256-gcm', sharedSecret, iv);

      // Encrypt note data
      const noteData = JSON.stringify({
        amount: note.amount.toString(),
        commitment: note.commitment,
        timestamp: note.timestamp
      });

      const encrypted = Buffer.concat([
        cipher.update(noteData, 'utf8'),
        cipher.final()
      ]);

      return {
        ciphertext: encrypted.toString('base64'),
        ephemeralPublicKey: ephemeralKeyPair.publicKey,
        iv: iv.toString('base64')
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to encrypt note: ${error.message}`);
      }
      throw new Error('Failed to encrypt note: Unknown error');
    }
  }

  /**
   * Decrypts a shielded note using a private key
   * @param encrypted The encrypted note data
   * @param privateKey The private key to decrypt with
   * @returns The decrypted shielded note
   */
  decryptNote(encrypted: NoteEncryption, privateKey: string): ShieldedNote {
    try {
      // Recreate shared secret using ECDH
      const sharedSecret = createHash('sha256')
        .update(privateKey + encrypted.ephemeralPublicKey)
        .digest();

      // Create decipher
      const decipher = createDecipheriv(
        'aes-256-gcm',
        sharedSecret,
        Buffer.from(encrypted.iv, 'base64')
      );

      // Decrypt note data
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final()
      ]);

      const noteData = JSON.parse(decrypted.toString('utf8'));
      
      return {
        commitment: noteData.commitment,
        nullifier: ethers.utils.keccak256(
          ethers.utils.concat([
            noteData.commitment,
            privateKey
          ])
        ),
        amount: BigInt(noteData.amount),
        encryptedNote: encrypted.ciphertext,
        spent: false,
        timestamp: noteData.timestamp
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to decrypt note: ${error.message}`);
      }
      throw new Error('Failed to decrypt note: Unknown error');
    }
  }

  /**
   * Gets a note by its nullifier
   * @param nullifier The nullifier to look up
   * @returns The shielded note if found
   */
  getNoteByNullifier(nullifier: string): ShieldedNote | undefined {
    return this.notes.get(nullifier);
  }

  /**
   * Gets notes by recipient address
   * @param address The recipient address to filter by
   * @returns Array of notes for the recipient
   */
  getNotesByRecipient(address: string): ShieldedNote[] {
    return Array.from(this.notes.values())
      .filter(note => note.recipientAddress === address);
  }

  /**
   * Gets the total balance of unspent notes
   * @returns The total balance as a bigint
   */
  getBalance(): bigint {
    return this.getSpendableNotes()
      .reduce((sum, note) => sum + note.amount, BigInt(0));
  }
}
