import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique correlation ID
 */
export const generateCorrelationId = (): string => {
  return `corr_${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
};

/**
 * Generate a unique request ID
 */
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
};

/**
 * Generate a unique session ID
 */
export const generateSessionId = (): string => {
  return `sess_${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
};

/**
 * Generate a unique trace ID
 */
export const generateTraceId = (): string => {
  return `trace_${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
};

/**
 * Generate a unique span ID
 */
export const generateSpanId = (): string => {
  return `span_${Date.now()}_${uuidv4().replace(/-/g, '').substring(0, 8)}`;
};

/**
 * Format duration in milliseconds to human readable format
 */
export const formatDuration = (durationMs: number): string => {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(2);
    return `${minutes}m ${seconds}s`;
  }
};

/**
 * Format bytes to human readable format
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return (value / total) * 100;
};

/**
 * Calculate moving average
 */
export const calculateMovingAverage = (values: number[], window: number): number => {
  if (values.length === 0) return 0;
  if (values.length < window) {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  const recentValues = values.slice(-window);
  return recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
};

/**
 * Calculate percentile
 */
export const calculatePercentile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;
  
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[index];
};

/**
 * Sanitize sensitive data from objects
 */
export const sanitizeData = (data: any, sensitiveKeys: string[] = ['password', 'token', 'key', 'secret']): any => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, sensitiveKeys));
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveKeys.some(sensitiveKey => 
      key.toLowerCase().includes(sensitiveKey.toLowerCase())
    )) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value, sensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Extract IP address from various sources
 */
export const extractIpAddress = (headers: Record<string, string>): string => {
  // Check common headers for IP address
  const ipHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ];
  
  for (const header of ipHeaders) {
    const value = headers[header];
    if (value) {
      // Handle comma-separated IPs (take the first one)
      const firstIp = value.split(',')[0].trim();
      if (firstIp && isValidIpAddress(firstIp)) {
        return firstIp;
      }
    }
  }
  
  return 'unknown';
};

/**
 * Validate IP address format
 */
export const isValidIpAddress = (ip: string): boolean => {
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
};

/**
 * Get current timestamp in ISO format
 */
export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Get current timestamp in milliseconds
 */
export const getCurrentTimestampMs = (): number => {
  return Date.now();
};

/**
 * Parse correlation context from headers
 */
export const parseCorrelationContext = (headers: Record<string, string>): {
  correlationId?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
} => {
  return {
    correlationId: headers['x-correlation-id'] || headers['correlation-id'],
    requestId: headers['x-request-id'] || headers['request-id'],
    sessionId: headers['x-session-id'] || headers['session-id'],
    userId: headers['x-user-id'] || headers['user-id']
  };
};

/**
 * Create correlation headers
 */
export const createCorrelationHeaders = (context: {
  correlationId?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
}): Record<string, string> => {
  const headers: Record<string, string> = {};
  
  if (context.correlationId) {
    headers['x-correlation-id'] = context.correlationId;
  }
  if (context.requestId) {
    headers['x-request-id'] = context.requestId;
  }
  if (context.sessionId) {
    headers['x-session-id'] = context.sessionId;
  }
  if (context.userId) {
    headers['x-user-id'] = context.userId;
  }
  
  return headers;
};

/**
 * Debounce function for performance monitoring
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle function for rate limiting
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}; 