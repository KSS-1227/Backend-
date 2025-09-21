const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const performanceMonitor = require("../utils/performance");
const contentstackHealth = require("../utils/contentstack-health");
const contentstackService = require("../services/contentstack");

/**
 * Basic health check endpoint
 */
router.get("/", (req, res) => {
  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    };

    logger.debug("Basic health check requested", {
      uptime: `${Math.round(healthData.uptime)}s`,
      memoryUsage: `${Math.round(healthData.memory.heapUsed / 1024 / 1024)}MB`,
    });

    res.json(healthData);
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * ContentStack health check endpoint
 */
router.get("/contentstack", async (req, res) => {
  try {
    logger.info("ContentStack health check requested");

    const healthResult = await contentstackHealth.performHealthCheck(
      contentstackService
    );

    const statusCode =
      healthResult.status === "healthy"
        ? 200
        : healthResult.status === "unhealthy"
        ? 503
        : 200;

    res.status(statusCode).json(healthResult);
  } catch (error) {
    logger.error("ContentStack health check failed:", error);

    // Provide actionable error messages based on error type
    let actionableMessage = error.message;
    let troubleshootingSteps = [];

    if (
      error.message.includes("401") ||
      error.message.includes("Unauthorized")
    ) {
      actionableMessage =
        "ContentStack authentication failed - invalid API credentials";
      troubleshootingSteps = [
        "Verify CONTENTSTACK_API_KEY in your .env file",
        "Verify CONTENTSTACK_DELIVERY_TOKEN in your .env file",
        "Check that tokens are not expired in ContentStack dashboard",
        "Ensure environment matches CONTENTSTACK_ENVIRONMENT setting",
      ];
    } else if (
      error.message.includes("403") ||
      error.message.includes("Forbidden")
    ) {
      actionableMessage =
        "ContentStack access forbidden - insufficient permissions";
      troubleshootingSteps = [
        "Check delivery token permissions in ContentStack dashboard",
        "Verify environment access permissions",
        "Ensure API key has proper scope for the environment",
      ];
    } else if (
      error.message.includes("timeout") ||
      error.message.includes("ETIMEDOUT")
    ) {
      actionableMessage =
        "ContentStack API timeout - service may be slow or unreachable";
      troubleshootingSteps = [
        "Check your internet connection",
        "Verify CONTENTSTACK_REGION is correct for your stack",
        "Consider increasing CONTENTSTACK_TIMEOUT in .env file",
        "Check ContentStack status page for service issues",
      ];
    } else if (
      error.message.includes("ENOTFOUND") ||
      error.message.includes("DNS")
    ) {
      actionableMessage =
        "ContentStack DNS resolution failed - check region/host settings";
      troubleshootingSteps = [
        "Verify CONTENTSTACK_REGION is correct (us, eu, azure-na, azure-eu, gcp-na)",
        "Check CONTENTSTACK_HOST if using custom host",
        "Verify network connectivity to ContentStack servers",
      ];
    }

    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: {
        message: actionableMessage,
        originalMessage: error.message,
        type: error.constructor.name,
        troubleshooting:
          troubleshootingSteps.length > 0
            ? troubleshootingSteps
            : [
                "Check your .env file configuration",
                "Verify ContentStack dashboard settings",
                "Review application logs for more details",
              ],
      },
      checks: {
        connectivity: {
          status: "fail",
          error: actionableMessage,
          help: "Visit /api/health/contentstack/monitor for detailed diagnostics",
        },
      },
    });
  }
});

/**
 * ContentStack performance metrics endpoint
 */
