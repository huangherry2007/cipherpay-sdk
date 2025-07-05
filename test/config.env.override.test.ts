// Set environment variables BEFORE any imports
process.env.SECURITY_AUTH_TOKENEXPIRYMS = '7200000'; // 2 hours
process.env.SECURITY_ENCRYPTION_ALGORITHM = 'AES-256-CBC';
process.env.SECURITY_RATELIMIT_DEFAULTMAXREQUESTS = '200';
process.env.NODE_ENV = 'production'; // Test with production preset

console.log('SECURITY_ENCRYPTION_ALGORITHM before import:', process.env.SECURITY_ENCRYPTION_ALGORITHM);
console.log('NODE_ENV before import:', process.env.NODE_ENV);

describe('SecurityConfigManager (env override, isolated)', () => {
  beforeAll(() => {
    jest.resetModules();
  });

  it('should detect environment variables', () => {
    // Check if environment variables are set
    console.log('All SECURITY_ env vars in test:', Object.entries(process.env).filter(([k]) => k.startsWith('SECURITY_')));
    expect(process.env.SECURITY_ENCRYPTION_ALGORITHM).toBe('AES-256-CBC');
  });

  it('should override configuration with environment variables (isolated)', () => {
    jest.resetModules();
    const { SecurityConfigManager } = require('../src/security/config');
    SecurityConfigManager.resetInstance();
    // Print all SECURITY_ env vars
    console.log('SECURITY_ env vars:', Object.entries(process.env).filter(([k]) => k.startsWith('SECURITY_')));
    console.log('NODE_ENV in test:', process.env.NODE_ENV);
    const configManager = SecurityConfigManager.getInstance();
    configManager.reloadConfig(); // Force reload with current env vars
    const config = configManager.getConfig();
    
    // Direct debug prints
    console.log('=== DIRECT DEBUG ===');
    console.log('process.env.SECURITY_ENCRYPTION_ALGORITHM:', process.env.SECURITY_ENCRYPTION_ALGORITHM);
    console.log('config.encryption.algorithm:', config.encryption.algorithm);
    console.log('config.encryption:', JSON.stringify(config.encryption, null, 2));
    console.log('config.auth.tokenExpiryMs:', config.auth.tokenExpiryMs);
    console.log('config.rateLimit.defaultMaxRequests:', config.rateLimit.defaultMaxRequests);
    
    // Print the final config
    console.log('Final config:', JSON.stringify(config, null, 2));
    expect(config.auth.tokenExpiryMs).toBe(7200000);
    expect(config.encryption.algorithm).toBe('AES-256-CBC');
    expect(config.rateLimit.defaultMaxRequests).toBe(200);
  });
}); 