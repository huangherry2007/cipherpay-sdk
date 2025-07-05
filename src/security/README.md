# 🔐 CipherPay Security SDK

A comprehensive security framework for building production-ready decentralized applications (dApps) with enterprise-grade security features.

## 🚀 Features

- **🔑 Authentication & Authorization** - JWT-like tokens with role-based access control
- **✅ Input Validation** - Schema-based validation with XSS prevention
- **🔐 Secure Key Management** - AES-256-GCM encryption with automatic rotation
- **📝 Audit Logging** - Comprehensive event tracking for compliance
- **🛡️ Security Middleware** - Rate limiting, CORS, security headers, and more
- **⚡ Performance** - Optimized for high-throughput dApp operations

## 📦 Installation

```bash
npm install @cipherpay/sdk
```

## 🏗️ Architecture

```
src/security/
├── auth.ts          # Authentication & Authorization
├── validation.ts    # Input Validation & Sanitization
├── keyManager.ts    # Secure Key Management
├── audit.ts         # Audit Logging & Compliance
├── middleware.ts    # Security Middleware
└── README.md        # This file
```

## 🔧 Quick Start

### 1. Basic Setup

```typescript
import { 
  AuthManager, 
  SecurityMiddleware, 
  Permissions, 
  ValidationSchemas 
} from '@cipherpay/sdk/security';

// Initialize security components
const authManager = AuthManager.getInstance();
const securityMiddleware = SecurityMiddleware.getInstance();
```

### 2. User Authentication

```typescript
// Authenticate user
const token = await authManager.authenticateUser(
  'user@example.com',
  'securePassword123',
  '192.168.1.1',
  'Mozilla/5.0'
);

// Validate token
const authRequest = await authManager.validateToken(
  token.token,
  '192.168.1.1',
  'Mozilla/5.0'
);
```

### 3. Permission Checking

```typescript
// Check if user can create transfers
const canTransfer = await authManager.checkPermission(
  authRequest,
  Permissions.TRANSFER_CREATE
);

// Check conditional permissions (e.g., large amounts require admin)
const canTransferLarge = await authManager.checkPermission(
  authRequest,
  Permissions.TRANSFER_LARGE_AMOUNT
);
```

## 🛡️ Security Components

### Authentication & Authorization (`auth.ts`)

**Features:**
- JWT-like token management with secure session handling
- Role-based access control (RBAC) with granular permissions
- Conditional permissions for complex business rules
- Automatic token cleanup and session management

**Usage:**
```typescript
// Define custom permissions
const customPermission = {
  resource: 'wallet',
  action: 'large_transfer',
  conditions: { 
    requiredRoles: ['admin', 'manager'],
    maxAmount: 10000 
  }
};

// Check permissions with conditions
const hasPermission = await authManager.checkPermission(
  authRequest,
  customPermission
);
```

### Input Validation (`validation.ts`)

**Features:**
- Schema-based validation with type checking
- XSS prevention through HTML sanitization
- Email, URL, and crypto key validation
- Predefined schemas for common operations

**Usage:**
```typescript
import { InputValidator, ValidationSchemas } from '@cipherpay/sdk/security';

const validator = InputValidator.getInstance();

// Validate wallet creation data
const result = validator.validate(
  {
    userId: 'user-123',
    walletType: 'standard',
    metadata: { name: 'My Wallet' }
  },
  ValidationSchemas.createWallet
);

if (result.isValid) {
  // Use sanitized data
  const walletData = result.sanitizedData;
} else {
  console.log('Validation errors:', result.errors);
}
```

### Secure Key Management (`keyManager.ts`)

**Features:**
- AES-256-GCM encryption at rest
- Automatic key rotation with configurable policies
- Key lifecycle management (generate, rotate, deactivate, delete)
- Export/import functionality for backup and recovery

**Usage:**
```typescript
import { KeyManager } from '@cipherpay/sdk/security';

const keyManager = KeyManager.getInstance();

// Generate a new wallet key
const keyId = await keyManager.generateKey(
  'wallet',
  'AES-256-GCM',
  32,
  ['production', 'wallet']
);

// Retrieve and use the key
const keyData = await keyManager.getKey(keyId);

// Rotate keys automatically
const newKeyId = await keyManager.rotateKey(keyId);
```

### Audit Logging (`audit.ts`)

**Features:**
- Comprehensive event tracking for all security-sensitive operations
- Structured logging with categorization
- Search and filtering capabilities
- Export functionality for regulatory compliance

