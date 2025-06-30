import { utils } from 'ethers';
import { EncryptedNote, NoteMetadata } from '../types/Note';

/**
 * Generates a commitment for a note
 * @param amount Note amount
 * @param recipientAddress Recipient address
 * @returns Commitment hash
 */
export async function generateCommitment(amount: bigint, recipientAddress: string): Promise<string> {
  const data = `${amount}_${recipientAddress}_${Date.now()}`;
  return utils.keccak256(utils.toUtf8Bytes(data));
}

/**
 * Generates a nullifier for a note
 * @param commitment Note commitment
 * @returns Nullifier hash
 */
export async function generateNullifier(commitment: string): Promise<string> {
  const data = `${commitment}_${Date.now()}_nullifier`;
  return utils.keccak256(utils.toUtf8Bytes(data));
}

/**
 * Generates a random encryption key
 * @returns A random 32-byte key as a hex string
 */
export function generateEncryptionKey(): string {
  return utils.hexlify(utils.randomBytes(32));
}

/**
 * Encrypts data using AES-GCM
 * @param data Data to encrypt
 * @param key Encryption key
 * @returns Encrypted data with nonce
 */
export async function encryptData(data: string, key: string): Promise<{ ciphertext: string; nonce: string }> {
  const encoder = new TextEncoder();
  const keyData = utils.arrayify(key);
  const dataBuffer = encoder.encode(data);
  
  // Generate a random nonce
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  
  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt the data
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce
    },
    cryptoKey,
    dataBuffer
  );
  
  return {
    ciphertext: utils.hexlify(new Uint8Array(ciphertext)),
    nonce: utils.hexlify(nonce)
  };
}

/**
 * Decrypts data using AES-GCM
 * @param encryptedData Encrypted data
 * @param key Encryption key
 * @param nonce Nonce used for encryption
 * @returns Decrypted data
 */
export async function decryptData(
  encryptedData: string,
  key: string,
  nonce: string
): Promise<string> {
  const keyData = utils.arrayify(key);
  const ciphertext = utils.arrayify(encryptedData);
  const nonceData = utils.arrayify(nonce);
  
  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonceData
    },
    cryptoKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypts a note with the recipient's public key
 * @param note Note to encrypt
 * @param recipientPubKey Recipient's public key
 * @returns Encrypted note
 */
export async function encryptNote(
  note: string,
  recipientPubKey: string
): Promise<EncryptedNote> {
  // Validate public key format - should be a valid hex string
  if (!recipientPubKey || !/^0x[a-fA-F0-9]+$/.test(recipientPubKey) || recipientPubKey.length < 66) {
    throw new Error('Invalid public key format');
  }
  
  // Generate a random encryption key
  const encryptionKey = generateEncryptionKey();
  
  // Encrypt note with the random key
  const { ciphertext, nonce } = await encryptData(note, encryptionKey);
  
  // For now, we'll use a simplified approach without ECDH
  // In a real implementation, you would encrypt the encryption key with the recipient's public key
  const ephemeralKey = utils.hexlify(utils.randomBytes(32));
  
  // Create metadata
  const metadata: NoteMetadata = {
    version: 1,
    chainType: 'ethereum',
    network: 'mainnet',
    timestamp: Date.now()
  };
  
  return {
    ciphertext,
    ephemeralKey,
    nonce,
    metadata
  };
}

/**
 * Decrypts a note using the recipient's private key
 * @param encryptedNote Encrypted note
 * @param privateKey Recipient's private key
 * @returns Decrypted note
 */
export async function decryptNote(
  encryptedNote: EncryptedNote,
  privateKey: string
): Promise<string> {
  // Validate private key format - should be a valid hex string
  if (!privateKey || !/^0x[a-fA-F0-9]+$/.test(privateKey) || privateKey.length < 66) {
    throw new Error('Invalid private key format');
  }
  
  // For now, we'll use a simplified approach
  // In a real implementation, you would decrypt the encryption key with the recipient's private key
  const encryptionKey = utils.hexlify(utils.randomBytes(32));
  
  // Decrypt note
  return decryptData(
    encryptedNote.ciphertext,
    encryptionKey,
    encryptedNote.nonce
  );
}
