const logger = require("./logger");

/**
 * Performance monitoring utility for ContentStack operations
 */
class PerformanceMonitor {
  constructor() {
    this.activeOperations = new Map();
  }

  /**
   * Start timing an operation
   * @param {string} operationId - Unique identifier for the operation
   * @param {string} operationType - Type of operation (e.g., 'getContentTypes', 'getEntries')
   * @param {Object} metadata - Additional metadata about the operation
   */
  startOperation(operationId, operationType, metadata = {}) {
    const startTime = Date.now();
    this.activeOperations.set(operationId, {
      type: operationType,
      startTime,
      metadata,
    });

    logger.debug(`Started operation: ${operationType}`, {
      operationId,
      metadata,
      timestamp: new Date(startTime).toISOString(),
    });

    return operationId;
  }

  /**
   * End timing an operation and log performance metrics
   * @param {string} operationId - The operation identifier
   * @param {boolean} success - Whether the operation was successful
   * @param {string} errorType - Type of error if operation failed
   * @param {Object} result - Operation result metadata
   */
  endOperation(operationId, success = true, errorType = null, result = {}) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn(`Attempted to end unknown operation: ${operationId}`);
      return;
    }

    const endTime = Date.now();
    const duration = endTime - operation.startTime;

    // Log to performance metrics
    logger.logApiCall(operation.type, duration, success, errorType);

    // Log detailed operation completion
    logger.info(`Completed operation: ${operation.type}`, {
      operationId,
      duration: `${duration}ms`,
      success,
      errorType,
      metadata: operation.metadata,
      result,
      timestamp: new Date(endTime).toISOString(),
    });

    // Clean up
    this.activeOperations.delete(operationId);

    return duration;
  }

  /**
   * Wrapper function to automatically time async operations
   * @param {string} operationType - Type of operation
   * @param {Function} operation - Async function to execute
   * @param {Object} metadata - Additional metadata
   */
  async timeOperation(operationType, operation, metadata = {}) {
    const operationId = `${operationType}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    this.startOperation(operationId, operationType, metadata);

    try {
      const result = await operation();
      this.endOperation(operationId, true, null, {
        resultType: typeof result,
        resultLength: Array.isArray(result) ? result.length : undefined,
      });
      return result;
    } catch (error) {
      const errorType = error.name || error.constructor.name || "UnknownError";
      this.endOperation(operationId, false, errorType, {
        errorMessage: error.message,
      });
      throw error;
    }
  }

  /**
   * Get currently active operations
   */
  getActiveOperations() {
    const active = {};
    for (const [id, operation] of this.activeOperations) {
      active[id] = {
        type: operation.type,
        duration: `${Date.now() - operation.startTime}ms`,
        metadata: operation.metadata,
        startTime: new Date(operation.startTime).toISOString(),
      };
    }
    return active;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    return {
      activeOperations: this.getActiveOperations(),
      metrics: logger.getMetrics(),
      errorStats: logger.getErrorStats(),
    };
  }
}

module.exports = new PerformanceMonitor();
