const logger = require("./logger");
const config = require("./config");

/**
 * ContentStack health check utility
 */
class ContentStackHealthCheck {
  constructor() {
    this.lastHealthCheck = null;
    this.healthStatus = {
      status: "unknown",
      lastCheck: null,
      lastSuccessfulCall: null,
      consecutiveFailures: 0,
      totalChecks: 0,
      successfulChecks: 0,
      averageResponseTime: 0,
      errors: [],
    };
  }

  /**
   * Perform a comprehensive health check of ContentStack connectivity
   * @param {Object} contentstackService - The ContentStack service instance
   */
  async performHealthCheck(contentstackService) {
    const startTime = Date.now();
    const checkId = `health_check_${Date.now()}`;

    logger.info("Starting ContentStack health check", { checkId });

    try {
      this.healthStatus.totalChecks++;
      this.healthStatus.lastCheck = new Date().toISOString();

      // Test 1: Basic connectivity - fetch content types
      logger.debug("Health check: Testing basic connectivity");
      const contentTypes = await this.testBasicConnectivity(
        contentstackService
      );

      // Test 2: API response time
      logger.debug("Health check: Testing API response time");
      const responseTime = Date.now() - startTime;

      // Test 3: Configuration validation
      logger.debug("Health check: Validating configuration");
      const configStatus = this.validateConfiguration();

      // Test 4: Sample content fetch
      logger.debug("Health check: Testing sample content fetch");
      const sampleContentStatus = await this.testSampleContentFetch(
        contentstackService,
        contentTypes
      );

      // Calculate health metrics
      this.updateHealthMetrics(responseTime, true);

      const healthResult = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        checks: {
          connectivity: {
            status: "pass",
            contentTypesFound: contentTypes.length,
          },
          configuration: configStatus,
          sampleContent: sampleContentStatus,
          responseTime: {
            status: responseTime < 5000 ? "pass" : "warn",
            value: `${responseTime}ms`,
            threshold: "5000ms",
          },
        },
        metrics: this.getHealthMetrics(),
        sdkInfo: this.getSDKInfo(),
      };

      logger.info("ContentStack health check completed successfully", {
        checkId,
        duration: `${responseTime}ms`,
        status: "healthy",
      });

      return healthResult;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateHealthMetrics(responseTime, false, error);

      const healthResult = {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        error: {
          message: error.message,
          type: error.constructor.name,
          category: this.categorizeHealthError(error),
        },
        checks: {
          connectivity: { status: "fail", error: error.message },
          configuration: this.validateConfiguration(),
        },
        metrics: this.getHealthMetrics(),
        sdkInfo: this.getSDKInfo(),
      };

      logger.error("ContentStack health check failed", {
        checkId,
        duration: `${responseTime}ms`,
        error: error.message,
        errorType: error.constructor.name,
      });

      return healthResult;
    }
  }

  /**
   * Test basic ContentStack connectivity
   */
  async testBasicConnectivity(contentstackService) {
    try {
      const contentTypes = await contentstackService.getContentTypes();
      if (!Array.isArray(contentTypes)) {
        throw new Error(
          "Invalid response format: expected array of content types. Check ContentStack SDK configuration and API response format."
        );
      }
      return contentTypes;
    } catch (error) {
      // Provide more actionable error messages based on error type
      let actionableMessage = error.message;

      if (
        error.message.includes("401") ||
        error.message.includes("Unauthorized")
      ) {
        actionableMessage =
          "Authentication failed: Check CONTENTSTACK_API_KEY and CONTENTSTACK_DELIVERY_TOKEN in your .env file. Verify tokens are valid in ContentStack dashboard.";
      } else if (
        error.message.includes("403") ||
        error.message.includes("Forbidden")
      ) {
        actionableMessage =
          "Access forbidden: Verify delivery token permissions and environment access in ContentStack dashboard.";
      } else if (
        error.message.includes("timeout") ||
        error.message.includes("ETIMEDOUT")
      ) {
        actionableMessage =
          "Request timeout: Check network connectivity and consider increasing CONTENTSTACK_TIMEOUT. Verify CONTENTSTACK_REGION is correct.";
      } else if (error.message.includes("ENOTFOUND")) {
        actionableMessage =
          "DNS resolution failed: Verify CONTENTSTACK_REGION setting. Valid regions: us, eu, azure-na, azure-eu, gcp-na.";
      } else if (error.message.includes("Cannot call a class as a function")) {
        actionableMessage =
          "ContentStack SDK error: This indicates an SDK version compatibility issue. Check that ContentStack SDK is properly installed and initialized.";
      }

      throw new Error(`Connectivity test failed: ${actionableMessage}`);
    }
  }

  /**
   * Test sample content fetch
   */
  async testSampleContentFetch(contentstackService, contentTypes) {
    if (!contentTypes || contentTypes.length === 0) {
      return {
        status: "skip",
        reason: "No content types available for testing",
      };
    }

    try {
      // Try to fetch a small sample from the first content type
      const sampleContentType = contentTypes[0];
      const result = await contentstackService.getEntriesByContentType(
        sampleContentType.uid,
        "en-us",
        1, // Just fetch 1 entry
        0
      );

      return {
        status: "pass",
        contentType: sampleContentType.uid,
        entriesFound: result.entries ? result.entries.length : 0,
        totalCount: result.count || 0,
      };
    } catch (error) {
      return {
        status: "warn",
        error: error.message,
        reason: "Sample content fetch failed but basic connectivity works",
      };
    }
  }

  /**
   * Validate ContentStack configuration
   */
  validateConfiguration() {
    const checks = {
      apiKey: !!config.contentstack.apiKey,
      deliveryToken: !!config.contentstack.deliveryToken,
      environment: !!config.contentstack.environment,
      region: !!config.contentstack.region,
      timeout: typeof config.contentstack.timeout === "number",
      retryLimit: typeof config.contentstack.retryLimit === "number",
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const missingConfig = Object.keys(checks).filter((key) => !checks[key]);

    // Provide actionable guidance for missing configuration
    const configGuidance = {};
    missingConfig.forEach((key) => {
      switch (key) {
        case "apiKey":
          configGuidance[key] =
            "Set CONTENTSTACK_API_KEY in .env file from ContentStack dashboard > Settings > Stack Settings > API Keys";
          break;
        case "deliveryToken":
          configGuidance[key] =
            "Set CONTENTSTACK_DELIVERY_TOKEN in .env file from ContentStack dashboard > Settings > Tokens > Delivery Tokens";
          break;
        case "environment":
          configGuidance[key] =
            "Set CONTENTSTACK_ENVIRONMENT in .env file to match your ContentStack environment name";
          break;
        case "region":
          configGuidance[key] =
            "Set CONTENTSTACK_REGION in .env file (us, eu, azure-na, azure-eu, gcp-na)";
          break;
        case "timeout":
          configGuidance[key] =
            "Set CONTENTSTACK_TIMEOUT in .env file (recommended: 30000ms)";
          break;
        case "retryLimit":
          configGuidance[key] =
            "Set CONTENTSTACK_RETRY_LIMIT in .env file (recommended: 3)";
          break;
      }
    });

    return {
      status: passedChecks === totalChecks ? "pass" : "warn",
      passed: passedChecks,
      total: totalChecks,
      details: checks,
      missingConfig,
      guidance: configGuidance,
      message:
        missingConfig.length > 0
          ? `Missing ${missingConfig.length} configuration value(s). Check your .env file.`
          : "All configuration values are present",
    };
  }

  /**
   * Update health metrics
   */
  updateHealthMetrics(responseTime, success, error = null) {
    if (success) {
      this.healthStatus.successfulChecks++;
      this.healthStatus.consecutiveFailures = 0;
      this.healthStatus.lastSuccessfulCall = new Date().toISOString();
    } else {
      this.healthStatus.consecutiveFailures++;
      if (error) {
        this.healthStatus.errors.push({
          timestamp: new Date().toISOString(),
          message: error.message,
          type: error.constructor.name,
        });
        // Keep only last 10 errors
        if (this.healthStatus.errors.length > 10) {
          this.healthStatus.errors = this.healthStatus.errors.slice(-10);
        }
      }
    }

    // Update average response time
    const totalResponseTime =
      this.healthStatus.averageResponseTime *
        (this.healthStatus.totalChecks - 1) +
      responseTime;
    this.healthStatus.averageResponseTime = Math.round(
      totalResponseTime / this.healthStatus.totalChecks
    );

    // Update overall status
    if (this.healthStatus.consecutiveFailures >= 3) {
      this.healthStatus.status = "critical";
    } else if (this.healthStatus.consecutiveFailures > 0) {
      this.healthStatus.status = "degraded";
    } else {
      this.healthStatus.status = "healthy";
    }
  }

  /**
   * Categorize health check errors for better troubleshooting
   */
  categorizeHealthError(error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("401") ||
      message.includes("unauthorized") ||
      message.includes("authentication")
    ) {
      return "AUTHENTICATION";
    } else if (
      message.includes("403") ||
      message.includes("forbidden") ||
      message.includes("permission")
    ) {
      return "AUTHORIZATION";
    } else if (message.includes("timeout") || message.includes("etimedout")) {
      return "TIMEOUT";
    } else if (message.includes("enotfound") || message.includes("dns")) {
      return "DNS_RESOLUTION";
    } else if (
      message.includes("econnreset") ||
      message.includes("econnrefused")
    ) {
      return "CONNECTION";
    } else if (message.includes("429") || message.includes("rate limit")) {
      return "RATE_LIMIT";
    } else if (message.includes("500") || message.includes("internal server")) {
      return "SERVER_ERROR";
    } else if (
      message.includes("cannot call a class as a function") ||
      message.includes("sdk")
    ) {
      return "SDK_ERROR";
    } else if (message.includes("404") || message.includes("not found")) {
      return "NOT_FOUND";
    } else {
      return "UNKNOWN";
    }
  }

  /**
   * Get health metrics summary
   */
  getHealthMetrics() {
    const successRate =
      this.healthStatus.totalChecks > 0
        ? (
            (this.healthStatus.successfulChecks /
              this.healthStatus.totalChecks) *
            100
          ).toFixed(2) + "%"
        : "0%";

    return {
      status: this.healthStatus.status,
      totalChecks: this.healthStatus.totalChecks,
      successfulChecks: this.healthStatus.successfulChecks,
      successRate,
      consecutiveFailures: this.healthStatus.consecutiveFailures,
      averageResponseTime: `${this.healthStatus.averageResponseTime}ms`,
      lastCheck: this.healthStatus.lastCheck,
      lastSuccessfulCall: this.healthStatus.lastSuccessfulCall,
      recentErrors: this.healthStatus.errors.slice(-5), // Last 5 errors
    };
  }

  /**
   * Get SDK information
   */
  getSDKInfo() {
    try {
      const contentstackPackage = require("contentstack/package.json");
      return {
        version: contentstackPackage.version,
        name: contentstackPackage.name,
      };
    } catch (error) {
      return {
        version: "unknown",
        name: "contentstack",
        error: "Could not read package info",
      };
    }
  }

  /**
   * Categorize health check errors
   */
  categorizeHealthError(error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("authentication") ||
      message.includes("unauthorized") ||
      message.includes("401")
    ) {
      return "authentication";
    }
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("enotfound")
    ) {
      return "network";
    }
    if (message.includes("rate limit") || message.includes("429")) {
      return "rate_limit";
    }
    if (message.includes("configuration") || message.includes("missing")) {
      return "configuration";
    }
    if (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503")
    ) {
      return "server_error";
    }

    return "unknown";
  }

  /**
   * Reset health status (useful for testing)
   */
  resetHealthStatus() {
    this.healthStatus = {
      status: "unknown",
      lastCheck: null,
      lastSuccessfulCall: null,
      consecutiveFailures: 0,
      totalChecks: 0,
      successfulChecks: 0,
      averageResponseTime: 0,
      errors: [],
    };
    logger.info("ContentStack health status reset");
  }

  /**
   * Get quick health status
   */
  getQuickStatus() {
    return {
      status: this.healthStatus.status,
      lastCheck: this.healthStatus.lastCheck,
      consecutiveFailures: this.healthStatus.consecutiveFailures,
      averageResponseTime: `${this.healthStatus.averageResponseTime}ms`,
    };
  }
}

module.exports = new ContentStackHealthCheck();
