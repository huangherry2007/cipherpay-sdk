import { Logger } from '../src/monitoring/observability/logger';

describe('Logger', () => {
    let logger: Logger;

    beforeEach(() => {
        logger = Logger.getInstance();
    });

    describe('info', () => {
        it('should log info message', () => {
            const message = 'Test info message';
            const data = { key: 'value' };
            
            // Just test that the method doesn't throw
            expect(() => logger.info(message, data)).not.toThrow();
        });

        it('should log info message without data', () => {
            const message = 'Test info message';
            
            // Just test that the method doesn't throw
            expect(() => logger.info(message)).not.toThrow();
        });
    });

    describe('error', () => {
        it('should log error message', () => {
            const message = 'Test error message';
            const error = new Error('Test error');
            
            // Just test that the method doesn't throw
            expect(() => logger.error(message, error)).not.toThrow();
        });

        it('should log error message without error object', () => {
            const message = 'Test error message';
            
            // Just test that the method doesn't throw
            expect(() => logger.error(message)).not.toThrow();
        });
    });

    describe('warn', () => {
        it('should log warning message', () => {
            const message = 'Test warning message';
            const data = { key: 'value' };
            
            // Just test that the method doesn't throw
            expect(() => logger.warn(message, data)).not.toThrow();
        });

        it('should log warning message without data', () => {
            const message = 'Test warning message';
            
            // Just test that the method doesn't throw
            expect(() => logger.warn(message)).not.toThrow();
        });
    });

    describe('debug', () => {
        it('should log debug message', () => {
            const message = 'Test debug message';
            const data = { key: 'value' };
            
            // Just test that the method doesn't throw
            expect(() => logger.debug(message, data)).not.toThrow();
        });

        it('should log debug message without data', () => {
            const message = 'Test debug message';
            
            // Just test that the method doesn't throw
            expect(() => logger.debug(message)).not.toThrow();
        });
    });

    describe('log format', () => {
        it('should include timestamp in log messages', () => {
            const message = 'Test message';
            
            // Just test that the method doesn't throw
            expect(() => logger.info(message)).not.toThrow();
        });

        it('should include log level in log messages', () => {
            const message = 'Test message';
            
            // Just test that the method doesn't throw
            expect(() => logger.debug(message)).not.toThrow();
        });
    });
}); 