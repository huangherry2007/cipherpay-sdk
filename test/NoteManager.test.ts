import { NoteManager } from '../src/core/NoteManager';
import { ShieldedNote } from '../src/types/Note';
import { Logger } from '../src/utils/logger';
import { ethers } from 'ethers';

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

describe('NoteManager', () => {
    let noteManager: NoteManager;
    const mockLogger = Logger.getInstance();

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Create a new instance for each test
        noteManager = new NoteManager();
    });

    describe('addNote', () => {
        it('should add a note successfully', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note);
            const notes = noteManager.getAllNotes();
            expect(notes).toHaveLength(1);
            expect(notes[0]).toEqual(note);
        });

        it('should throw error for duplicate nullifier', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note);
            expect(() => noteManager.addNote(note)).toThrow('Note with this nullifier already exists');
        });
    });

    describe('getAllNotes', () => {
        it('should return all notes', () => {
            const note1: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const note2: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('2000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: true,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note1);
            noteManager.addNote(note2);
            const notes = noteManager.getAllNotes();
            expect(notes).toHaveLength(2);
            expect(notes).toContainEqual(note1);
            expect(notes).toContainEqual(note2);
        });

        it('should return empty array when no notes exist', () => {
            const notes = noteManager.getAllNotes();
            expect(notes).toHaveLength(0);
        });
    });

    describe('getNoteByNullifier', () => {
        it('should return note by nullifier', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note);
            const foundNote = noteManager.getNoteByNullifier('0x456');
            expect(foundNote).toEqual(note);
        });

        it('should return undefined for non-existent nullifier', () => {
            const foundNote = noteManager.getNoteByNullifier('0x456');
            expect(foundNote).toBeUndefined();
        });
    });

    describe('markNoteSpent', () => {
        it('should mark note as spent', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note);
            noteManager.markNoteSpent('0x456');
            const updatedNote = noteManager.getNoteByNullifier('0x456');
            expect(updatedNote?.spent).toBe(true);
        });

        it('should throw error for non-existent note', () => {
            expect(() => noteManager.markNoteSpent('0x456')).toThrow('Note not found');
        });
    });

    describe('getSpendableNotes', () => {
        it('should return only unspent notes', () => {
            const note1: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const note2: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('2000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: true,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note1);
            noteManager.addNote(note2);
            const spendableNotes = noteManager.getSpendableNotes();
            expect(spendableNotes).toHaveLength(1);
            expect(spendableNotes[0]).toEqual(note1);
        });

        it('should return empty array when no unspent notes exist', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: true,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note);
            const spendableNotes = noteManager.getSpendableNotes();
            expect(spendableNotes).toHaveLength(0);
        });
    });

    describe('getNotesByRecipient', () => {
        it('should return notes for specific recipient', () => {
            const note1: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const note2: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('2000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0xabc'
            };

            noteManager.addNote(note1);
            noteManager.addNote(note2);
            const recipientNotes = noteManager.getNotesByRecipient('0x789');
            expect(recipientNotes).toHaveLength(1);
            expect(recipientNotes[0]).toEqual(note1);
        });

        it('should return empty array when no notes exist for recipient', () => {
            const recipientNotes = noteManager.getNotesByRecipient('0x789');
            expect(recipientNotes).toHaveLength(0);
        });
    });

    describe('getBalance', () => {
        it('should return total balance of unspent notes', () => {
            const note1: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const note2: ShieldedNote = {
                commitment: '0xabc',
                nullifier: '0xdef',
                amount: BigInt('2000000000000000000'),
                encryptedNote: 'encrypted_data_2',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const note3: ShieldedNote = {
                commitment: '0xghi',
                nullifier: '0xjkl',
                amount: BigInt('3000000000000000000'),
                encryptedNote: 'encrypted_data_3',
                spent: true,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            noteManager.addNote(note1);
            noteManager.addNote(note2);
            noteManager.addNote(note3);
            const balance = noteManager.getBalance();
            expect(balance).toBe(BigInt('3000000000000000000')); // Sum of note1 and note2
        });

        it('should return zero when no unspent notes exist', () => {
            const balance = noteManager.getBalance();
            expect(balance).toBe(BigInt(0));
        });
    });

    describe('encryptNote and decryptNote', () => {
        it('should encrypt and decrypt note successfully', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            const recipientKeyPair = ethers.Wallet.createRandom();
            const encrypted = noteManager.encryptNote(note, recipientKeyPair.publicKey);
            expect(encrypted).toHaveProperty('ciphertext');
            expect(encrypted).toHaveProperty('ephemeralPublicKey');
            expect(encrypted).toHaveProperty('iv');

            const decrypted = noteManager.decryptNote(encrypted, recipientKeyPair.privateKey);
            expect(decrypted.commitment).toBe(note.commitment);
            expect(decrypted.amount).toBe(note.amount);
            expect(decrypted.timestamp).toBe(note.timestamp);
        });

        it('should throw error when encryption fails', () => {
            const note: ShieldedNote = {
                commitment: '0x123',
                nullifier: '0x456',
                amount: BigInt('1000000000000000000'),
                encryptedNote: 'encrypted_data',
                spent: false,
                timestamp: Date.now(),
                recipientAddress: '0x789'
            };

            expect(() => noteManager.encryptNote(note, 'invalid_key')).toThrow('Failed to encrypt note');
        });

        it('should throw error when decryption fails', () => {
            const encrypted = {
                ciphertext: 'invalid',
                ephemeralPublicKey: 'invalid',
                iv: 'invalid'
            };

            expect(() => noteManager.decryptNote(encrypted, 'invalid_key')).toThrow('Failed to decrypt note');
        });
    });
}); 