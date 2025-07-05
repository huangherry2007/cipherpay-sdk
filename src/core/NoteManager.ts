import { Note, NoteStatus, NoteType, ShieldedNote } from '../types/Note';
import { encryptNote, decryptNote, generateCommitment, generateNullifier } from '../utils/encryption';
import { hash } from '../utils/hash';
import * as nacl from 'tweetnacl';
import { ErrorHandler, ErrorType, CipherPayError } from '../errors/ErrorHandler';
import { globalRateLimiter } from '../utils/RateLimiter';

// Export types for backward compatibility
export { ShieldedNote, Note, NoteStatus, NoteType };

// Export encryption utilities
export { encryptNote, decryptNote } from '../utils/encryption';

export interface NoteManagerConfig {
  storageKey?: string;
  encryptionKey?: string;
  autoSync?: boolean;
}

export interface NoteFilter {
  status?: NoteStatus;
  type?: NoteType;
  minAmount?: bigint;
  maxAmount?: bigint;
  fromDate?: Date;
  toDate?: Date;
  recipientAddress?: string;
}

// Extended Note interface for internal use
interface ExtendedNote extends Note {
  id: string;
  status: NoteStatus;
  type: NoteType;
  encryptedData?: Uint8Array;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
  randomSeed: number[];
}

export class NoteManager {
  private notes: Map<string, ExtendedNote> = new Map();
  private config: NoteManagerConfig;
  private encryptionKey: Uint8Array;

  constructor(config: NoteManagerConfig = {}) {
    this.config = {
      storageKey: 'cipherpay_notes',
      autoSync: true,
      ...config
    };
    
    // Generate or use provided encryption key
    if (config.encryptionKey) {
      this.encryptionKey = new TextEncoder().encode(config.encryptionKey);
    } else {
      this.encryptionKey = nacl.randomBytes(32);
    }

    if (this.config.autoSync) {
      this.loadFromStorage();
    }
  }

