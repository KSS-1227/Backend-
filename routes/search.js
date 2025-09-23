const express = require("express");
const router = express.Router();

const embeddingsService = require("../services/embeddings");
const supabaseService = require("../services/supabase");
const analyticsService = require("../services/analytics");
const explainabilityService = require("../services/explainability");
const config = require("../utils/config");
const logger = require("../utils/logger");

/**
 * POST /api/search
 * Perform semantic search using embeddings
 */
router.post("/", async (req, res) => {
  try {
    const {
      query,
      filters = {},
      limit = config.search.defaultLimit,
      threshold = config.search.defaultThreshold,
    } = req.body;

    // Validate input
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({
        error: "Query is required and must be a non-empty string",
        timestamp: new Date().toISOString(),
      });
    }

    // Validate limit
    const searchLimit = Math.min(
      Math.max(1, parseInt(limit) || config.search.defaultLimit),
      config.search.maxLimit
    );

    // Validate threshold
    const searchThreshold = Math.min(
      Math.max(0, parseFloat(threshold) || config.search.defaultThreshold),
      1
    );

    logger.info("🔍 Processing search request", {
      query: query.substring(0, 100),
      filters,
      limit: searchLimit,
      threshold: searchThreshold,
    });

    // Generate embedding for the search query
    const startTime = Date.now();
    const queryEmbedding = await embeddingsService.generateEmbedding(
      query.trim()
    );
    const embeddingTime = Date.now() - startTime;

    logger.debug(`Generated query embedding in ${embeddingTime}ms`);

    // Perform vector search
    const searchStartTime = Date.now();
    const results = await supabaseService.searchContent(
      queryEmbedding,
      filters,
      searchLimit,
      searchThreshold
    );
    const searchTime = Date.now() - searchStartTime;

    logger.debug(
      `Search completed in ${searchTime}ms, found ${results.length} results`
    );

    // Log search for analytics (async, don't wait)
    analyticsService.logSearchQuery(query, filters, results).catch((error) => {
      logger.warn("Failed to log search query for analytics:", error.message);
    });

    // Format response
    const response = {
      query,
      results: results.map((result) => ({
        id: result.id,
        title: result.title,
        snippet: result.snippet,
        url: result.url,
        contentType: result.content_type,
        locale: result.locale,
        updatedAt: result.updated_at,
        similarity: Math.round(result.similarity * 10000) / 10000, // Round to 4 decimal places
      })),
      meta: {
        total: results.length,
        limit: searchLimit,
        threshold: searchThreshold,
        filters,
        timing: {
          embedding: `${embeddingTime}ms`,
          search: `${searchTime}ms`,
          total: `${Date.now() - startTime}ms`,
        },
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);
  } catch (error) {
    logger.error("Search request failed:", error);

    const statusCode = error.message.includes("OpenAI") ? 503 : 500;
    res.status(statusCode).json({
      error: "Search failed",
      message:
        config.nodeEnv === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/search/stats
 * Get search service statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = {
      embeddings: embeddingsService.getStats(),
      search: {
        defaultLimit: config.search.defaultLimit,
        maxLimit: config.search.maxLimit,
        defaultThreshold: config.search.defaultThreshold,
        embeddingDimensions: config.search.embeddingDimensions,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(stats);
  } catch (error) {
    logger.error("Failed to get search stats:", error);
    res.status(500).json({
      error: "Failed to get search statistics",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/search/similarity
 * Calculate similarity between two texts (for testing)
 */
router.post("/similarity", async (req, res) => {
  try {
    const { text1, text2 } = req.body;

    if (!text1 || !text2) {
      return res.status(400).json({
        error: "Both text1 and text2 are required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.debug("Calculating similarity between texts");

    const [embedding1, embedding2] = await Promise.all([
      embeddingsService.generateEmbedding(text1),
      embeddingsService.generateEmbedding(text2),
    ]);

    // Calculate cosine similarity
    const similarity = calculateCosineSimilarity(embedding1, embedding2);

    res.json({
      text1: text1.substring(0, 100) + (text1.length > 100 ? "..." : ""),
      text2: text2.substring(0, 100) + (text2.length > 100 ? "..." : ""),
      similarity: Math.round(similarity * 10000) / 10000,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Similarity calculation failed:", error);
    res.status(500).json({
      error: "Similarity calculation failed",
      message:
        config.nodeEnv === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/search/explain
 * Generate explanations for search results
 */
router.post("/explain", async (req, res) => {
  try {
    const { query, results } = req.body;

    if (!query || !results || !Array.isArray(results)) {
      return res.status(400).json({
        error: "Query and results array are required",
        timestamp: new Date().toISOString(),
      });
    }

    logger.debug(
      `Generating explanations for ${results.length} search results`
    );

    const startTime = Date.now();
    const explanations = await explainabilityService.explainSearchResults(
      query,
      results
    );
    const responseTime = Date.now() - startTime;

    logger.debug(`Generated explanations in ${responseTime}ms`);

    res.json({
      query,
      explanations,
      meta: {
        count: explanations.length,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Explanation generation failed:", error);
    res.status(500).json({
      error: "Failed to generate explanations",
      message:
        config.nodeEnv === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/search/suggestions
 * Generate search suggestions based on query and results
 */
router.post("/suggestions", async (req, res) => {
  try {
    const { query, results = [] } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Query is required and must be a string",
        timestamp: new Date().toISOString(),
      });
    }

    logger.debug(`Generating search suggestions for query: ${query}`);

    const startTime = Date.now();
    const suggestions = await explainabilityService.generateSearchSuggestions(
      query,
      results
    );
    const responseTime = Date.now() - startTime;

    res.json({
      query,
      suggestions,
      meta: {
        count: suggestions.length,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Search suggestions generation failed:", error);
    res.status(500).json({
      error: "Failed to generate search suggestions",
      message:
        config.nodeEnv === "development"
          ? error.message
          : "Internal server error",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vectorA, vectorB) {
  if (vectorA.length !== vectorB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = router;
