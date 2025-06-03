import { Logger } from '../src/utils/logger';

describe('Logger', () => {
    let logger: Logger;
    const originalConsole = { ...console };

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Mock console methods
        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();
        console.debug = jest.fn();
        
        // Get logger instance
        logger = Logger.getInstance();
    });

    afterEach(() => {
        // Restore console methods
        console = { ...originalConsole };
    });

    describe('getInstance', () => {
        it('should return the same instance on multiple calls', () => {
            const instance1 = Logger.getInstance();
            const instance2 = Logger.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    describe('info', () => {
        it('should log info message', () => {
            const message = 'Test info message';
            const data = { key: 'value' };
            
            logger.info(message, data);
            
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('INFO'),
                expect.stringContaining(message),
                data
            );
        });

        it('should log info message without data', () => {
            const message = 'Test info message';
            
            logger.info(message);
            
            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('INFO'),
                expect.stringContaining(message)
            );
        });
    });

    describe('error', () => {
        it('should log error message', () => {
            const message = 'Test error message';
            const error = new Error('Test error');
            
            logger.error(message, error);
            
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR'),
                expect.stringContaining(message),
                error
            );
        });

        it('should log error message without error object', () => {
            const message = 'Test error message';
            
            logger.error(message);
            
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('ERROR'),
                expect.stringContaining(message)
            );
        });
    });

    describe('warn', () => {
        it('should log warning message', () => {
            const message = 'Test warning message';
            const data = { key: 'value' };
            
            logger.warn(message, data);
            
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('WARN'),
                expect.stringContaining(message),
                data
            );
        });

        it('should log warning message without data', () => {
            const message = 'Test warning message';
            
            logger.warn(message);
            
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('WARN'),
                expect.stringContaining(message)
            );
        });
    });

    describe('debug', () => {
        it('should log debug message', () => {
            const message = 'Test debug message';
            const data = { key: 'value' };
            
            logger.debug(message, data);
            
            expect(console.debug).toHaveBeenCalledWith(
                expect.stringContaining('DEBUG'),
                expect.stringContaining(message),
                data
            );
        });

        it('should log debug message without data', () => {
            const message = 'Test debug message';
            
            logger.debug(message);
            
            expect(console.debug).toHaveBeenCalledWith(
                expect.stringContaining('DEBUG'),
                expect.stringContaining(message)
            );
        });
    });

    describe('log format', () => {
        it('should include timestamp in log messages', () => {
            const message = 'Test message';
            
            logger.info(message);
            
            expect(console.log).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/),
                expect.any(String),
                expect.any(String)
            );
        });

        it('should include log level in log messages', () => {
            const message = 'Test message';
            
            logger.info(message);
            logger.error(message);
            logger.warn(message);
            logger.debug(message);
            
            expect(console.log).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('INFO'),
                expect.any(String)
            );
            
            expect(console.error).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('ERROR'),
                expect.any(String)
            );
            
            expect(console.warn).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('WARN'),
                expect.any(String)
            );
            
            expect(console.debug).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('DEBUG'),
                expect.any(String)
            );
        });
    });
}); 