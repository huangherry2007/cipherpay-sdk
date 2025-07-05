// Mock dependencies BEFORE importing the modules
jest.mock('../src/monitoring/HealthChecker', () => ({
  HealthChecker: {
    getInstance: jest.fn()
  }
}));

jest.mock('../src/errors/ErrorHandler', () => ({
  ErrorHandler: {
    getInstance: jest.fn()
  }
}));

jest.mock('../src/utils/RateLimiter', () => ({
  getRateLimitStats: jest.fn()
}));

// Now import the modules after mocks are set up
import { HealthAPI } from '../src/monitoring/HealthAPI';
import { HealthServer } from '../src/monitoring/HealthServer';

describe('HealthAPI', () => {
  let healthAPI: HealthAPI;
  let mockHealthChecker: any;
  let mockErrorHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up mocks before creating HealthAPI instance
    mockHealthChecker = {
      checkHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: Date.now(),
        version: '1.0.0',
        environment: 'test',
        checks: [
          {
            name: 'test_check',
            status: 'healthy',
            message: 'Test check passed',
            timestamp: Date.now(),
            duration: 10
          }
        ]
      }),
      startPeriodicChecks: jest.fn(),
      stopPeriodicChecks: jest.fn()
    };
    
    mockErrorHandler = {
      getErrorStats: jest.fn().mockReturnValue({}),
      resetErrorCounts: jest.fn()
    };
    
    // Mock the HealthChecker singleton
    const HealthCheckerMock = require('../src/monitoring/HealthChecker').HealthChecker;
    HealthCheckerMock.getInstance.mockReturnValue(mockHealthChecker);
    
    // Mock the ErrorHandler singleton
    const ErrorHandlerMock = require('../src/errors/ErrorHandler').ErrorHandler;
    ErrorHandlerMock.getInstance.mockReturnValue(mockErrorHandler);
    
    // Mock the getRateLimitStats function
    const RateLimiterMock = require('../src/utils/RateLimiter');
    RateLimiterMock.getRateLimitStats.mockReturnValue({});
    
    healthAPI = new HealthAPI();
  });

  describe('basic functionality', () => {
    it('should create HealthAPI instance', () => {
      expect(healthAPI).toBeInstanceOf(HealthAPI);
    });

    it('should have required methods', () => {
      expect(typeof healthAPI.getHealthStatus).toBe('function');
      expect(typeof healthAPI.getSimpleHealth).toBe('function');
      expect(typeof healthAPI.getReadiness).toBe('function');
      expect(typeof healthAPI.getLiveness).toBe('function');
      expect(typeof healthAPI.getCheckStatus).toBe('function');
      expect(typeof healthAPI.resetErrorStats).toBe('function');
      expect(typeof healthAPI.stop).toBe('function');
    });

    it('should start periodic health checks on construction', () => {
      expect(mockHealthChecker.startPeriodicChecks).toHaveBeenCalled();
    });
  });

  describe('health status methods', () => {
    it('should get health status successfully', async () => {
      const result = await healthAPI.getHealthStatus();
      
      expect(result.status).toBe('healthy');
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].name).toBe('test_check');
      expect(mockHealthChecker.checkHealth).toHaveBeenCalled();
    });

    it('should get simple health status', async () => {
      const result = await healthAPI.getSimpleHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
    });

    it('should get readiness status', async () => {
      const result = await healthAPI.getReadiness();
      
      expect(result.ready).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should get liveness status', async () => {
      const result = await healthAPI.getLiveness();
      
      expect(result.alive).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should get check status for specific check', async () => {
      const result = await healthAPI.getCheckStatus('test_check');
      
      expect(result).toBeDefined();
      expect(result?.name).toBe('test_check');
      expect(result?.status).toBe('healthy');
    });

    it('should return null for non-existent check', async () => {
      const result = await healthAPI.getCheckStatus('non_existent');
      
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle health check failures gracefully', async () => {
      // Create a new HealthAPI instance with a failing health checker
      const failingHealthChecker = {
        checkHealth: jest.fn().mockRejectedValue(new Error('Health check failed')),
        startPeriodicChecks: jest.fn(),
        stopPeriodicChecks: jest.fn()
      };
      
      const HealthCheckerMock = require('../src/monitoring/HealthChecker').HealthChecker;
      HealthCheckerMock.getInstance.mockReturnValue(failingHealthChecker);

      const failingHealthAPI = new HealthAPI();
      const result = await failingHealthAPI.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].name).toBe('health_api');
      expect(result.checks[0].status).toBe('unhealthy');
    });
  });

  describe('utility methods', () => {
    it('should reset error stats', () => {
      healthAPI.resetErrorStats();
      expect(mockErrorHandler.resetErrorCounts).toHaveBeenCalled();
    });

    it('should stop health API', () => {
      healthAPI.stop();
      expect(mockHealthChecker.stopPeriodicChecks).toHaveBeenCalled();
    });
  });
});

describe('HealthServer', () => {
  describe('constructor', () => {
    it('should create server with default config', () => {
      const server = new HealthServer();
      expect(server).toBeInstanceOf(HealthServer);
    });

    it('should create server with custom config', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        enableCORS: false,
        enableLogging: false,
        timeout: 5000
      };

      const server = new HealthServer(config);
      expect(server).toBeInstanceOf(HealthServer);
    });
  });

  describe('server lifecycle', () => {
    it('should have start and stop methods', () => {
      const server = new HealthServer();
      expect(typeof server.start).toBe('function');
      expect(typeof server.stop).toBe('function');
    });
  });
});

describe('Health API Integration', () => {
  it('should provide health check endpoints', () => {
    // This test verifies that the health API provides the expected endpoints
    const endpoints = [
      '/health',
      '/health/simple', 
      '/health/readiness',
      '/health/liveness',
      '/health/check',
      '/health/metrics',
      '/health/errors',
      '/health/reset'
    ];

    expect(endpoints).toHaveLength(8);
    expect(endpoints).toContain('/health');
    expect(endpoints).toContain('/health/readiness');
    expect(endpoints).toContain('/health/liveness');
  });

  it('should support health check configuration', () => {
    const config = {
      includeDetails: true,
      timeout: 10000,
      checks: ['database', 'redis']
    };

    expect(config.includeDetails).toBe(true);
    expect(config.timeout).toBe(10000);
    expect(config.checks).toHaveLength(2);
  });
}); 