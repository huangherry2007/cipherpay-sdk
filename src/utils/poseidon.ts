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
    if (inputs.length === 2) {
        return poseidon2(inputs);
    }
    // For more than 2 inputs, we need to hash them in pairs
    // This is a simplified approach - in production you might want a more sophisticated method
    let result = poseidon2([inputs[0], inputs[1]]);
    for (let i = 2; i < inputs.length; i++) {
        result = poseidon2([result, inputs[i]]);
    }
    return result;
} 