**Usage:**
```typescript
import { AuditLogger } from '@cipherpay/sdk/security';

const auditLogger = AuditLogger.getInstance();

// Log authentication events
auditLogger.logAuthentication(
  'user-123',
  'login',
  true,
  { ip: '192.168.1.1' },
  '192.168.1.1',
  'Mozilla/5.0'
);

// Log financial transactions
auditLogger.logFinancial(
  'user-123',
  'transfer_created',
  'transfer',
  'tx-123',
  true,
  { amount: '100.50', asset: 'ETH' },
  '192.168.1.1',
  'Mozilla/5.0'
);

// Search audit logs
const events = auditLogger.searchEvents({
  userId: 'user-123',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  category: 'financial'
});
```

### Security Middleware (`middleware.ts`)

**Features:**
- Request validation with schema enforcement
- Rate limiting to prevent abuse
- CORS configuration for cross-origin security
- Security headers (HSTS, CSP, XSS protection)
- Request logging with performance monitoring

**Usage:**
```typescript
import { SecurityMiddleware, Permissions, ValidationSchemas } from '@cipherpay/sdk/security';

const security = SecurityMiddleware.getInstance();

// Create secure API endpoint
app.post('/api/wallet', 
  security.createSecurityMiddleware({
    requireAuth: true,
    permissions: [Permissions.WALLET_CREATE],
    validationSchema: ValidationSchemas.createWallet,
    auditAction: 'wallet_created',
    auditResource: 'wallet',
    rateLimitKey: 'wallet_creation',
    maxRequestSize: 1024 * 1024 // 1MB
  }),
  async (req, res) => {
    // Your wallet creation logic here
    // All security checks are already handled
    const walletData = req.securityContext?.validatedData;
    // ... create wallet
  }
);

// Add security headers to all responses
app.use(security.createSecurityHeadersMiddleware());

// Add CORS protection
app.use(security.createCorsMiddleware(['https://yourdomain.com']));

// Add rate limiting
app.use(security.createRateLimitMiddleware('api_requests', 100, 60000)); // 100 requests per minute
```

## 🎯 dApp Development Benefits

### For Frontend Developers

**Easy Integration with React/Next.js:**
```typescript
// React hook for authentication
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      authManager.validateToken(token, getClientIP(), navigator.userAgent)
        .then(authRequest => setUser(authRequest))
        .catch(() => localStorage.removeItem('auth_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return { user, loading };
};

// Protected component
const ProtectedRoute = ({ children, requiredPermission }) => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" />;
  
  const hasPermission = user.permissions.includes(requiredPermission);
  if (!hasPermission) return <AccessDenied />;
  
  return children;
};
```

**Secure API Calls:**
```typescript
// API client with automatic security
const apiClient = {
  async createWallet(walletData) {
    const token = localStorage.getItem('auth_token');
    
    const response = await fetch('/api/wallet', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(walletData)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create wallet');
    }
    
    return response.json();
  }
};
```

### For Smart Contract Integration

**Secure Transaction Signing:**
```typescript
// Secure key management for transaction signing
const signTransaction = async (transaction) => {
  const keyId = await keyManager.generateKey('signing', 'secp256k1', 32);
  const privateKey = await keyManager.getKey(keyId);
  
  // Sign transaction
  const signature = await signWithPrivateKey(transaction, privateKey);
  
  // Log the signing event
  auditLogger.logSecurity(
    'user-123',
    'transaction_signed',
    'transaction',
    transaction.hash,
    true,
    { contract: transaction.to, method: transaction.data },
    '192.168.1.1',
    'Mozilla/5.0'
  );
  
  return signature;
};
```

**Permission-Based Contract Access:**
```typescript
// Check permissions before contract interaction
const executeContractMethod = async (contract, method, params) => {
  const hasPermission = await authManager.checkPermission(
    authRequest,
    { resource: 'contract', action: method }
  );
  
  if (!hasPermission) {
    throw new Error('Insufficient permissions');
  }
  
  // Execute contract method
  const result = await contract[method](...params);
  
  // Audit the operation
  auditLogger.logFinancial(
    authRequest.userId,
    'contract_executed',
    'contract',
    contract.address,
    true,
    { method, params, result },
    authRequest.ip,
    authRequest.userAgent
  );
  
  return result;
};
```

### For Production Deployment

**Environment Configuration:**
```typescript
// Production security configuration
const productionConfig = {
  // Master key for key management (set via environment variable)
  MASTER_KEY: process.env.MASTER_KEY,
  
  // JWT secret for authentication
  JWT_SECRET: process.env.JWT_SECRET,
  
  // Token expiry (1 hour)
  TOKEN_EXPIRY_MS: 3600000,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // Audit logging
  AUDIT_RETENTION_DAYS: 365,
  AUDIT_EXPORT_ENABLED: true
};
```

