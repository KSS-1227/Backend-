const express = require("express");
const router = express.Router();

const analyticsService = require("../services/analytics");
const logger = require("../utils/logger");

/**
 * GET /api/analytics/dashboard
 * Get comprehensive analytics dashboard data
 */
router.get("/dashboard", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    if (days < 1 || days > 365) {
      return res.status(400).json({
        error: "Days parameter must be between 1 and 365",
        timestamp: new Date().toISOString(),
      });
    }

    logger.debug(`Fetching dashboard analytics for ${days} days`);

    const dashboardData = await analyticsService.getDashboardData(days);

    res.json(dashboardData);
  } catch (error) {
    logger.error("Failed to get dashboard analytics:", error);
    res.status(500).json({
      error: "Failed to get dashboard analytics",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/top-queries
 * Get top search queries
 */
router.get("/top-queries", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const days = Math.min(parseInt(req.query.days) || 7, 365);

    logger.debug(`Fetching top ${limit} queries for ${days} days`);

    const topQueries = await analyticsService.getTopQueries(limit, days);

    res.json(topQueries);
  } catch (error) {
    logger.error("Failed to get top queries:", error);
    res.status(500).json({
      error: "Failed to get top queries",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/trends
 * Get search trends over time
 */
router.get("/trends", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 365);

    logger.debug(`Fetching search trends for ${days} days`);

    const trends = await analyticsService.getSearchTrends(days);

    res.json(trends);
  } catch (error) {
    logger.error("Failed to get search trends:", error);
    res.status(500).json({
      error: "Failed to get search trends",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/success-rate
 * Get search success rate
 */
router.get("/success-rate", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 365);

    logger.debug(`Fetching success rate for ${days} days`);

    const successRate = await analyticsService.getSuccessRate(days);

    res.json(successRate);
  } catch (error) {
    logger.error("Failed to get success rate:", error);
    res.status(500).json({
      error: "Failed to get success rate",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/wordcloud
 * Get word cloud data
 */
router.get("/wordcloud", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 365);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    logger.debug(`Fetching word cloud data for ${days} days, limit ${limit}`);

    const wordCloud = await analyticsService.getWordCloudData(days, limit);

    res.json(wordCloud);
  } catch (error) {
    logger.error("Failed to get word cloud data:", error);
    res.status(500).json({
      error: "Failed to get word cloud data",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/realtime
 * Get real-time analytics stats
 */
router.get("/realtime", async (req, res) => {
  try {
    logger.debug("Fetching real-time analytics");

    const realtimeStats = await analyticsService.getRealTimeStats();

    res.json({
      data: realtimeStats,
      meta: {
        description: "Real-time analytics for the current day",
        refreshRate: "5 minutes recommended",
      },
    });
  } catch (error) {
    logger.error("Failed to get real-time analytics:", error);
    res.status(500).json({
      error: "Failed to get real-time analytics",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/export
 * Export analytics data
 */
router.get("/export", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const format = req.query.format === "csv" ? "csv" : "json";

    logger.debug(
      `Exporting analytics data for ${days} days in ${format} format`
    );

    const exportData = await analyticsService.exportAnalyticsData(days, format);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="analytics-${days}days-${
          new Date().toISOString().split("T")[0]
        }.csv"`
      );
      res.send(exportData);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="analytics-${days}days-${
          new Date().toISOString().split("T")[0]
        }.json"`
      );
      res.json(exportData);
    }
  } catch (error) {
    logger.error("Failed to export analytics data:", error);
    res.status(500).json({
      error: "Failed to export analytics data",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/analytics/summary
 * Get analytics summary
 */
router.get("/summary", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 365);

    logger.debug(`Fetching analytics summary for ${days} days`);

    const [trends, successRate] = await Promise.all([
      analyticsService.getSearchTrends(days),
      analyticsService.getSuccessRate(days),
    ]);

    const summary = analyticsService.generateSummary(
      trends.data,
      successRate.data
    );

    res.json({
      data: summary,
      meta: {
        days,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to get analytics summary:", error);
    res.status(500).json({
      error: "Failed to get analytics summary",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * DELETE /api/analytics/data
 * Clear analytics data (admin only - add authentication as needed)
 */
router.delete("/data", async (req, res) => {
  try {
    const days = parseInt(req.query.days);

    if (!days || days < 1) {
      return res.status(400).json({
        error: "Days parameter is required and must be positive",
        timestamp: new Date().toISOString(),
      });
    }

    // This is a destructive operation - add proper authentication/authorization
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { error } = await supabaseService.client
      .from("query_logs")
      .delete()
      .lt("timestamp", cutoffDate.toISOString());

    if (error) throw error;

    logger.info(`Cleared analytics data older than ${days} days`);

    res.json({
      message: `Analytics data older than ${days} days has been cleared`,
      cutoffDate: cutoffDate.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to clear analytics data:", error);
    res.status(500).json({
      error: "Failed to clear analytics data",
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
