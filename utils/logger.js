const config = require("./config");

class Logger {
  constructor() {
    this.isDevelopment = config.nodeEnv === "development";
    // Performance metrics storage
    this.metrics = {
      apiCalls: new Map(), // Store API call metrics
      errors: new Map(), // Store error counts by type
      performance: new Map(), // Store performance data
    };
  }

  info(message, data = null) {
    this.log("INFO", message, data);
  }

  warn(message, data = null) {
    this.log("WARN", message, data);
  }

  error(message, error = null) {
    const errorData = error
      ? {
          message: error.message,
          stack: error.stack,
          ...(error.code && { code: error.code }),
        }
      : null;
    this.log("ERROR", message, errorData);
  }

  debug(message, data = null) {
    if (this.isDevelopment) {
      this.log("DEBUG", message, data);
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };

    if (this.isDevelopment) {
      // Pretty print in development
      console.log(`[${timestamp}] ${level}: ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    } else {
      // JSON format for production
      console.log(JSON.stringify(logEntry));
    }
  }

  // Express middleware for request logging
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();

      res.on("finish", () => {
        const duration = Date.now() - start;
        const logData = {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          userAgent: req.get("User-Agent"),
          ip: req.ip || req.connection.remoteAddress,
        };

        if (res.statusCode >= 400) {
          this.warn(`${req.method} ${req.url} - ${res.statusCode}`, logData);
        } else {
          this.info(`${req.method} ${req.url} - ${res.statusCode}`, logData);
        }
      });

      next();
    };
  }

  // Performance metrics logging
  logApiCall(operation, duration, success = true, errorType = null) {
    const key = `contentstack_${operation}`;

    if (!this.metrics.apiCalls.has(key)) {
      this.metrics.apiCalls.set(key, {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        lastCall: null,
        errorTypes: new Map(),
      });
    }

    const metrics = this.metrics.apiCalls.get(key);
    metrics.totalCalls++;
    metrics.totalDuration += duration;
    metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.lastCall = new Date().toISOString();

    if (success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
      if (errorType) {
        const errorCount = metrics.errorTypes.get(errorType) || 0;
        metrics.errorTypes.set(errorType, errorCount + 1);
      }
    }

    // Log performance data
    this.debug(`API Call Performance: ${operation}`, {
      duration: `${duration}ms`,
      success,
      errorType,
      totalCalls: metrics.totalCalls,
      successRate: `${(
        (metrics.successfulCalls / metrics.totalCalls) *
        100
      ).toFixed(2)}%`,
      averageDuration: `${Math.round(metrics.averageDuration)}ms`,
    });
  }

  // Get performance metrics
  getMetrics() {
    const metricsData = {};

    for (const [operation, metrics] of this.metrics.apiCalls) {
      metricsData[operation] = {
        totalCalls: metrics.totalCalls,
        successfulCalls: metrics.successfulCalls,
        failedCalls: metrics.failedCalls,
        successRate:
          metrics.totalCalls > 0
            ? ((metrics.successfulCalls / metrics.totalCalls) * 100).toFixed(
                2
              ) + "%"
            : "0%",
        averageDuration: Math.round(metrics.averageDuration) + "ms",
        minDuration:
          metrics.minDuration === Infinity ? 0 : metrics.minDuration + "ms",
        maxDuration: metrics.maxDuration + "ms",
        lastCall: metrics.lastCall,
        errorTypes: Object.fromEntries(metrics.errorTypes),
      };
    }

    return metricsData;
  }

  // Clear metrics (useful for testing or periodic resets)
  clearMetrics() {
    this.metrics.apiCalls.clear();
    this.metrics.errors.clear();
    this.metrics.performance.clear();
    this.info("Performance metrics cleared");
  }

  // Log error with categorization
  logError(operation, error, category = "unknown") {
    const errorKey = `${operation}_${category}`;
    const currentCount = this.metrics.errors.get(errorKey) || 0;
    this.metrics.errors.set(errorKey, currentCount + 1);

    this.error(`${operation} failed [${category}]`, {
      error: error.message,
      category,
      totalErrorsOfThisType: currentCount + 1,
      stack: this.isDevelopment ? error.stack : undefined,
    });
  }

  // Get error statistics
  getErrorStats() {
    const errorStats = {};
    for (const [errorKey, count] of this.metrics.errors) {
      errorStats[errorKey] = count;
    }
    return errorStats;
  }
}

module.exports = new Logger();
