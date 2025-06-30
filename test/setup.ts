// Test setup file
import { TextEncoder, TextDecoder } from 'util';
import crypto from 'crypto';

// Polyfill for TextEncoder/TextDecoder in Node.js environment
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Polyfill for crypto.subtle in Node.js environment
if (!global.crypto) {
  (global as any).crypto = crypto.webcrypto;
} else if (!global.crypto.subtle) {
  (global as any).crypto.subtle = crypto.webcrypto.subtle;
}

// Ensure crypto.getRandomValues is available
if (!global.crypto.getRandomValues) {
  (global as any).crypto.getRandomValues = crypto.webcrypto.getRandomValues;
}

// BigInt serialization support
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };

// @ts-ignore
beforeAll(() => {
  // @ts-ignore
  console.log = jest.fn();
  // @ts-ignore
  console.warn = jest.fn();
  // @ts-ignore
  console.error = jest.fn();
});

// @ts-ignore
afterAll(() => {
  // @ts-ignore
  console.log = originalConsole.log;
  // @ts-ignore
  console.warn = originalConsole.warn;
  // @ts-ignore
  console.error = originalConsole.error;
}); 