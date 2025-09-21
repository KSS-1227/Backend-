const supabaseService = require("./supabase");
const logger = require("../utils/logger");

class AnalyticsService {
  constructor() {
    this.supabase = supabaseService;
  }

  /**
   * Log search query for analytics
   */
  async logSearchQuery(query, filters = {}, results = []) {
    try {
      const hits = results.length;
      await this.supabase.logQuery(query, filters, hits);

      logger.debug("Search query logged for analytics", {
        query: query.substring(0, 100),
        hits,
        filters,
      });
    } catch (error) {
      logger.error("Failed to log search query:", error);
      // Don't throw error as this shouldn't break the search functionality
    }
  }

  /**
   * Get top search queries
   */
  async getTopQueries(limit = 10, days = 7) {
    try {
      const topQueries = await this.supabase.getTopQueries(limit, days);

      return {
        data: topQueries,
        meta: {
          limit,
          days,
          total: topQueries.length,
        },
      };
    } catch (error) {
      logger.error("Failed to get top queries:", error);
      throw error;
    }
  }

  /**
   * Get search trends over time
   */
  async getSearchTrends(days = 7) {
    try {
      const trends = await this.supabase.getQueryTrends(days);

      // Fill in missing days with zero counts
      const filledTrends = this.fillMissingDays(trends, days);

      return {
        data: filledTrends,
        meta: {
          days,
          totalQueries: filledTrends.reduce((sum, item) => sum + item.count, 0),
        },
      };
    } catch (error) {
      logger.error("Failed to get search trends:", error);
      throw error;
    }
  }

  /**
   * Get search success rate
   */
  async getSuccessRate(days = 7) {
    try {
      const successRate = await this.supabase.getSuccessRate(days);

      return {
        data: successRate,
        meta: {
          days,
          description:
            "Percentage of searches that returned at least one result",
        },
      };
    } catch (error) {
      logger.error("Failed to get success rate:", error);
      throw error;
    }
  }

