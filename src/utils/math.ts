import { utils } from 'ethers';

// Maximum safe bigint value (2^256 - 1)
const MAX_SAFE_BIGINT = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

/**
 * Checks if a bigint value is within safe range
 * @param value Value to check
 * @returns True if value is within safe range
 */
export function isSafeBigInt(value: bigint): boolean {
  return value >= BigInt(0) && value <= MAX_SAFE_BIGINT;
}

/**
 * Converts a number to a bigint with the specified number of decimals
 * @param amount Number to convert
 * @param decimals Number of decimal places
 * @returns BigInt representation
 * @throws Error if result exceeds safe range
 */
export function toBigInt(amount: number | string, decimals: number = 18): bigint {
  let result: bigint;
  if (typeof amount === 'string') {
    result = utils.parseUnits(amount, decimals).toBigInt();
  } else {
    result = utils.parseUnits(amount.toString(), decimals).toBigInt();
  }
  
  if (!isSafeBigInt(result)) {
    throw new Error('Amount exceeds maximum safe value');
  }
  return result;
}

/**
 * Converts a bigint to a number with the specified number of decimals
 * @param amount BigInt to convert
 * @param decimals Number of decimal places
 * @returns Number representation
 * @throws Error if amount exceeds safe range
 */
export function fromBigInt(amount: bigint, decimals: number = 18): number {
  if (!isSafeBigInt(amount)) {
    throw new Error('Amount exceeds maximum safe value');
  }
  return Number(utils.formatUnits(amount, decimals));
}

/**
 * Adds two bigint values with overflow protection
 * @param a First value
 * @param b Second value
 * @returns Sum as bigint
 * @throws Error if result exceeds safe range
 */
export function add(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  const result = a + b;
  if (!isSafeBigInt(result)) {
    throw new Error('Addition result exceeds maximum safe value');
  }
  return result;
}

/**
 * Subtracts two bigint values with overflow protection
 * @param a First value
 * @param b Second value
 * @returns Difference as bigint
 * @throws Error if result is negative or exceeds safe range
 */
export function subtract(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (b > a) {
    throw new Error('Subtraction would result in negative value');
  }
  
  const result = a - b;
  if (!isSafeBigInt(result)) {
    throw new Error('Subtraction result exceeds maximum safe value');
  }
  return result;
}

/**
 * Multiplies two bigint values with overflow protection
 * @param a First value
 * @param b Second value
 * @returns Product as bigint
 * @throws Error if result exceeds safe range
 */
export function multiply(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  // Check for potential overflow before multiplication
  if (a > BigInt(0) && b > BigInt(0) && a > MAX_SAFE_BIGINT / b) {
    throw new Error('Multiplication would exceed maximum safe value');
  }
  
  const result = a * b;
  if (!isSafeBigInt(result)) {
    throw new Error('Multiplication result exceeds maximum safe value');
  }
  return result;
}

/**
 * Divides two bigint values with overflow protection
 * @param a First value
 * @param b Second value
 * @returns Quotient as bigint
 * @throws Error if divisor is zero or result exceeds safe range
 */
export function divide(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (b === BigInt(0)) {
    throw new Error('Division by zero');
  }
  
  const result = a / b;
  if (!isSafeBigInt(result)) {
    throw new Error('Division result exceeds maximum safe value');
  }
  return result;
}

/**
 * Calculates the modulo of two bigint values with overflow protection
 * @param a First value
 * @param b Second value
 * @returns Remainder as bigint
 * @throws Error if divisor is zero or result exceeds safe range
 */
export function modulo(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (b === BigInt(0)) {
    throw new Error('Modulo by zero');
  }
  
  const result = a % b;
  if (!isSafeBigInt(result)) {
    throw new Error('Modulo result exceeds maximum safe value');
  }
  return result;
}

/**
 * Checks if a value is within a range
 * @param value Value to check
 * @param min Minimum value
 * @param max Maximum value
 * @returns True if value is within range
 * @throws Error if min or max exceeds safe range
 */
export function isInRange(value: bigint, min: bigint, max: bigint): boolean {
  if (!isSafeBigInt(min) || !isSafeBigInt(max)) {
    throw new Error('Range values exceed maximum safe value');
  }
  return value >= min && value <= max;
}

/**
 * Generates a random bigint within a range with overflow protection
 * @param min Minimum value
 * @param max Maximum value
 * @returns Random bigint within range
 * @throws Error if range exceeds safe values
 */
export function randomBigInt(min: bigint, max: bigint): bigint {
  if (!isSafeBigInt(min) || !isSafeBigInt(max)) {
    throw new Error('Range values exceed maximum safe value');
  }
  
  if (min >= max) {
    throw new Error('Invalid range: min must be less than max');
  }
  
  const range = max - min;
  if (!isSafeBigInt(range)) {
    throw new Error('Range size exceeds maximum safe value');
  }
  
  const randomBytes = utils.randomBytes(32);
  const randomValue = BigInt('0x' + utils.hexlify(randomBytes));
  const result = min + (randomValue % range);
  
  if (!isSafeBigInt(result)) {
    throw new Error('Random value exceeds maximum safe value');
  }
  return result;
}

