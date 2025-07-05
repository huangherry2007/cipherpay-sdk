// Set environment variables BEFORE any imports
process.env.SECURITY_AUTH_TOKENEXPIRYMS = '7200000'; // 2 hours
process.env.SECURITY_ENCRYPTION_ALGORITHM = 'AES-256-CBC';
process.env.SECURITY_RATELIMIT_DEFAULTMAXREQUESTS = '200';
process.env.NODE_ENV = 'production';

console.log('=== FRESH TEST START ===');
console.log('SECURITY_ENCRYPTION_ALGORITHM:', process.env.SECURITY_ENCRYPTION_ALGORITHM);
console.log('NODE_ENV:', process.env.NODE_ENV);

describe('SecurityConfigManager (fresh test)', () => {
  it('should override configuration with environment variables (fresh)', () => {
    // Force fresh module load
    jest.resetModules();
    
    // Clear any cached instances
    const { SecurityConfigManager } = require('../src/security/config');
    SecurityConfigManager.resetInstance();
    
    console.log('=== AFTER RESET ===');
    console.log('SECURITY_ env vars:', Object.entries(process.env).filter(([k]) => k.startsWith('SECURITY_')));
    
    // Get fresh instance
    const configManager = SecurityConfigManager.getInstance();
    
    // Force reload
    configManager.reloadConfig();
    
    const config = configManager.getConfig();
    
    console.log('=== FINAL VALUES ===');
    console.log('process.env.SECURITY_ENCRYPTION_ALGORITHM:', process.env.SECURITY_ENCRYPTION_ALGORITHM);
    console.log('config.encryption.algorithm:', config.encryption.algorithm);
    console.log('config.auth.tokenExpiryMs:', config.auth.tokenExpiryMs);
    console.log('config.rateLimit.defaultMaxRequests:', config.rateLimit.defaultMaxRequests);
    
    // Test expectations
    expect(config.auth.tokenExpiryMs).toBe(7200000);
    expect(config.encryption.algorithm).toBe('AES-256-CBC');
    expect(config.rateLimit.defaultMaxRequests).toBe(200);
  });
}); 