router.get("/contentstack/metrics", (req, res) => {
  try {
    logger.debug("ContentStack metrics requested");

    const metrics = performanceMonitor.getPerformanceSummary();
    const quickHealth = contentstackHealth.getQuickStatus();

    const response = {
      timestamp: new Date().toISOString(),
      health: quickHealth,
      performance: metrics,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error("Failed to get ContentStack metrics:", error);
    res.status(500).json({
      error: "Failed to retrieve metrics",
      timestamp: new Date().toISOString(),
      message: error.message,
    });
  }
});

/**
 * ContentStack detailed monitoring endpoint
 */
router.get("/contentstack/monitor", async (req, res) => {
  try {
    logger.info("ContentStack detailed monitoring requested");

    // Get comprehensive monitoring data
    const [healthResult, performanceMetrics, contentStats] =
      await Promise.allSettled([
        contentstackHealth.performHealthCheck(contentstackService),
        Promise.resolve(performanceMonitor.getPerformanceSummary()),
        contentstackService.getContentStats().catch((error) => ({
          error: error.message,
          timestamp: new Date().toISOString(),
        })),
      ]);

    const response = {
      timestamp: new Date().toISOString(),
      health:
        healthResult.status === "fulfilled"
          ? healthResult.value
          : {
              status: "error",
              error: healthResult.reason?.message || "Health check failed",
            },
      performance:
        performanceMetrics.status === "fulfilled"
          ? performanceMetrics.value
          : {
              error:
                performanceMetrics.reason?.message ||
                "Performance metrics unavailable",
            },
      contentStats:
        contentStats.status === "fulfilled"
          ? contentStats.value
          : {
              error:
                contentStats.reason?.message || "Content stats unavailable",
            },
      system: {
        uptime: `${Math.round(process.uptime())}s`,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(
            process.memoryUsage().heapTotal / 1024 / 1024
          )}MB`,
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    // Determine overall status
    const overallStatus =
      response.health.status === "healthy"
        ? "healthy"
        : response.health.status === "unhealthy"
        ? "unhealthy"
        : "degraded";

    const statusCode =
      overallStatus === "healthy"
        ? 200
        : overallStatus === "unhealthy"
        ? 503
        : 200;

    res.status(statusCode).json(response);
  } catch (error) {
    logger.error("ContentStack monitoring failed:", error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        type: error.constructor.name,
      },
    });
  }
});

/**
 * ContentStack active operations endpoint
 */
router.get("/contentstack/operations", (req, res) => {
  try {
    logger.debug("Active operations requested");

    const activeOperations = performanceMonitor.getActiveOperations();

    res.json({
      timestamp: new Date().toISOString(),
      activeOperations,
      count: Object.keys(activeOperations).length,
    });
  } catch (error) {
    logger.error("Failed to get active operations:", error);
    res.status(500).json({
      error: "Failed to retrieve active operations",
      timestamp: new Date().toISOString(),
      message: error.message,
    });
  }
});

/**
 * Reset ContentStack health status (useful for testing)
 */
router.post("/contentstack/reset", (req, res) => {
  try {
    logger.info("ContentStack health status reset requested");

    contentstackHealth.resetHealthStatus();
    logger.clearMetrics();

    res.json({
      status: "success",
      message: "ContentStack health status and metrics reset",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to reset ContentStack health status:", error);
    res.status(500).json({
      error: "Failed to reset health status",
      timestamp: new Date().toISOString(),
      message: error.message,
    });
  }
});

/**
 * ContentStack error statistics endpoint
 */
router.get("/contentstack/errors", (req, res) => {
  try {
    logger.debug("ContentStack error statistics requested");

    const errorStats = logger.getErrorStats();
    const healthMetrics = contentstackHealth.getHealthMetrics();

    res.json({
      timestamp: new Date().toISOString(),
      errorStats,
      healthMetrics: {
        consecutiveFailures: healthMetrics.consecutiveFailures,
        recentErrors: healthMetrics.recentErrors,
        successRate: healthMetrics.successRate,
      },
    });
  } catch (error) {
    logger.error("Failed to get error statistics:", error);
    res.status(500).json({
      error: "Failed to retrieve error statistics",
      timestamp: new Date().toISOString(),
      message: error.message,
    });
  }
});

module.exports = router;