  /**
   * Get word cloud data
   */
  async getWordCloudData(days = 7, limit = 50) {
    try {
      const wordCloud = await this.supabase.getWordCloudData(days, limit);

      return {
        data: wordCloud,
        meta: {
          days,
          limit,
          totalWords: wordCloud.length,
        },
      };
    } catch (error) {
      logger.error("Failed to get word cloud data:", error);
      throw error;
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardData(days = 7) {
    try {
      const [topQueries, trends, successRate, wordCloud] = await Promise.all([
        this.getTopQueries(10, days),
        this.getSearchTrends(days),
        this.getSuccessRate(days),
        this.getWordCloudData(days, 30),
      ]);

      const summary = this.generateSummary(trends.data, successRate.data);

      return {
        summary,
        topQueries: topQueries.data,
        trends: trends.data,
        successRate: successRate.data,
        wordCloud: wordCloud.data,
        meta: {
          days,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error("Failed to get dashboard data:", error);
      throw error;
    }
  }

  /**
   * Generate analytics summary
   */
  generateSummary(trends, successRate) {
    const totalQueries = trends.reduce((sum, item) => sum + item.count, 0);
    const avgQueriesPerDay =
      trends.length > 0 ? totalQueries / trends.length : 0;

    // Calculate trend direction
    const recentDays = trends.slice(-3);
    const olderDays = trends.slice(-6, -3);
    const recentAvg =
      recentDays.reduce((sum, item) => sum + item.count, 0) / recentDays.length;
    const olderAvg =
      olderDays.reduce((sum, item) => sum + item.count, 0) / olderDays.length;

    const trendDirection =
      recentAvg > olderAvg ? "up" : recentAvg < olderAvg ? "down" : "stable";
    const trendPercentage =
      olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    return {
      totalQueries,
      avgQueriesPerDay: Math.round(avgQueriesPerDay * 100) / 100,
      successRate: Math.round(successRate.successRate * 100) / 100,
      trendDirection,
      trendPercentage: Math.round(Math.abs(trendPercentage) * 100) / 100,
      insights: this.generateInsights(
        totalQueries,
        successRate.successRate,
        trendDirection
      ),
    };
  }

  /**
   * Generate insights based on analytics data
   */
  generateInsights(totalQueries, successRate, trendDirection) {
    const insights = [];

    if (totalQueries === 0) {
      insights.push({
        type: "info",
        message:
          "No search queries recorded yet. Start searching to see analytics.",
      });
    } else {
      if (successRate < 50) {
        insights.push({
          type: "warning",
          message:
            "Low search success rate. Consider improving content coverage or search algorithms.",
        });
      } else if (successRate > 80) {
        insights.push({
          type: "success",
          message:
            "Excellent search success rate! Users are finding what they need.",
        });
      }

      if (trendDirection === "up") {
        insights.push({
          type: "success",
          message: "Search activity is increasing - good engagement!",
        });
      } else if (trendDirection === "down") {
        insights.push({
          type: "info",
          message:
            "Search activity is decreasing. Consider promoting search features.",
        });
      }

      if (totalQueries > 1000) {
        insights.push({
          type: "info",
          message:
            "High search volume detected. Consider implementing caching for better performance.",
        });
      }
    }

    return insights;
  }

  /**
   * Fill missing days in trends data with zero counts
   */
  fillMissingDays(trends, days) {
    const filledTrends = [];
    const trendMap = new Map(trends.map((item) => [item.date, item.count]));

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      filledTrends.push({
        date: dateStr,
        count: trendMap.get(dateStr) || 0,
      });
    }

    return filledTrends;
  }

  /**
   * Get real-time analytics (current day)
   */
  async getRealTimeStats() {
    try {
      const today = new Date().toISOString().split("T")[0];

      const [todayTrends, successRate] = await Promise.all([
        this.supabase.getQueryTrends(1),
        this.supabase.getSuccessRate(1),
      ]);

      const todayQueries =
        todayTrends.find((item) => item.date === today)?.count || 0;

      return {
        todayQueries,
        todaySuccessRate: Math.round(successRate.successRate * 100) / 100,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to get real-time stats:", error);
      throw error;
    }
  }

  /**
   * Export analytics data for external analysis
   */
  async exportAnalyticsData(days = 30, format = "json") {
    try {
      const [queries, trends, successRate, wordCloud] = await Promise.all([
        this.supabase.getTopQueries(100, days),
        this.supabase.getQueryTrends(days),
        this.supabase.getSuccessRate(days),
        this.supabase.getWordCloudData(days, 100),
      ]);

      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          days,
          format,
        },
        topQueries: queries,
        trends,
        successRate,
        wordCloud,
      };

      if (format === "csv") {
        return this.convertToCSV(exportData);
      }

      return exportData;
    } catch (error) {
      logger.error("Failed to export analytics data:", error);
      throw error;
    }
  }

  /**
   * Convert analytics data to CSV format
   */
  convertToCSV(data) {
    const csvSections = [];

    // Top Queries CSV
    if (data.topQueries.length > 0) {
      csvSections.push("Top Queries");
      csvSections.push("Query,Count,Total Hits");
      data.topQueries.forEach((item) => {
        csvSections.push(`"${item.query}",${item.count},${item.totalHits}`);
      });
      csvSections.push("");
    }

    // Trends CSV
    if (data.trends.length > 0) {
      csvSections.push("Search Trends");
      csvSections.push("Date,Count");
      data.trends.forEach((item) => {
        csvSections.push(`${item.date},${item.count}`);
      });
      csvSections.push("");
    }

    // Word Cloud CSV
    if (data.wordCloud.length > 0) {
      csvSections.push("Word Cloud");
      csvSections.push("Word,Count");
      data.wordCloud.forEach((item) => {
        csvSections.push(`"${item.text}",${item.value}`);
      });
    }

    return csvSections.join("\n");
  }
}

module.exports = new AnalyticsService();