**Compliance Features:**
```typescript
// Generate compliance reports
const generateComplianceReport = async (startDate, endDate) => {
  const auditEvents = auditLogger.searchEvents({
    startDate,
    endDate,
    category: ['financial', 'security', 'authentication']
  });
  
  const report = {
    period: { startDate, endDate },
    totalEvents: auditEvents.length,
    eventsByCategory: groupBy(auditEvents, 'category'),
    securityIncidents: auditEvents.filter(e => e.severity === 'high'),
    userActivity: auditEvents.filter(e => e.category === 'authentication')
  };
  
  return report;
};
```

## 🔒 Security Best Practices

### 1. Environment Variables
```bash
# Required for production
MASTER_KEY=your-32-byte-master-key-in-hex
JWT_SECRET=your-jwt-secret-key
NODE_ENV=production

# Optional configuration
TOKEN_EXPIRY_MS=3600000
AUDIT_RETENTION_DAYS=365
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. Key Rotation
```typescript
// Set up automatic key rotation
keyManager.setRotationPolicy('wallet', {
  maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  rotationWindow: 30 * 24 * 60 * 60 * 1000, // 30 days
  backupRetention: 3
});

// Check for keys needing rotation
const keysNeedingRotation = keyManager.checkKeyRotation();
if (keysNeedingRotation.length > 0) {
  console.log('Keys need rotation:', keysNeedingRotation);
}
```

### 3. Input Validation
```typescript
// Always validate user input
const validateUserInput = (data) => {
  const result = validator.validate(data, ValidationSchemas.userRegistration);
  
  if (!result.isValid) {
    throw new Error(`Validation failed: ${result.errors.join(', ')}`);
  }
  
  return result.sanitizedData;
};
```

### 4. Audit Logging
```typescript
// Log all security-sensitive operations
const secureOperation = async (operation, data) => {
  try {
    const result = await operation(data);
    
    auditLogger.logEvent({
      userId: authRequest.userId,
      action: 'operation_success',
      resource: 'secure_operation',
      details: { operation: operation.name, data },
      success: true,
      severity: 'low',
      category: 'system'
    });
    
    return result;
  } catch (error) {
    auditLogger.logEvent({
      userId: authRequest.userId,
      action: 'operation_failed',
      resource: 'secure_operation',
      details: { operation: operation.name, error: error.message },
      success: false,
      severity: 'medium',
      category: 'security'
    });
    
    throw error;
  }
};
```

## 📚 API Reference

### AuthManager
- `authenticateUser(email, password, ip, userAgent)` - Authenticate user
- `validateToken(token, ip, userAgent)` - Validate authentication token
- `checkPermission(authRequest, permission)` - Check user permissions
- `revokeToken(token, userId)` - Revoke user token

### InputValidator
- `validate(data, schema)` - Validate data against schema
- `validateEmail(email)` - Validate email address
- `validateUrl(url)` - Validate URL
- `validateCryptoKey(key, expectedLength)` - Validate cryptographic key

### KeyManager
- `generateKey(type, algorithm, keySize, tags)` - Generate new key
- `getKey(keyId)` - Retrieve key data
- `rotateKey(keyId)` - Rotate existing key
- `deactivateKey(keyId)` - Deactivate key
- `deleteKey(keyId)` - Permanently delete key

### AuditLogger
- `logEvent(event)` - Log custom event
- `logAuthentication(userId, action, success, details, ip, userAgent)` - Log auth events
- `logFinancial(userId, action, resource, resourceId, success, details, ip, userAgent)` - Log financial events
- `searchEvents(filters)` - Search audit logs

### SecurityMiddleware
- `createSecurityMiddleware(config)` - Create security middleware
- `createRateLimitMiddleware(key, maxRequests, windowMs)` - Create rate limiting
- `createCorsMiddleware(allowedOrigins)` - Create CORS middleware
- `createSecurityHeadersMiddleware()` - Add security headers

## 🧪 Testing

```typescript
// Test security components
import { AuthManager, KeyManager, AuditLogger } from '@cipherpay/sdk/security';

describe('Security Components', () => {
  it('should authenticate user', async () => {
    const authManager = AuthManager.getInstance();
    const token = await authManager.authenticateUser(
      'test@example.com',
      'password123',
      '192.168.1.1',
      'Mozilla/5.0'
    );
    
    expect(token).toBeDefined();
    expect(token.token).toBeDefined();
  });
  
  it('should generate and retrieve keys', async () => {
    const keyManager = KeyManager.getInstance();
    const keyId = await keyManager.generateKey('wallet', 'AES-256-GCM', 32);
    const keyData = await keyManager.getKey(keyId);
    
    expect(keyData).toBeDefined();
    expect(Buffer.isBuffer(keyData)).toBe(true);
  });
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the test files for usage examples

---

**Built with ❤️ for secure dApp development** 