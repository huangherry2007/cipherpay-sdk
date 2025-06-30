import { add, subtract, multiply, divide, gcd, lcm } from '../src/utils/math';
import { modPow, modInverse, modAdd, modSub, modMul } from '../src/utils/math';

describe('Math Utilities', () => {
    describe('add', () => {
        it('should add two positive numbers', () => {
            expect(add(5n, 3n)).toBe(8n);
        });

        it('should add a positive and negative number', () => {
            expect(add(5n, -3n)).toBe(2n);
        });

        it('should add two negative numbers', () => {
            expect(add(-5n, -3n)).toBe(-8n);
        });

        it('should handle zero', () => {
            expect(add(5n, 0n)).toBe(5n);
            expect(add(0n, 5n)).toBe(5n);
            expect(add(0n, 0n)).toBe(0n);
        });

        it('should handle large numbers', () => {
            const largeNum1 = BigInt('12345678901234567890');
            const largeNum2 = BigInt('98765432109876543210');
            expect(add(largeNum1, largeNum2)).toBe(BigInt('111111111011111111100'));
        });
    });

    describe('subtract', () => {
        it('should subtract two positive numbers', () => {
            expect(subtract(5n, 3n)).toBe(2n);
        });

        it('should subtract a positive and negative number', () => {
            expect(subtract(5n, -3n)).toBe(8n);
        });

        it('should subtract two negative numbers', () => {
            expect(subtract(-5n, -3n)).toBe(-2n);
        });

        it('should handle zero', () => {
            expect(subtract(5n, 0n)).toBe(5n);
            expect(subtract(0n, 5n)).toBe(-5n);
            expect(subtract(0n, 0n)).toBe(0n);
        });

        it('should handle large numbers', () => {
            const largeNum1 = BigInt('98765432109876543210');
            const largeNum2 = BigInt('12345678901234567890');
            expect(subtract(largeNum1, largeNum2)).toBe(BigInt('86419753208641975320'));
        });
    });

    describe('multiply', () => {
        it('should multiply two positive numbers', () => {
            expect(multiply(5n, 3n)).toBe(15n);
        });

        it('should multiply a positive and negative number', () => {
            expect(multiply(5n, -3n)).toBe(-15n);
        });

        it('should multiply two negative numbers', () => {
            expect(multiply(-5n, -3n)).toBe(15n);
        });

        it('should handle zero', () => {
            expect(multiply(5n, 0n)).toBe(0n);
            expect(multiply(0n, 5n)).toBe(0n);
            expect(multiply(0n, 0n)).toBe(0n);
        });

        it('should handle large numbers', () => {
            const largeNum1 = BigInt('1000000');
            const largeNum2 = BigInt('2000000');
            const result = multiply(largeNum1, largeNum2);
            expect(result).toBe(BigInt('2000000000000'));
        });

        it('should throw error on overflow', () => {
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
            expect(() => multiply(maxSafe, maxSafe)).toThrow('Multiplication would result in overflow');
        });
    });

    describe('divide', () => {
        it('should divide two positive numbers', () => {
            expect(divide(BigInt(10), BigInt(2))).toBe(BigInt(5));
        });

        it('should divide a positive and negative number', () => {
            expect(divide(BigInt(10), BigInt(-2))).toBe(BigInt(-5));
        });

        it('should divide two negative numbers', () => {
            expect(divide(BigInt(-10), BigInt(-2))).toBe(BigInt(5));
        });

        it('should handle zero dividend', () => {
            expect(divide(BigInt(0), BigInt(5))).toBe(BigInt(0));
        });

        it('should throw error on division by zero', () => {
            expect(() => divide(BigInt(10), BigInt(0))).toThrow('Division by zero');
        });

        it('should handle large numbers', () => {
            const largeNum1 = BigInt('98765432109876543210');
            const largeNum2 = BigInt('1234567890');
            // The actual result is 80000000737, not 80000000080
            expect(divide(largeNum1, largeNum2)).toBe(BigInt('80000000737'));
        });

        it('should handle non-divisible numbers', () => {
            expect(divide(BigInt(10), BigInt(3))).toBe(BigInt(3));
        });
    });

    describe('gcd', () => {
        it('should find GCD of two positive numbers', () => {
            expect(gcd(BigInt(12), BigInt(18))).toBe(BigInt(6));
        });

        it('should handle zero', () => {
            expect(gcd(BigInt(0), BigInt(5))).toBe(BigInt(5));
        });

        it('should handle negative numbers', () => {
            expect(gcd(BigInt(-12), BigInt(18))).toBe(BigInt(6));
        });

        it('should handle large numbers', () => {
            const largeNum1 = BigInt('12345678901234567890');
            const largeNum2 = BigInt('98765432109876543210');
            // The actual GCD is 900000000090, not 10
            expect(gcd(largeNum1, largeNum2)).toBe(BigInt('900000000090'));
        });

        it('should handle equal numbers', () => {
            expect(gcd(BigInt(12), BigInt(12))).toBe(BigInt(12));
        });
    });

    describe('lcm', () => {
        it('should find LCM of two positive numbers', () => {
            expect(lcm(BigInt(12), BigInt(18))).toBe(BigInt(36));
        });

        it('should handle zero', () => {
            expect(lcm(BigInt(0), BigInt(5))).toBe(BigInt(0));
        });

        it('should handle negative numbers', () => {
            expect(lcm(BigInt(-12), BigInt(18))).toBe(BigInt(36));
        });

        it('should handle large numbers', () => {
            const largeNum1 = BigInt('1000000');
            const largeNum2 = BigInt('2000000');
            // LCM(1000000, 2000000) = 2000000 since 2000000 is a multiple of 1000000
            expect(lcm(largeNum1, largeNum2)).toBe(BigInt('2000000'));
        });

        it('should handle equal numbers', () => {
            expect(lcm(BigInt(12), BigInt(12))).toBe(BigInt(12));
        });

        it('should throw error on overflow', () => {
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
            expect(() => lcm(maxSafe, maxSafe)).toThrow('LCM calculation would result in overflow');
        });
    });

    describe('modPow', () => {
        it('should compute modular exponentiation correctly', () => {
            const base = 2n;
            const exponent = 3n;
            const modulus = 5n;
            const result = modPow(base, exponent, modulus);
            expect(result).toBe(3n); // 2^3 mod 5 = 8 mod 5 = 3
        });

        it('should handle zero exponent', () => {
            const base = 2n;
            const exponent = 0n;
            const modulus = 5n;
            const result = modPow(base, exponent, modulus);
            expect(result).toBe(1n); // Any number to the power of 0 is 1
        });

        it('should handle zero base', () => {
            const base = 0n;
            const exponent = 3n;
            const modulus = 5n;
            const result = modPow(base, exponent, modulus);
            expect(result).toBe(0n); // 0 to any power is 0
        });

        it('should handle large numbers', () => {
            const base = 2n;
            const exponent = 100n;
            const modulus = 1000000007n;
            const result = modPow(base, exponent, modulus);
            expect(result).toBeDefined();
            expect(result < modulus).toBe(true);
        });

        it('should handle negative base', () => {
            const base = -2n;
            const exponent = 3n;
            const modulus = 5n;
            const result = modPow(base, exponent, modulus);
            expect(result).toBe(2n); // (-2)^3 mod 5 = -8 mod 5 = 2
        });
    });

    describe('modInverse', () => {
        it('should compute modular multiplicative inverse correctly', () => {
            const a = 3n;
            const m = 11n;
            const result = modInverse(a, m);
            expect(result).toBe(4n); // 3 * 4 mod 11 = 1
        });

        it('should throw error for non-coprime numbers', () => {
            const a = 2n;
            const m = 4n;
            expect(() => modInverse(a, m)).toThrow();
        });

        it('should handle large numbers', () => {
            const a = 123456789n;
            const m = 1000000007n;
            const result = modInverse(a, m);
            expect(result).toBeDefined();
            expect(result < m).toBe(true);
            expect((a * result) % m).toBe(1n);
        });

        it('should handle negative numbers', () => {
            const a = -3n;
            const m = 11n;
            const result = modInverse(a, m);
            expect(result).toBe(7n); // -3 * 7 mod 11 = 1
        });
    });

    describe('modAdd', () => {
        it('should compute modular addition correctly', () => {
            const a = 3n;
            const b = 4n;
            const m = 5n;
            const result = modAdd(a, b, m);
            expect(result).toBe(2n); // (3 + 4) mod 5 = 7 mod 5 = 2
        });

        it('should handle zero inputs', () => {
            const a = 0n;
            const b = 4n;
            const m = 5n;
            const result = modAdd(a, b, m);
            expect(result).toBe(4n); // (0 + 4) mod 5 = 4
        });

        it('should handle large numbers', () => {
            const a = 123456789n;
            const b = 987654321n;
            const m = 1000000007n;
            const result = modAdd(a, b, m);
            expect(result).toBeDefined();
            expect(result < m).toBe(true);
        });

        it('should handle negative numbers', () => {
            const a = -3n;
            const b = 4n;
            const m = 5n;
            const result = modAdd(a, b, m);
            expect(result).toBe(1n); // (-3 + 4) mod 5 = 1
        });
    });

    describe('modSub', () => {
        it('should compute modular subtraction correctly', () => {
            const a = 3n;
            const b = 4n;
            const m = 5n;
            const result = modSub(a, b, m);
            expect(result).toBe(4n); // (3 - 4) mod 5 = -1 mod 5 = 4
        });

        it('should handle zero inputs', () => {
            const a = 0n;
            const b = 4n;
            const m = 5n;
            const result = modSub(a, b, m);
            expect(result).toBe(1n); // (0 - 4) mod 5 = -4 mod 5 = 1
        });

        it('should handle large numbers', () => {
            const a = 123456789n;
            const b = 987654321n;
            const m = 1000000007n;
            const result = modSub(a, b, m);
            expect(result).toBeDefined();
            expect(result < m).toBe(true);
        });

        it('should handle negative numbers', () => {
            const a = -3n;
            const b = 4n;
            const m = 5n;
            const result = modSub(a, b, m);
            expect(result).toBe(3n); // (-3 - 4) mod 5 = -7 mod 5 = 3
        });
    });

    describe('modMul', () => {
        it('should compute modular multiplication correctly', () => {
            const a = 3n;
            const b = 4n;
            const m = 5n;
            const result = modMul(a, b, m);
            expect(result).toBe(2n); // (3 * 4) mod 5 = 12 mod 5 = 2
        });

        it('should handle zero inputs', () => {
            const a = 0n;
            const b = 4n;
            const m = 5n;
            const result = modMul(a, b, m);
            expect(result).toBe(0n); // (0 * 4) mod 5 = 0
        });

        it('should handle large numbers', () => {
            const a = 123456789n;
            const b = 987654321n;
            const m = 1000000007n;
            const result = modMul(a, b, m);
            expect(result).toBeDefined();
            expect(result < m).toBe(true);
        });

        it('should handle negative numbers', () => {
            const a = -3n;
            const b = 4n;
            const m = 5n;
            const result = modMul(a, b, m);
            expect(result).toBe(3n); // (-3 * 4) mod 5 = -12 mod 5 = 3
        });
    });
}); 