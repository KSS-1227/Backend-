const logger = require("./logger");

/**
 * Utility function for retry logic with exponential backoff
 * @param {Function} operation - The async operation to retry
 * @param {Object} options - Retry configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 30000)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried
 * @returns {Promise} - Result of the operation
 */
async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = isRetryableError,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await operation();

      // Log successful retry if this wasn't the first attempt
      if (attempt > 1) {
        logger.info(
          `Operation succeeded on attempt ${attempt}/${maxRetries + 1}`
        );
      }

      return result;
    } catch (error) {
      lastError = error;

      // If this is the last attempt or error is not retryable, throw the error
      if (attempt > maxRetries || !shouldRetry(error)) {
        if (attempt > maxRetries) {
          logger.error(`Operation failed after ${maxRetries} retries`, {
            error: error.message,
            attempts: attempt - 1,
          });
        } else {
          logger.error("Operation failed with non-retryable error", {
            error: error.message,
            errorType: categorizeError(error),
          });
        }
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelay
      );

      logger.warn(
        `Operation failed on attempt ${attempt}/${
          maxRetries + 1
        }, retrying in ${Math.round(delay)}ms`,
        {
          error: error.message,
          errorType: categorizeError(error),
          nextRetryIn: Math.round(delay),
        }
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Determines if an error should be retried based on error type and characteristics
 * @param {Error} error - The error to evaluate
 * @returns {boolean} - True if the error should be retried
 */
function isRetryableError(error) {
  const errorType = categorizeError(error);

  // Network and timeout errors are generally retryable
  if (errorType === "NETWORK" || errorType === "TIMEOUT") {
    return true;
  }

  // Rate limiting errors should be retried
  if (errorType === "RATE_LIMIT") {
    return true;
  }

  // Server errors (5xx) are generally retryable
  if (errorType === "SERVER_ERROR") {
    return true;
  }

  // Check for specific HTTP status codes that are retryable
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    // Retry on 429 (Too Many Requests), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout)
    if ([429, 502, 503, 504].includes(status)) {
      return true;
    }
  }

  // Check for specific error messages that indicate transient issues
  const errorMessage = (error.message || "").toLowerCase();
  const transientMessages = [
    "timeout",
    "connection reset",
    "connection refused",
    "network error",
    "socket hang up",
    "econnreset",
    "enotfound",
    "etimedout",
    "service unavailable",
    "bad gateway",
    "gateway timeout",
  ];

  if (transientMessages.some((msg) => errorMessage.includes(msg))) {
    return true;
  }

  // Don't retry client errors (4xx except 429), authentication errors, or validation errors
  return false;
}

/**
 * Categorizes errors into different types for better handling and logging
 * @param {Error} error - The error to categorize
 * @returns {string} - The error category
 */
function categorizeError(error) {
  // Check for ContentStack specific errors first
  if (error.error_code || error.error_message) {
    if (error.status === 401 || error.error_code === "UNAUTHORIZED") {
      return "AUTHENTICATION";
    }
    if (error.status === 403 || error.error_code === "FORBIDDEN") {
      return "AUTHORIZATION";
    }
    if (error.status === 429 || error.error_code === "RATE_LIMIT_EXCEEDED") {
      return "RATE_LIMIT";
    }
    if (error.status >= 500) {
      return "SERVER_ERROR";
    }
    if (error.status >= 400 && error.status < 500) {
      return "CLIENT_ERROR";
    }
  }

  // Check HTTP status codes
  const status = error.status || error.statusCode;
  if (status) {
    if (status === 401) return "AUTHENTICATION";
    if (status === 403) return "AUTHORIZATION";
    if (status === 404) return "NOT_FOUND";
    if (status === 429) return "RATE_LIMIT";
    if (status >= 500) return "SERVER_ERROR";
    if (status >= 400) return "CLIENT_ERROR";
  }

  // Check error message for common patterns
  const errorMessage = (error.message || "").toLowerCase();

  if (errorMessage.includes("timeout") || errorMessage.includes("etimedout")) {
    return "TIMEOUT";
  }

  if (
    errorMessage.includes("network") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("econnreset") ||
    errorMessage.includes("enotfound") ||
    errorMessage.includes("socket hang up")
  ) {
    return "NETWORK";
  }

  if (
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("authentication")
  ) {
    return "AUTHENTICATION";
  }

  if (
    errorMessage.includes("forbidden") ||
    errorMessage.includes("permission")
  ) {
    return "AUTHORIZATION";
  }

  if (errorMessage.includes("not found")) {
    return "NOT_FOUND";
  }

  if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
    return "VALIDATION";
  }

  if (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("too many requests")
  ) {
    return "RATE_LIMIT";
  }

  // Default to unknown for uncategorized errors
  return "UNKNOWN";
}

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the specified time
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  withRetry,
  isRetryableError,
  categorizeError,
  sleep,
};
