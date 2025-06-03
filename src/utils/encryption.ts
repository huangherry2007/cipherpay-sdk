import { utils } from 'ethers';
import { EncryptedNote, NoteMetadata } from '../types/Note';

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
  // Generate ephemeral key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );
  
  // Export public key
  const ephemeralPubKey = await crypto.subtle.exportKey(
    'raw',
    ephemeralKeyPair.publicKey
  );
  
  // Derive shared secret
  const recipientKey = await crypto.subtle.importKey(
    'raw',
    utils.arrayify(recipientPubKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
  
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: recipientKey
    },
    ephemeralKeyPair.privateKey,
    256
  );
  
  // Encrypt note with shared secret
  const { ciphertext, nonce } = await encryptData(
    note,
    utils.hexlify(new Uint8Array(sharedSecret))
  );
  
  // Create metadata
  const metadata: NoteMetadata = {
    version: 1,
    chainType: 'ethereum',
    network: 'mainnet',
    timestamp: Date.now()
  };
  
  return {
    ciphertext,
    ephemeralKey: utils.hexlify(new Uint8Array(ephemeralPubKey)),
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
  // Import private key
  const keyPair = await crypto.subtle.importKey(
    'pkcs8',
    utils.arrayify(privateKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
  
  // Import ephemeral public key
  const ephemeralPubKey = await crypto.subtle.importKey(
    'raw',
    utils.arrayify(encryptedNote.ephemeralKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
  
  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: ephemeralPubKey
    },
    keyPair,
    256
  );
  
  // Decrypt note
  return decryptData(
    encryptedNote.ciphertext,
    utils.hexlify(new Uint8Array(sharedSecret)),
    encryptedNote.nonce
  );
}
