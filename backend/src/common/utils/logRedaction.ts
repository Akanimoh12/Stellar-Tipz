/**
 * Utilities for redacting personally identifiable information (PII) from logs.
 * 
 * This module implements the logging security policy documented in SECURITY.md.
 * All functions here should be used consistently across the application to ensure
 * sensitive data is not exposed in structured logs.
 */

/**
 * Truncates Stellar addresses to show only first/last 4 characters for logging.
 * 
 * Policy: Stellar addresses are truncated to prevent full address exposure while
 * maintaining enough information for debugging correlation.
 * 
 * @param address - The Stellar address to truncate
 * @returns Truncated address in format "GXXX...XXXX" or original if not a valid address
 */
export function truncateStellarAddress(address: string | undefined | null): string | undefined {
  if (!address || typeof address !== 'string') {
    return undefined;
  }

  // Stellar addresses are typically 56 characters starting with G
  if (address.length === 56 && address.startsWith('G')) {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  // For other formats, still truncate for safety
  if (address.length > 8) {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  return address;
}

/**
 * Truncates email addresses to show only domain for logging.
 * 
 * Policy: Email addresses are truncated to show only the domain portion
 * to prevent PII exposure while maintaining useful debugging information.
 * 
 * @param email - The email address to truncate
 * @returns Domain portion only (e.g., "***@example.com")
 */
export function truncateEmail(email: string | undefined | null): string | undefined {
  if (!email || typeof email !== 'string') {
    return undefined;
  }

  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    return '***@unknown';
  }

  return `***${email.slice(atIndex)}`;
}

/**
 * Truncates message content for logging while preserving length information.
 * 
 * Policy: Message content is truncated to prevent logging of potentially sensitive
 * user communications while preserving metadata useful for debugging.
 * 
 * @param message - The message to truncate
 * @returns Truncated message with length info
 */
export function truncateMessage(message: string | undefined | null): string | undefined {
  if (!message || typeof message !== 'string') {
    return undefined;
  }

  // Log only first 50 characters and indicate full length
  if (message.length > 50) {
    return `${message.slice(0, 50)}... (total: ${message.length} chars)`;
  }

  return message;
}

/**
 * Sanitizes an object by removing or redacting sensitive fields.
 * 
 * This is a general-purpose function for cleaning objects before logging.
 * 
 * @param obj - Object to sanitize
 * @returns Sanitized object with sensitive fields redacted
 */
export function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'password', 'token', 'accessToken', 'refreshToken', 'apiKey', 
    'privateKey', 'secret', 'authorization', 'cookie', 'signature'
  ];

  const sanitized = { ...obj };

  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      sanitized[key] = '[REDACTED]';
    }
  }

  // Handle nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    }
  }

  return sanitized;
}