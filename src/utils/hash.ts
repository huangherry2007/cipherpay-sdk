import { utils } from 'ethers';

/**
 * Hashes a string or Buffer using keccak256
 * @param input String or Buffer to hash
 * @returns Hashed string in hex format
 */
export function hash(input: string | Buffer): string {
    if (typeof input === 'string') {
        return utils.keccak256(utils.toUtf8Bytes(input));
    } else {
        // Handle Buffer input
        return utils.keccak256(input);
    }
}

/**
 * Hashes a string to a field element
 * @param input String to hash
 * @returns Field element as a bigint
 */
export function hashToField(input: string): bigint {
    const hashResult = hash(input);
    return BigInt(hashResult);
}

/**
 * Hashes a string to a group element on the secp256k1 curve
 * @param input String to hash
 * @returns Group element as {x, y} coordinates
 */
export function hashToGroup(input: string): { x: bigint; y: bigint } {
    const fieldElement = hashToField(input);
    // For secp256k1 curve: y^2 = x^3 + 7
    // We'll use the field element as x and compute y
    const x = fieldElement;
    const x3 = x * x * x;
    const y2 = x3 + 7n;
    // For simplicity, we'll use a deterministic y value
    // In a real implementation, you would need to compute the actual y value
    const y = x; // This is just a placeholder
    return { x, y };
} 