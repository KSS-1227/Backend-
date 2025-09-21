const { createClient } = require("@supabase/supabase-js");
const config = require("../utils/config");
const logger = require("../utils/logger");

class SupabaseService {
  constructor() {
    this.client = createClient(config.supabase.url, config.supabase.key);
    logger.info("🔗 Supabase client initialized");
  }

  /**
   * Insert or update content entry with embedding
   */
  async upsertContentEntry(entry) {
    try {
      const { data, error } = await this.client.from("content_entries").upsert(
        {
          id: entry.id,
          title: entry.title,
          snippet: entry.snippet,
          url: entry.url,
          content_type: entry.content_type,
          locale: entry.locale,
          updated_at: entry.updated_at,
          embedding: entry.embedding,
        },
        {
          onConflict: "id",
        }
      );

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Failed to upsert content entry:", error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple content entries
   */
  async batchUpsertContentEntries(entries) {
    try {
      const batchSize = 100; // Supabase batch limit
      const results = [];

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        const { data, error } = await this.client
          .from("content_entries")
          .upsert(batch, { onConflict: "id" });

        if (error) {
          throw error;
        }

        results.push(...(data || []));
        logger.debug(
          `Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            entries.length / batchSize
          )}`
        );
      }

      return results;
    } catch (error) {
      logger.error("Failed to batch upsert content entries:", error);
      throw error;
    }
  }

  /**
   * Search content using vector similarity
   */
  async searchContent(
    queryEmbedding,
    filters = {},
    limit = 10,
    threshold = 0.5
  ) {
    try {
      // Pass filters directly to the RPC call
      const { data, error } = await this.client.rpc("match_content", {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        filter_content_types: filters.contentTypes || null,
        filter_locales: filters.locales || null,
      });

      if (error) {
        throw error;
      }

      // The database now handles filtering, so we can return the data directly.
      return data || [];
    } catch (error) {
      logger.error("Failed to search content:", error);
      throw error;
    }
  }

  /**
   * Get distinct filter options
   */
  async getFilterOptions() {
    try {
      const [contentTypesResult, localesResult] = await Promise.all([
        this.client
          .from("content_entries")
          .select("content_type")
          .not("content_type", "is", null),
        this.client
          .from("content_entries")
          .select("locale")
          .not("locale", "is", null),
      ]);

      if (contentTypesResult.error) throw contentTypesResult.error;
      if (localesResult.error) throw localesResult.error;

      const contentTypes = [
        ...new Set(contentTypesResult.data.map((item) => item.content_type)),
      ];
      const locales = [
        ...new Set(localesResult.data.map((item) => item.locale)),
      ];

      return { contentTypes, locales };
    } catch (error) {
      logger.error("Failed to get filter options:", error);
      throw error;
    }
  }

  /**
   * Log search query for analytics
   */
  async logQuery(query, filters = {}, hits = 0) {
    try {
      const { data, error } = await this.client.from("query_logs").insert({
        query,
        filters,
        hits,
      });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Failed to log query:", error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Get analytics data
   */
  async getTopQueries(limit = 10, days = 7) {
    try {
      // This is much more performant as the aggregation is done in the database.
      const { data, error } = await this.client.rpc("get_top_queries", {
        limit_count: limit,
        days_interval: days,
      });

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Failed to get top queries:", error);
      throw error;
    }
  }

  async getQueryTrends(days = 7) {
    try {
      const { data, error } = await this.client
        .from("query_logs")
        .select("timestamp")
        .gte(
          "timestamp",
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        )
        .order("timestamp", { ascending: true });

      if (error) throw error;

      // Group by day
      const trends = {};
      data.forEach((log) => {
        const date = new Date(log.timestamp).toISOString().split("T")[0];
        trends[date] = (trends[date] || 0) + 1;
      });

      return Object.entries(trends).map(([date, count]) => ({ date, count }));
    } catch (error) {
      logger.error("Failed to get query trends:", error);
      throw error;
    }
  }

  async getSuccessRate(days = 7) {
    try {
      const { data, error } = await this.client
        .from("query_logs")
        .select("hits")
        .gte(
          "timestamp",
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        );

      if (error) throw error;

      const total = data.length;
      const successful = data.filter((log) => log.hits > 0).length;

      return {
        total,
        successful,
        successRate: total > 0 ? (successful / total) * 100 : 0,
      };
    } catch (error) {
      logger.error("Failed to get success rate:", error);
      throw error;
    }
  }

  async getWordCloudData(days = 7, limit = 50) {
    try {
      const { data, error } = await this.client
        .from("query_logs")
        .select("query")
        .gte(
          "timestamp",
          new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        )
        .not("query", "eq", "");

      if (error) throw error;

      // Extract and count words
      const wordCounts = {};
      const stopWords = new Set([
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "is",
        "was",
        "are",
        "were",
        "be",
        "been",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
      ]);

      data.forEach((log) => {
        const words = log.query
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter((word) => word.length > 2 && !stopWords.has(word));

        words.forEach((word) => {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        });
      });

      return Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([word, count]) => ({ text: word, value: count }));
    } catch (error) {
      logger.error("Failed to get word cloud data:", error);
      throw error;
    }
  }
}

module.exports = new SupabaseService();
