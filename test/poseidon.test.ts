import { poseidon1, poseidon2 } from 'poseidon-lite';
import { poseidonHash, poseidonHashMany } from '../src/utils/poseidon';

describe('Poseidon Hash Utilities', () => {
    describe('poseidonHash', () => {
        it('should hash a single input correctly', () => {
            const input = BigInt(123);
            const result = poseidonHash(input);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should produce different hashes for different inputs', () => {
            const input1 = BigInt(123);
            const input2 = BigInt(456);
            expect(poseidonHash(input1)).not.toBe(poseidonHash(input2));
        });

        it('should handle zero input', () => {
            const result = poseidonHash(0n);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should handle large inputs', () => {
            const input = BigInt('12345678901234567890');
            const result = poseidonHash(input);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should produce consistent hashes for same input', () => {
            const input = BigInt(123);
            expect(poseidonHash(input)).toBe(poseidonHash(input));
        });

        it('should match poseidon-lite output', () => {
            const input = BigInt(123);
            const expected = poseidon1([input]);
            expect(poseidonHash(input)).toBe(expected);
        });
    });

    describe('poseidonHashMany', () => {
        it('should hash multiple inputs correctly', () => {
            const inputs = [BigInt(123), BigInt(456), BigInt(789)];
            const result = poseidonHashMany(inputs);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should produce different hashes for different inputs', () => {
            const inputs1 = [BigInt(123), BigInt(456)];
            const inputs2 = [BigInt(123), BigInt(789)];
            expect(poseidonHashMany(inputs1)).not.toBe(poseidonHashMany(inputs2));
        });

        it('should handle empty array', () => {
            const result = poseidonHashMany([]);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should handle single input', () => {
            const inputs = [BigInt(123)];
            const result = poseidonHashMany(inputs);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should handle large inputs', () => {
            const inputs = [
                BigInt('12345678901234567890'),
                BigInt('98765432109876543210')
            ];
            const result = poseidonHashMany(inputs);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should produce consistent hashes for same inputs', () => {
            const inputs = [BigInt(123), BigInt(456), BigInt(789)];
            expect(poseidonHashMany(inputs)).toBe(poseidonHashMany(inputs));
        });

        it('should match poseidon-lite output for 2 inputs', () => {
            const inputs = [BigInt(123), BigInt(456)];
            const expected = poseidon2(inputs);
            expect(poseidonHashMany(inputs)).toBe(expected);
        });

        it('should handle inputs with zeros', () => {
            const inputs = [BigInt(0), BigInt(123), BigInt(0)];
            const result = poseidonHashMany(inputs);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });

        it('should handle inputs with negative numbers', () => {
            const inputs = [BigInt(-123), BigInt(456), BigInt(-789)];
            const result = poseidonHashMany(inputs);
            expect(result).toBeTruthy();
            expect(typeof result).toBe('bigint');
            expect(result > 0n).toBe(true);
        });
    });
}); 