/**
 * Calculates the greatest common divisor of two bigint values
 * @param a First value
 * @param b Second value
 * @returns GCD as bigint
 * @throws Error if result exceeds safe range
 */
export function gcd(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  let x = a;
  let y = b;
  while (y !== BigInt(0)) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  
  if (!isSafeBigInt(x)) {
    throw new Error('GCD result exceeds maximum safe value');
  }
  return x;
}

/**
 * Calculates the least common multiple of two bigint values
 * @param a First value
 * @param b Second value
 * @returns LCM as bigint
 * @throws Error if result exceeds safe range
 */
export function lcm(a: bigint, b: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (a === BigInt(0) || b === BigInt(0)) {
    return BigInt(0);
  }
  
  const result = (a * b) / gcd(a, b);
  if (!isSafeBigInt(result)) {
    throw new Error('LCM result exceeds maximum safe value');
  }
  return result;
}

/**
 * Computes modular exponentiation (base^exponent mod modulus)
 * @param base Base value
 * @param exponent Exponent value
 * @param modulus Modulus value
 * @returns Result as bigint
 * @throws Error if result exceeds safe range
 */
export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (!isSafeBigInt(base) || !isSafeBigInt(exponent) || !isSafeBigInt(modulus)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (modulus === BigInt(0)) {
    throw new Error('Modulus cannot be zero');
  }
  
  if (exponent < BigInt(0)) {
    throw new Error('Exponent must be non-negative');
  }
  
  let result = BigInt(1);
  base = base % modulus;
  
  while (exponent > BigInt(0)) {
    if (exponent % BigInt(2) === BigInt(1)) {
      result = (result * base) % modulus;
    }
    base = (base * base) % modulus;
    exponent = exponent / BigInt(2);
  }
  
  if (!isSafeBigInt(result)) {
    throw new Error('ModPow result exceeds maximum safe value');
  }
  return result;
}

/**
 * Computes modular multiplicative inverse (a^-1 mod m)
 * @param a Value to find inverse for
 * @param m Modulus value
 * @returns Inverse as bigint
 * @throws Error if inverse does not exist or result exceeds safe range
 */
export function modInverse(a: bigint, m: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(m)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (m <= BigInt(0)) {
    throw new Error('Modulus must be positive');
  }
  
  a = ((a % m) + m) % m;
  if (a === BigInt(0)) {
    throw new Error('No modular inverse exists');
  }
  
  let t = BigInt(0);
  let newT = BigInt(1);
  let r = m;
  let newR = a;
  
  while (newR !== BigInt(0)) {
    const quotient = r / newR;
    [t, newT] = [newT, t - quotient * newT];
    [r, newR] = [newR, r - quotient * newR];
  }
  
  if (r > BigInt(1)) {
    throw new Error('No modular inverse exists');
  }
  
  if (t < BigInt(0)) {
    t += m;
  }
  
  if (!isSafeBigInt(t)) {
    throw new Error('ModInverse result exceeds maximum safe value');
  }
  return t;
}

/**
 * Computes modular addition ((a + b) mod m)
 * @param a First value
 * @param b Second value
 * @param m Modulus value
 * @returns Result as bigint
 * @throws Error if result exceeds safe range
 */
export function modAdd(a: bigint, b: bigint, m: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b) || !isSafeBigInt(m)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (m <= BigInt(0)) {
    throw new Error('Modulus must be positive');
  }
  
  const result = ((a % m) + (b % m)) % m;
  if (!isSafeBigInt(result)) {
    throw new Error('ModAdd result exceeds maximum safe value');
  }
  return result;
}

/**
 * Computes modular subtraction ((a - b) mod m)
 * @param a First value
 * @param b Second value
 * @param m Modulus value
 * @returns Result as bigint
 * @throws Error if result exceeds safe range
 */
export function modSub(a: bigint, b: bigint, m: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b) || !isSafeBigInt(m)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (m <= BigInt(0)) {
    throw new Error('Modulus must be positive');
  }
  
  const result = ((a % m) - (b % m) + m) % m;
  if (!isSafeBigInt(result)) {
    throw new Error('ModSub result exceeds maximum safe value');
  }
  return result;
}

/**
 * Computes modular multiplication ((a * b) mod m)
 * @param a First value
 * @param b Second value
 * @param m Modulus value
 * @returns Result as bigint
 * @throws Error if result exceeds safe range
 */
export function modMul(a: bigint, b: bigint, m: bigint): bigint {
  if (!isSafeBigInt(a) || !isSafeBigInt(b) || !isSafeBigInt(m)) {
    throw new Error('Input values exceed maximum safe value');
  }
  
  if (m <= BigInt(0)) {
    throw new Error('Modulus must be positive');
  }
  
  const result = ((a % m) * (b % m)) % m;
  if (!isSafeBigInt(result)) {
    throw new Error('ModMul result exceeds maximum safe value');
  }
  return result;
}
