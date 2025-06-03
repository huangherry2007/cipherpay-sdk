import { poseidon1, poseidon2 } from 'poseidon-lite';

/**
 * Hashes a single input using Poseidon hash function
 * @param input Input value as a bigint
 * @returns Hashed value as a bigint
 */
export function poseidonHash(input: bigint): bigint {
    return poseidon1([input]);
}

/**
 * Hashes multiple inputs using Poseidon hash function
 * @param inputs Array of input values as bigints
 * @returns Hashed value as a bigint
 */
export function poseidonHashMany(inputs: bigint[]): bigint {
    if (inputs.length === 0) {
        return poseidon1([0n]);
    }
    if (inputs.length === 1) {
        return poseidon1([inputs[0]]);
    }
    return poseidon2(inputs);
} 