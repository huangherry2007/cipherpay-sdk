import { hash, hashToField, hashToGroup } from '../src/utils/hash';
import { poseidonHash, poseidonHashMany } from '../src/utils/poseidon';

describe('Hash Utilities', () => {
    describe('hash', () => {
        it('should hash a string correctly', () => {
            const input = 'test string';
            const result = hash(input);
            expect(result).toMatch(/^0x[0-9a-f]{64}$/);
        });

        it('should produce different hashes for different inputs', () => {
            const hash1 = hash('test1');
            const hash2 = hash('test2');
            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty string', () => {
            const result = hash('');
            expect(result).toMatch(/^0x[0-9a-f]{64}$/);
        });

        it('should handle special characters', () => {
            const input = '!@#$%^&*()_+{}|:"<>?';
            const result = hash(input);
            expect(result).toMatch(/^0x[0-9a-f]{64}$/);
        });

        it('should produce consistent hashes for same input', () => {
            const input = 'test string';
            const hash1 = hash(input);
            const hash2 = hash(input);
            expect(hash1).toBe(hash2);
        });
    });

    describe('hashToField', () => {
        it('should hash a string to a field element', () => {
            const input = 'test string';
            const result = hashToField(input);
            expect(typeof result).toBe('bigint');
        });

        it('should produce different field elements for different inputs', () => {
            const field1 = hashToField('test1');
            const field2 = hashToField('test2');
            expect(field1).not.toBe(field2);
        });

        it('should handle empty string', () => {
            const result = hashToField('');
            expect(typeof result).toBe('bigint');
        });

        it('should handle special characters', () => {
            const input = '!@#$%^&*()_+{}|:"<>?';
            const result = hashToField(input);
            expect(typeof result).toBe('bigint');
        });

        it('should produce consistent field elements for same input', () => {
            const input = 'test string';
            const field1 = hashToField(input);
            const field2 = hashToField(input);
            expect(field1).toBe(field2);
        });
    });

    describe('hashToGroup', () => {
        it('should hash a string to a group element', () => {
            const input = 'test string';
            const result = hashToGroup(input);
            expect(result).toHaveProperty('x');
            expect(result).toHaveProperty('y');
            expect(typeof result.x).toBe('bigint');
            expect(typeof result.y).toBe('bigint');
        });

        it('should produce different group elements for different inputs', () => {
            const group1 = hashToGroup('test1');
            const group2 = hashToGroup('test2');
            expect(group1.x).not.toBe(group2.x);
        });

        it('should handle empty string', () => {
            const result = hashToGroup('');
            expect(result).toHaveProperty('x');
            expect(result).toHaveProperty('y');
            expect(typeof result.x).toBe('bigint');
            expect(typeof result.y).toBe('bigint');
        });

        it('should handle special characters', () => {
            const input = '!@#$%^&*()_+{}|:"<>?';
            const result = hashToGroup(input);
            expect(result).toHaveProperty('x');
            expect(result).toHaveProperty('y');
            expect(typeof result.x).toBe('bigint');
            expect(typeof result.y).toBe('bigint');
        });

        it('should produce consistent group elements for same input', () => {
            const input = 'test string';
            const group1 = hashToGroup(input);
            const group2 = hashToGroup(input);
            expect(group1.x).toBe(group2.x);
            expect(group1.y).toBe(group2.y);
        });
    });

    describe('poseidonHash', () => {
        it('should hash a single input correctly', () => {
            const input = 123n;
            const hash = poseidonHash(input);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should produce different hashes for different inputs', () => {
            const hash1 = poseidonHash(123n);
            const hash2 = poseidonHash(456n);
            expect(hash1).not.toBe(hash2);
        });

        it('should handle zero input', () => {
            const hash = poseidonHash(0n);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should handle large inputs', () => {
            const input = BigInt('1234567890123456789012345678901234567890');
            const hash = poseidonHash(input);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should produce consistent hashes for same input', () => {
            const input = 123n;
            const hash1 = poseidonHash(input);
            const hash2 = poseidonHash(input);
            expect(hash1).toBe(hash2);
        });
    });

    describe('poseidonHashMany', () => {
        it('should hash multiple inputs correctly', () => {
            const inputs = [123n, 456n, 789n];
            const hash = poseidonHashMany(inputs);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should produce different hashes for different inputs', () => {
            const hash1 = poseidonHashMany([123n, 456n]);
            const hash2 = poseidonHashMany([456n, 789n]);
            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty array', () => {
            const hash = poseidonHashMany([]);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should handle single input', () => {
            const hash = poseidonHashMany([123n]);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should handle large inputs', () => {
            const inputs = [
                BigInt('1234567890123456789012345678901234567890'),
                BigInt('9876543210987654321098765432109876543210')
            ];
            const hash = poseidonHashMany(inputs);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should produce consistent hashes for same inputs', () => {
            const inputs = [123n, 456n, 789n];
            const hash1 = poseidonHashMany(inputs);
            const hash2 = poseidonHashMany(inputs);
            expect(hash1).toBe(hash2);
        });

        it('should handle inputs containing zeros', () => {
            const inputs = [0n, 123n, 0n];
            const hash = poseidonHashMany(inputs);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });

        it('should handle inputs containing negative numbers', () => {
            const inputs = [-123n, 456n, -789n];
            const hash = poseidonHashMany(inputs);
            expect(hash).toBeDefined();
            expect(typeof hash).toBe('bigint');
        });
    });
}); 