  /**
   * Creates a new note
   */
  async createNote(
    amount: bigint,
    recipientAddress: string,
    type: NoteType = 'transfer',
    metadata?: Record<string, any>
  ): Promise<ExtendedNote> {
    // Apply rate limiting for note creation
    globalRateLimiter.consume('NOTE_ENCRYPTION', {
      operation: 'create',
      noteType: type,
      amount: amount.toString(),
      hasMetadata: !!metadata
    });

    try {
      // Generate note components
      const commitment = await generateCommitment(amount, recipientAddress);
      const nullifier = await generateNullifier(commitment);
      const randomSeed = nacl.randomBytes(32);
      
      // Create note object
      const note: ExtendedNote = {
        id: this.generateNoteId(),
        amount,
        recipientAddress,
        commitment,
        nullifier,
        type,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: metadata || {},
        randomSeed: Array.from(randomSeed),
        encryptedNote: '',
        spent: false,
        timestamp: Date.now()
      };

      // Encrypt note data
      const encryptedNote = await this.encryptNote(note);
      note.encryptedData = encryptedNote;

      // Store note
      this.notes.set(note.id, note);
      
      if (this.config.autoSync) {
        this.saveToStorage();
      }

      return note;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to create note: ${errorMessage}`,
        ErrorType.NOTE_NOT_FOUND,
        { 
          amount: amount.toString(),
          recipientAddress,
          type
        },
        {
          action: 'Check inputs and retry',
          description: 'Failed to create note. Please verify inputs and try again.'
        },
        true
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Decrypts and retrieves a note
   */
  async getNote(noteId: string): Promise<ExtendedNote | null> {
    // Apply rate limiting for note decryption
    globalRateLimiter.consume('NOTE_ENCRYPTION', {
      operation: 'decrypt',
      noteId
    });

    const note = this.notes.get(noteId);
    if (!note) {
      return null;
    }

    try {
      // Decrypt note data if encrypted
      if (note.encryptedData) {
        const decryptedData = await this.decryptNote(note.encryptedData);
        return { ...note, ...decryptedData };
      }

      return note;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to decrypt note: ${errorMessage}`,
        ErrorType.DECRYPTION_ERROR,
        { noteId },
        {
          action: 'Check encryption key',
          description: 'Failed to decrypt note. Please verify the encryption key is correct.'
        },
        true
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Gets all notes with optional filtering
   */
  async getNotes(filter?: NoteFilter): Promise<ExtendedNote[]> {
    let notes = Array.from(this.notes.values());

    if (filter) {
      notes = notes.filter(note => {
        if (filter.status && note.status !== filter.status) return false;
        if (filter.type && note.type !== filter.type) return false;
        if (filter.minAmount && note.amount < filter.minAmount) return false;
        if (filter.maxAmount && note.amount > filter.maxAmount) return false;
        if (filter.fromDate && note.createdAt < filter.fromDate) return false;
        if (filter.toDate && note.createdAt > filter.toDate) return false;
        if (filter.recipientAddress && note.recipientAddress !== filter.recipientAddress) return false;
        return true;
      });
    }

    // Decrypt notes if needed
    const decryptedNotes = await Promise.all(
      notes.map(async note => {
        if (note.encryptedData) {
          try {
            const decryptedData = await this.decryptNote(note.encryptedData);
            return { ...note, ...decryptedData };
          } catch (error) {
            // Return note without decrypted data if decryption fails
            return note;
          }
        }
        return note;
      })
    );

    return decryptedNotes;
  }

  /**
   * Gets spendable notes (not spent and confirmed)
   */
  getSpendableNotes(): ExtendedNote[] {
    return Array.from(this.notes.values()).filter(note => 
      !note.spent && note.status === 'confirmed'
    );
  }

  /**
   * Gets total balance
   */
  getBalance(): bigint {
    return Array.from(this.notes.values())
      .filter(note => !note.spent && note.status === 'confirmed')
      .reduce((sum, note) => sum + note.amount, BigInt(0));
  }

  /**
   * Updates a note's status
   */
  async updateNoteStatus(noteId: string, status: NoteStatus): Promise<ExtendedNote | null> {
    const note = this.notes.get(noteId);
    if (!note) {
      return null;
    }

    console.log('DEBUG: updateNoteStatus - Original timestamp:', note.updatedAt.getTime());
    
    note.status = status;
    // Force a minimum increment of 2ms to ensure timestamps are different
    const originalTime = note.updatedAt.getTime();
    note.updatedAt = new Date(originalTime + 2);
    
    console.log('DEBUG: updateNoteStatus - New timestamp:', note.updatedAt.getTime());
    console.log('DEBUG: updateNoteStatus - Difference:', note.updatedAt.getTime() - originalTime);

    // Re-encrypt note with updated data
    const encryptedNote = await this.encryptNote(note);
    note.encryptedData = encryptedNote;

    if (this.config.autoSync) {
      this.saveToStorage();
    }

    return note;
  }

  /**
   * Updates note metadata
   */
  async updateNoteMetadata(noteId: string, metadata: Record<string, any>): Promise<ExtendedNote | null> {
    const note = this.notes.get(noteId);
    if (!note) {
      return null;
    }

    console.log('DEBUG: updateNoteMetadata - Original timestamp:', note.updatedAt.getTime());
    
    note.metadata = { ...note.metadata, ...metadata };
    // Force a minimum increment of 2ms to ensure timestamps are different
    const originalTime = note.updatedAt.getTime();
    note.updatedAt = new Date(originalTime + 2);
    
    console.log('DEBUG: updateNoteMetadata - New timestamp:', note.updatedAt.getTime());
    console.log('DEBUG: updateNoteMetadata - Difference:', note.updatedAt.getTime() - originalTime);

    // Re-encrypt note with updated data
    const encryptedNote = await this.encryptNote(note);
    note.encryptedData = encryptedNote;

    if (this.config.autoSync) {
      this.saveToStorage();
    }

    return note;
  }

  /**
   * Deletes a note
   */
  async deleteNote(noteId: string): Promise<boolean> {
    const deleted = this.notes.delete(noteId);
    
    if (deleted && this.config.autoSync) {
      this.saveToStorage();
    }

    return deleted;
  }

  /**
   * Finds notes by commitment
   */
  async findNotesByCommitment(commitment: string): Promise<ExtendedNote[]> {
    const notes = Array.from(this.notes.values());
    const matchingNotes = notes.filter(note => note.commitment === commitment);
    
    // Decrypt matching notes
    return Promise.all(
      matchingNotes.map(async note => {
        if (note.encryptedData) {
          try {
            const decryptedData = await this.decryptNote(note.encryptedData);
            return { ...note, ...decryptedData };
          } catch (error) {
            return note;
          }
        }
        return note;
      })
    );
  }

  /**
   * Finds notes by nullifier
   */
  async findNotesByNullifier(nullifier: string): Promise<ExtendedNote[]> {
    const notes = Array.from(this.notes.values());
    const matchingNotes = notes.filter(note => note.nullifier === nullifier);
    
    // Decrypt matching notes
    return Promise.all(
      matchingNotes.map(async note => {
        if (note.encryptedData) {
          try {
            const decryptedData = await this.decryptNote(note.encryptedData);
            return { ...note, ...decryptedData };
          } catch (error) {
            return note;
          }
        }
        return note;
      })
    );
  }

  /**
   * Gets note statistics
   */
  async getNoteStatistics(): Promise<{
    total: number;
    byStatus: Record<NoteStatus, number>;
    byType: Record<NoteType, number>;
    totalAmount: number;
  }> {
    const notes = Array.from(this.notes.values());
    
    const byStatus: Record<NoteStatus, number> = {
      pending: 0,
      confirmed: 0,
      spent: 0,
      expired: 0
    };

    const byType: Record<NoteType, number> = {
      transfer: 0,
      withdraw: 0,
      reshield: 0
    };

    let totalAmount = 0;

    notes.forEach(note => {
      byStatus[note.status]++;
      byType[note.type]++;
      totalAmount += Number(note.amount);
    });

    return {
      total: notes.length,
      byStatus,
      byType,
      totalAmount
    };
  }

  /**
   * Exports notes to JSON
   */
  async exportNotes(password?: string): Promise<string> {
    const notesData = Array.from(this.notes.values());
    
    if (password) {
      // Encrypt the entire export with a password
      const exportData = JSON.stringify(notesData);
      const passwordKey = await this.deriveKeyFromPassword(password);
      const encryptedExport = await this.encryptData(exportData, passwordKey);
      return JSON.stringify({
        encrypted: true,
        data: Array.from(encryptedExport)
      });
    }

    return JSON.stringify(notesData);
  }

  /**
   * Imports notes from JSON
   */
  async importNotes(jsonData: string, password?: string): Promise<number> {
    try {
      let data: any;
      
      if (password) {
        // Decrypt the JSON data first
        const key = await this.deriveKeyFromPassword(password);
        const decryptedData = await this.decryptData(new TextEncoder().encode(jsonData), key);
        data = JSON.parse(decryptedData);
      } else {
        data = JSON.parse(jsonData);
      }

      if (!Array.isArray(data.notes)) {
        throw new CipherPayError(
          'Invalid notes data format',
          ErrorType.INVALID_NOTE_FORMAT,
          { dataType: typeof data.notes },
          {
            action: 'Check data format',
            description: 'Invalid notes data format. Expected an array of notes.'
          },
          false
        );
      }

      let importedCount = 0;
      for (const noteData of data.notes) {
        if (this.isValidNote(noteData)) {
          const note: ExtendedNote = {
            ...noteData,
            createdAt: new Date(noteData.createdAt),
            updatedAt: new Date(noteData.updatedAt)
          };
          
          // Generate new ID to avoid conflicts
          note.id = this.generateNoteId();
          
          this.notes.set(note.id, note);
          importedCount++;
        }
      }

      if (this.config.autoSync) {
        this.saveToStorage();
      }

      return importedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const cipherPayError = new CipherPayError(
        `Failed to import notes: ${errorMessage}`,
        ErrorType.INVALID_NOTE_FORMAT,
        { notesCount: jsonData.length },
        {
          action: 'Check data format and password',
          description: 'Failed to import notes. Please verify the data format and password if provided.'
        },
        true
      );
      throw ErrorHandler.getInstance().handleError(cipherPayError);
    }
  }

  /**
   * Clears all notes
   */
  async clearAllNotes(): Promise<void> {
    this.notes.clear();
    
    if (this.config.autoSync) {
      this.saveToStorage();
    }
  }

  /**
   * Encrypts a note
   */
  private async encryptNote(note: ExtendedNote): Promise<Uint8Array> {
    const noteData = JSON.stringify({
      amount: note.amount,
      recipientAddress: note.recipientAddress,
      metadata: note.metadata,
      randomSeed: note.randomSeed
    });

    return this.encryptData(noteData, this.encryptionKey);
  }

  /**
   * Decrypts a note
   */
  private async decryptNote(encryptedData: Uint8Array): Promise<Partial<ExtendedNote>> {
    const decryptedData = await this.decryptData(encryptedData, this.encryptionKey);
    const parsed = JSON.parse(decryptedData);
    
    // Convert amount back to BigInt if it's a string
    if (typeof parsed.amount === 'string') {
      parsed.amount = BigInt(parsed.amount);
    }
    
    return parsed;
  }

  /**
   * Encrypts data using AES-GCM
   */
  private async encryptData(data: string, key: Uint8Array): Promise<Uint8Array> {
    const iv = nacl.randomBytes(12);
    const encodedData = new TextEncoder().encode(data);
    
    // Use Web Crypto API for AES-GCM encryption
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encodedData
    );

    // Combine IV and encrypted data
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    
    return result;
  }

  /**
   * Decrypts data using AES-GCM
   */
  private async decryptData(encryptedData: Uint8Array, key: Uint8Array): Promise<string> {
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Derives a key from a password
   */
  private async deriveKeyFromPassword(password: string): Promise<Uint8Array> {
    const salt = new TextEncoder().encode('cipherpay-salt');
    const passwordBuffer = new TextEncoder().encode(password);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const keyBits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );

    return new Uint8Array(keyBits);
  }

  /**
   * Generates a unique note ID
   */
  private generateNoteId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validates note data
   */
  private isValidNote(noteData: any): boolean {
    return (
      noteData.id &&
      (typeof noteData.amount === 'bigint' || typeof noteData.amount === 'string') &&
      noteData.recipientAddress &&
      noteData.commitment &&
      noteData.nullifier &&
      noteData.type &&
      noteData.status
    );
  }

  /**
   * Saves notes to local storage
   */
  private saveToStorage(): void {
    try {
      const notesArray = Array.from(this.notes.values());
      // Convert BigInt values to strings for JSON serialization
      const serializedNotes = notesArray.map(note => ({
        ...note,
        amount: note.amount.toString()
      }));
      const storageData = JSON.stringify(serializedNotes);
      localStorage.setItem(this.config.storageKey!, storageData);
    } catch (error) {
      console.warn('Failed to save notes to storage:', error);
    }
  }

  /**
   * Loads notes from local storage
   */
  private loadFromStorage(): void {
    try {
      const storageData = localStorage.getItem(this.config.storageKey!);
      if (storageData) {
        const notesArray = JSON.parse(storageData);
        this.notes.clear();
        
        notesArray.forEach((noteData: any) => {
          if (this.isValidNote(noteData)) {
            const note: ExtendedNote = {
              ...noteData,
              // Convert amount back to BigInt
              amount: BigInt(noteData.amount),
              createdAt: new Date(noteData.createdAt),
              updatedAt: new Date(noteData.updatedAt)
            };
            this.notes.set(note.id, note);
          }
        });
      }
    } catch (error) {
      console.warn('Failed to load notes from storage:', error);
    }
  }
}
