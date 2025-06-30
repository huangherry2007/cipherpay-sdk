import { NoteManager } from '../src/core/NoteManager';
import { ShieldedNote, NoteType } from '../src/types/Note';
import { Logger } from '../src/utils/logger';

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
        
        // Clear localStorage to ensure test isolation
        localStorage.clear();
        
        // Create a new instance for each test
        noteManager = new NoteManager();
    });

    afterEach(() => {
        // Clean up localStorage after each test
        localStorage.clear();
    });

    describe('createNote', () => {
        it('should create a note successfully', async () => {
            const amount = BigInt('1000000000000000000');
            const recipientAddress = '0x789';
            
            const note = await noteManager.createNote(amount, recipientAddress);
            
            expect(note.amount).toBe(amount);
            expect(note.recipientAddress).toBe(recipientAddress);
            expect(note.type).toBe('transfer');
            expect(note.status).toBe('pending');
            expect(note.spent).toBe(false);
            expect(note.commitment).toBeDefined();
            expect(note.nullifier).toBeDefined();
        });

        it('should create note with custom type and metadata', async () => {
            const amount = BigInt('2000000000000000000');
            const recipientAddress = '0xabc';
            const type: NoteType = 'withdraw';
            const metadata = { description: 'Test note' };
            
            const note = await noteManager.createNote(amount, recipientAddress, type, metadata);
            
            expect(note.type).toBe(type);
            expect(note.metadata).toEqual(metadata);
        });
    });

    describe('getNote', () => {
        it('should retrieve a note by ID', async () => {
            const note = await noteManager.createNote(
                BigInt('1000000000000000000'),
                '0x789'
            );
            
            const retrievedNote = await noteManager.getNote(note.id);
            expect(retrievedNote).toEqual(note);
        });

        it('should return null for non-existent note', async () => {
            const retrievedNote = await noteManager.getNote('non-existent-id');
            expect(retrievedNote).toBeNull();
        });
    });

    describe('getNotes', () => {
        it('should return all notes when no filter is applied', async () => {
            const note1 = await noteManager.createNote(
                BigInt('1000000000000000000'),
                '0x789'
            );
            const note2 = await noteManager.createNote(
                BigInt('2000000000000000000'),
                '0xabc'
            );
            
            const notes = await noteManager.getNotes();
            expect(notes).toHaveLength(2);
            expect(notes).toContainEqual(note1);
            expect(notes).toContainEqual(note2);
        });

        it('should filter notes by status', async () => {
            const note1 = await noteManager.createNote(
                BigInt('1000000000000000000'),
                '0x789'
            );
            await noteManager.updateNoteStatus(note1.id, 'confirmed');
            
            const pendingNotes = await noteManager.getNotes({ status: 'pending' });
            const confirmedNotes = await noteManager.getNotes({ status: 'confirmed' });
            
            expect(pendingNotes).toHaveLength(0);
            expect(confirmedNotes).toHaveLength(1);
        });

        it('should filter notes by amount range', async () => {
            await noteManager.createNote(BigInt('1000000000000000000'), '0x789');
            await noteManager.createNote(BigInt('3000000000000000000'), '0xabc');
            
            const notes = await noteManager.getNotes({
                minAmount: BigInt('2000000000000000000'),
                maxAmount: BigInt('4000000000000000000')
            });
            
            expect(notes).toHaveLength(1);
            expect(notes[0].amount).toBe(BigInt('3000000000000000000'));
        });
    });

    describe('updateNoteStatus', () => {
        it('should update note status successfully', async () => {
            const note = await noteManager.createNote(BigInt(100), '0x1234567890123456789012345678901234567890');
            
            console.log('DEBUG: Test - Original note timestamp:', note.updatedAt.getTime());
            
            // Store the original timestamp before updating
            const originalTimestamp = note.updatedAt.getTime();
            
            // Add a small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1));
            
            const updatedNote = await noteManager.updateNoteStatus(note.id, 'confirmed');
            console.log('DEBUG: Test - Updated note timestamp:', updatedNote?.updatedAt.getTime());
            console.log('DEBUG: Test - Original timestamp (stored):', originalTimestamp);
            
            expect(updatedNote?.status).toBe('confirmed');
            expect(updatedNote?.updatedAt.getTime()).toBeGreaterThan(originalTimestamp);
        });

        it('should return null for non-existent note', async () => {
            const result = await noteManager.updateNoteStatus('non-existent', 'confirmed');
            expect(result).toBeNull();
        });
    });

    describe('updateNoteMetadata', () => {
        it('should update note metadata successfully', async () => {
            const note = await noteManager.createNote(BigInt(100), '0x1234567890123456789012345678901234567890');
            
            console.log('DEBUG: Test - Original note timestamp (metadata):', note.updatedAt.getTime());
            
            // Store the original timestamp before updating
            const originalTimestamp = note.updatedAt.getTime();
            
            // Add a small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 1));
            
            const updatedNote = await noteManager.updateNoteMetadata(note.id, {
                newField: 'newValue',
                timestamp: Date.now()
            });
            
            console.log('DEBUG: Test - Updated note timestamp (metadata):', updatedNote?.updatedAt.getTime());
            console.log('DEBUG: Test - Original timestamp (stored):', originalTimestamp);
            
            expect(updatedNote?.metadata.newField).toBe('newValue');
            expect(updatedNote?.metadata).toEqual({
                newField: 'newValue',
                timestamp: expect.any(Number)
            });
            expect(updatedNote?.updatedAt.getTime()).toBeGreaterThan(originalTimestamp);
        });

        it('should return null for non-existent note', async () => {
            const updatedNote = await noteManager.updateNoteMetadata('non-existent-id', {});
            expect(updatedNote).toBeNull();
        });
    });

    describe('findNotesByCommitment', () => {
        it('should find notes by commitment', async () => {
            const note = await noteManager.createNote(
                BigInt('1000000000000000000'),
                '0x789'
            );
            
            const foundNotes = await noteManager.findNotesByCommitment(note.commitment);
            expect(foundNotes).toHaveLength(1);
            expect(foundNotes[0]).toEqual(note);
        });

        it('should return empty array for non-existent commitment', async () => {
            const foundNotes = await noteManager.findNotesByCommitment('non-existent-commitment');
            expect(foundNotes).toHaveLength(0);
        });
    });

    describe('findNotesByNullifier', () => {
        it('should find notes by nullifier', async () => {
            const note = await noteManager.createNote(
                BigInt('1000000000000000000'),
                '0x789'
            );
            
            const foundNotes = await noteManager.findNotesByNullifier(note.nullifier);
            expect(foundNotes).toHaveLength(1);
            expect(foundNotes[0]).toEqual(note);
        });

        it('should return empty array for non-existent nullifier', async () => {
            const foundNotes = await noteManager.findNotesByNullifier('non-existent-nullifier');
            expect(foundNotes).toHaveLength(0);
        });
    });
}); 