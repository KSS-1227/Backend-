const contentstackService = require("../services/contentstack");
const embeddingsService = require("../services/embeddings");
const supabaseService = require("../services/supabase");
const logger = require("../utils/logger");

class ContentSyncJob {
  constructor() {
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncStats = {
      totalRuns: 0,
      successfulRuns: 0,
      lastRunStatus: null,
      lastError: null,
    };
  }

  /**
   * Main sync function
   */
  async run() {
    if (this.isRunning) {
      logger.warn("🔄 Sync job already running, skipping this execution");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info("🚀 Starting content sync job...");

      this.syncStats.totalRuns++;

      // Step 1: Fetch content from Contentstack
      const contentEntries = await this.fetchContentFromContentstack();

      if (contentEntries.length === 0) {
        logger.warn("⚠️ No content entries found in Contentstack");
        this.syncStats.lastRunStatus = "no_content";
        return;
      }

      // Step 2: Process entries and generate embeddings
      const processedEntries = await this.processEntriesWithEmbeddings(
        contentEntries
      );

      if (processedEntries.length === 0) {
        logger.warn("⚠️ No entries could be processed with embeddings");
        this.syncStats.lastRunStatus = "no_embeddings";
        return;
      }

      // Step 3: Sync to Supabase
      await this.syncToSupabase(processedEntries);

      // Update sync statistics
      this.syncStats.successfulRuns++;
      this.syncStats.lastRunStatus = "success";
      this.syncStats.lastError = null;
      this.lastSyncTime = new Date();

      const duration = Date.now() - startTime;
      logger.info(`✅ Content sync completed successfully in ${duration}ms`, {
        totalEntries: contentEntries.length,
        processedEntries: processedEntries.length,
        duration: `${duration}ms`,
      });
    } catch (error) {
      // Enhanced error handling for new SDK error formats
      const errorCategory = this.categorizeContentstackError(error);

      this.syncStats.lastRunStatus = "error";
      this.syncStats.lastError = {
        message: error.message,
        category: errorCategory,
        timestamp: new Date().toISOString(),
        stack: error.stack,
      };

      logger.error("❌ Content sync failed:", {
        error: error.message,
        errorCategory,
        duration: Date.now() - startTime,
        syncStats: this.syncStats,
      });

      // Log additional context for debugging
      if (error.originalError) {
        logger.debug("Original error details:", error.originalError);
      }

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetch content from Contentstack with enhanced error handling and validation
   */
  async fetchContentFromContentstack() {
    try {
      logger.info("📥 Fetching content from Contentstack...");

      // Use configured locales or default to en-us
      const locales = process.env.CONTENTSTACK_LOCALES
        ? process.env.CONTENTSTACK_LOCALES.split(",").map((l) => l.trim())
        : ["en-us"];

      logger.debug("Using locales for sync:", { locales });

      // Fetch content with the updated SDK patterns
      const contentEntries = await contentstackService.getAllEntries(locales);

      // Validate the response before processing
      if (!this.validateContentResponse(contentEntries)) {
        logger.warn(
          "⚠️ Content response validation failed, attempting fallback"
        );
        return await this.handlePartialSyncFailure(locales);
      }

      logger.info(
        `📊 Successfully fetched ${contentEntries.length} entries from Contentstack`,
        {
          locales,
          entriesPerLocale: Math.round(contentEntries.length / locales.length),
          contentTypes: [...new Set(contentEntries.map((e) => e.content_type))]
            .length,
        }
      );

      return contentEntries;
    } catch (error) {
      // Enhanced error handling for new SDK error formats
      const errorCategory = this.categorizeContentstackError(error);

      logger.error("Failed to fetch content from Contentstack:", {
        error: error.message,
        errorCategory,
        stack: error.stack,
        originalError: error,
      });

      // Attempt fallback mechanisms for certain error types
      if (this.isRecoverableError(error, errorCategory)) {
        logger.info("🔄 Attempting fallback sync strategy...");
        try {
          return await this.handlePartialSyncFailure(["en-us"]);
        } catch (fallbackError) {
          logger.error("Fallback sync also failed:", fallbackError);
          throw new Error(
            `Content sync failed: ${error.message}. Fallback also failed: ${fallbackError.message}`
          );
        }
      }

      // Re-throw with enhanced error message
      throw new Error(`Content sync failed: ${error.message}`);
    }
  }

  /**
   * Process entries and generate embeddings with validation
   */
  async processEntriesWithEmbeddings(entries) {
    try {
      // Validate entries before processing
      if (!this.validateContentResponse(entries)) {
        throw new Error("Invalid entries provided for embedding processing");
      }

      logger.info(`🤖 Processing ${entries.length} entries with embeddings...`);

      const processedEntries = await embeddingsService.processContentEntries(
        entries
      );

      // Validate processed entries
      if (!Array.isArray(processedEntries)) {
        throw new Error("Embedding service returned invalid response format");
      }

      // Check for reasonable processing success rate
      const successRate = processedEntries.length / entries.length;
      if (successRate < 0.5 && entries.length > 10) {
        logger.warn(
          `Low embedding processing success rate: ${(successRate * 100).toFixed(
            1
          )}%`,
          {
            inputEntries: entries.length,
            processedEntries: processedEntries.length,
            successRate: `${(successRate * 100).toFixed(1)}%`,
          }
        );
      }

      logger.info(
        `✅ Successfully processed ${processedEntries.length}/${entries.length} entries with embeddings`,
        {
          successRate: `${(successRate * 100).toFixed(1)}%`,
          failedEntries: entries.length - processedEntries.length,
        }
      );

      return processedEntries;
    } catch (error) {
      logger.error("Failed to process entries with embeddings:", {
        error: error.message,
        entriesCount: entries?.length || 0,
        stack: error.stack,
      });
      throw new Error(
        `Embedding generation failed: ${error.message || JSON.stringify(error)}`
      );
    }
  }

  /**
   * Sync processed entries to Supabase with validation
   */
  async syncToSupabase(processedEntries) {
    try {
      // Validate processed entries before syncing
      if (!Array.isArray(processedEntries) || processedEntries.length === 0) {
        logger.warn("No valid entries to sync to Supabase");
        return { success: true, count: 0 };
      }

      logger.info(
        `💾 Syncing ${processedEntries.length} entries to Supabase...`
      );

      // Validate and prepare entries for Supabase
      const supabaseEntries = [];
      const invalidEntries = [];

      for (const entry of processedEntries) {
        // Validate required fields
        if (
          !entry.id ||
          !entry.title ||
          !entry.content_type ||
          !entry.embedding
        ) {
          invalidEntries.push({
            entry: entry.id || "unknown",
            reason: "Missing required fields",
            missingFields: [
              !entry.id && "id",
              !entry.title && "title",
              !entry.content_type && "content_type",
              !entry.embedding && "embedding",
            ].filter(Boolean),
          });
          continue;
        }

        supabaseEntries.push({
          id: entry.id,
          title: entry.title,
          snippet: entry.snippet || "",
          url: entry.url || "",
          content_type: entry.content_type,
          locale: entry.locale || "en-us",
          updated_at: entry.updated_at || new Date().toISOString(),
          embedding: entry.embedding,
        });
      }

      // Log validation results
      if (invalidEntries.length > 0) {
        logger.warn(
          `Found ${invalidEntries.length} invalid entries that will be skipped:`,
          {
            invalidEntries: invalidEntries.slice(0, 5), // Log first 5 invalid entries
            totalInvalid: invalidEntries.length,
          }
        );
      }

      if (supabaseEntries.length === 0) {
        throw new Error("No valid entries to sync after validation");
      }

      // Batch upsert to Supabase
      const result = await supabaseService.batchUpsertContentEntries(
        supabaseEntries
      );

      // Validate sync result
      if (!result || typeof result !== "object") {
        logger.warn("Supabase sync returned unexpected result format:", result);
      }

      logger.info(
        `✅ Successfully synced ${supabaseEntries.length} entries to Supabase`,
        {
          validEntries: supabaseEntries.length,
          invalidEntries: invalidEntries.length,
          totalProcessed: processedEntries.length,
          successRate: `${(
            (supabaseEntries.length / processedEntries.length) *
            100
          ).toFixed(1)}%`,
        }
      );

      return result;
    } catch (error) {
      logger.error("Failed to sync entries to Supabase:", {
        error: error.message,
        entriesCount: processedEntries?.length || 0,
        stack: error.stack,
      });
      throw new Error(
        `Supabase sync failed: ${error.message || JSON.stringify(error)}`
      );
    }
  }

  /**
   * Sync specific content types only
   */
  async syncContentTypes(contentTypes) {
    if (this.isRunning) {
      throw new Error("Sync job already running");
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info(
        `🎯 Starting selective sync for content types: ${contentTypes.join(
          ", "
        )}`
      );

      const locales = process.env.CONTENTSTACK_LOCALES
        ? process.env.CONTENTSTACK_LOCALES.split(",")
        : ["en-us"];

      let allEntries = [];

      // Fetch entries for each specified content type
      for (const contentType of contentTypes) {
        logger.debug(`Fetching entries for content type: ${contentType}`);
        const batchSize = 100; // Use a reasonable batch size

        for (const locale of locales) {
          let skip = 0;
          let hasMore = true;

          while (hasMore) {
            try {
              const result = await contentstackService.getEntriesByContentType(
                contentType,
                locale,
                batchSize,
                skip
              );
              const entries = result.entries;

              if (entries.length === 0) {
                hasMore = false;
                break;
              }

              const transformedEntries = entries.map((entry) =>
                contentstackService.transformEntry(entry, contentType, locale)
              );
              allEntries.push(...transformedEntries);

              skip += batchSize;
              hasMore = entries.length === batchSize;
            } catch (error) {
              const errorCategory = this.categorizeContentstackError(error);
              logger.warn(
                `Failed to fetch batch for ${contentType} (${locale}), skipping:`,
                {
                  error: error.message,
                  errorCategory,
                  batchInfo: { skip, batchSize, locale, contentType },
                }
              );
              hasMore = false; // Stop trying for this content type/locale on error
            }
          }
        }
      }

      if (allEntries.length === 0) {
        logger.warn("No entries found for specified content types");
        return;
      }

      // Process with embeddings
      const processedEntries = await this.processEntriesWithEmbeddings(
        allEntries
      );

      // Sync to Supabase
      await this.syncToSupabase(processedEntries);

      const duration = Date.now() - startTime;
      logger.info(`✅ Selective sync completed in ${duration}ms`, {
        contentTypes,
        totalEntries: allEntries.length,
        processedEntries: processedEntries.length,
      });
    } catch (error) {
      const errorCategory = this.categorizeContentstackError(error);
      logger.error("Selective sync failed:", {
        error: error.message,
        errorCategory,
        contentTypes,
        duration: Date.now() - startTime,
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get sync job status and statistics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      stats: this.syncStats,
      nextScheduledRun: this.getNextScheduledRun(),
    };
  }

  /**
   * Get next scheduled run time (assuming hourly schedule)
   */
  getNextScheduledRun() {
    if (!this.lastSyncTime) {
      return "Next hour";
    }

    const nextRun = new Date(this.lastSyncTime);
    nextRun.setHours(nextRun.getHours() + 1);

    return nextRun.toISOString();
  }

  /**
   * Manual trigger for sync job (for admin endpoints)
   */
  async triggerManualSync(options = {}) {
    try {
      const { contentTypes, force = false } = options;

      if (this.isRunning && !force) {
        throw new Error(
          "Sync job is already running. Use force=true to override."
        );
      }

      if (contentTypes && Array.isArray(contentTypes)) {
        await this.syncContentTypes(contentTypes);
      } else {
        await this.run();
      }

      return this.getStatus();
    } catch (error) {
      logger.error("Manual sync trigger failed:", error);
      throw error;
    }
  }

  /**
   * Clean up old or invalid entries
   */
  async cleanupEntries() {
    try {
      logger.info("🧹 Starting cleanup of old entries...");

      // Remove entries that haven't been updated in the last 30 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const { error } = await supabaseService.client
        .from("content_entries")
        .delete()
        .lt("updated_at", cutoffDate.toISOString());

      if (error) {
        throw error;
      }

      logger.info("✅ Cleanup completed successfully");
    } catch (error) {
      logger.error("Cleanup failed:", error);
      throw error;
    }
  }

  /**
   * Validate content integrity
   */
  async validateContentIntegrity() {
    try {
      logger.info("🔍 Validating content integrity...");

      // Check for entries without embeddings
      const { data: entriesWithoutEmbeddings, error } =
        await supabaseService.client
          .from("content_entries")
          .select("id")
          .is("embedding", null);

      if (error) throw error;

      const issues = {
        entriesWithoutEmbeddings: entriesWithoutEmbeddings?.length || 0,
        validationTime: new Date().toISOString(),
      };

      if (issues.entriesWithoutEmbeddings > 0) {
        logger.warn(
          `Found ${issues.entriesWithoutEmbeddings} entries without embeddings`
        );
      } else {
        logger.info("✅ All entries have valid embeddings");
      }

      return issues;
    } catch (error) {
      logger.error("Content integrity validation failed:", error);
      throw error;
    }
  }

  /**
   * Validate successful API responses before processing
   */
  validateContentResponse(contentEntries) {
    try {
      // Check if response is an array
      if (!Array.isArray(contentEntries)) {
        logger.error(
          "Content response is not an array:",
          typeof contentEntries
        );
        return false;
      }

      // Check if array is empty
      if (contentEntries.length === 0) {
        logger.warn("Content response is empty array");
        return true; // Empty is valid, just no content
      }

      // Validate structure of first few entries
      const sampleSize = Math.min(5, contentEntries.length);
      const requiredFields = ["id", "title", "content_type", "locale"];

      for (let i = 0; i < sampleSize; i++) {
        const entry = contentEntries[i];

        if (!entry || typeof entry !== "object") {
          logger.error(`Entry ${i} is not a valid object:`, entry);
          return false;
        }

        for (const field of requiredFields) {
          if (!entry[field]) {
            logger.error(
              `Entry ${i} missing required field '${field}':`,
              entry
            );
            return false;
          }
        }
      }

      // Check for reasonable content distribution
      const contentTypes = [
        ...new Set(contentEntries.map((e) => e.content_type)),
      ];
      const locales = [...new Set(contentEntries.map((e) => e.locale))];

      logger.debug("Content validation passed:", {
        totalEntries: contentEntries.length,
        contentTypes: contentTypes.length,
        locales: locales.length,
        sampleValidated: sampleSize,
      });

      return true;
    } catch (error) {
      logger.error("Error during content validation:", error);
      return false;
    }
  }

  /**
   * Categorize Contentstack errors for better handling
   */
  categorizeContentstackError(error) {
    // Use the retry utility's categorization
    const { categorizeError } = require("../utils/retry");
    return categorizeError(error);
  }

  /**
   * Determine if an error is recoverable with fallback strategies
   */
  isRecoverableError(error, errorCategory) {
    const recoverableCategories = [
      "NETWORK",
      "TIMEOUT",
      "RATE_LIMIT",
      "SERVER_ERROR",
    ];

    // Check if error category is recoverable
    if (recoverableCategories.includes(errorCategory)) {
      return true;
    }

    // Check for specific error patterns that might be recoverable
    const errorMessage = (error.message || "").toLowerCase();
    const recoverablePatterns = [
      "partial",
      "some content types failed",
      "batch failed",
      "connection",
      "timeout",
    ];

    return recoverablePatterns.some((pattern) =>
      errorMessage.includes(pattern)
    );
  }

  /**
   * Handle partial sync failures with fallback mechanisms
   */
  async handlePartialSyncFailure(locales) {
    logger.info("🔄 Implementing fallback sync strategy...");

    try {
      // Strategy 1: Try with smaller batch size
      logger.debug("Attempting sync with reduced batch size...");
      const smallBatchEntries = await contentstackService.getAllEntries(
        locales,
        25
      );

      if (
        this.validateContentResponse(smallBatchEntries) &&
        smallBatchEntries.length > 0
      ) {
        logger.info(
          `✅ Fallback sync successful with ${smallBatchEntries.length} entries`
        );
        return smallBatchEntries;
      }

      // Strategy 2: Try single locale only
      logger.debug("Attempting sync with single locale...");
      const singleLocaleEntries = await contentstackService.getAllEntries(
        ["en-us"],
        50
      );

      if (
        this.validateContentResponse(singleLocaleEntries) &&
        singleLocaleEntries.length > 0
      ) {
        logger.info(
          `✅ Single locale fallback successful with ${singleLocaleEntries.length} entries`
        );
        return singleLocaleEntries;
      }

      // Strategy 3: Try specific content types only
      logger.debug("Attempting sync with core content types...");
      const coreContentTypes = await this.getCoreContentTypes();
      const coreEntries = await this.syncSpecificContentTypes(
        coreContentTypes,
        ["en-us"]
      );

      if (this.validateContentResponse(coreEntries) && coreEntries.length > 0) {
        logger.info(
          `✅ Core content types fallback successful with ${coreEntries.length} entries`
        );
        return coreEntries;
      }

      // If all fallback strategies fail, return empty array to prevent complete failure
      logger.warn("⚠️ All fallback strategies failed, returning empty result");
      return [];
    } catch (fallbackError) {
      logger.error("Fallback sync strategies failed:", fallbackError);
      throw new Error(`Fallback sync failed: ${fallbackError.message}`);
    }
  }

  /**
   * Get core content types for fallback sync
   */
  async getCoreContentTypes() {
    try {
      const allContentTypes = await contentstackService.getContentTypes();

      // Define priority content types (customize based on your needs)
      const priorityTypes = ["blog_post", "page", "article", "product", "news"];

      // Filter to only include priority types that exist
      const coreTypes = allContentTypes
        .filter((ct) => priorityTypes.includes(ct.uid))
        .map((ct) => ct.uid);

      // If no priority types found, use first few content types
      if (coreTypes.length === 0) {
        return allContentTypes.slice(0, 3).map((ct) => ct.uid);
      }

      logger.debug("Using core content types for fallback:", coreTypes);
      return coreTypes;
    } catch (error) {
      logger.warn("Failed to get core content types, using defaults:", error);
      return ["blog_post", "page"]; // Fallback defaults
    }
  }

  /**
   * Sync specific content types for fallback scenarios
   */
  async syncSpecificContentTypes(contentTypes, locales) {
    const allEntries = [];

    for (const contentType of contentTypes) {
      try {
        logger.debug(`Fetching fallback content for type: ${contentType}`);

        for (const locale of locales) {
          const result = await contentstackService.getEntriesByContentType(
            contentType,
            locale,
            50, // Small batch size for fallback
            0
          );

          const entries = result.entries || [];
          if (entries.length > 0) {
            const transformedEntries = entries.map((entry) =>
              contentstackService.transformEntry(entry, contentType, locale)
            );
            allEntries.push(...transformedEntries);
          }
        }
      } catch (error) {
        logger.warn(
          `Failed to fetch fallback content for ${contentType}:`,
          error.message
        );
        // Continue with other content types
      }
    }

    return allEntries;
  }
}

// Create singleton instance
const contentSyncJob = new ContentSyncJob();

// If this file is run directly, execute the sync job
if (require.main === module) {
  // Check for command line arguments
  const args = process.argv.slice(2);

  // Check for --content-types argument
  const contentTypesIndex = args.indexOf("--content-types");
  if (contentTypesIndex !== -1 && contentTypesIndex + 1 < args.length) {
    const contentTypes = args[contentTypesIndex + 1].split(",");
    contentSyncJob
      .syncContentTypes(contentTypes)
      .then(() => {
        console.log("Selective sync job completed successfully");
        process.exit(0);
      })
      .catch((error) => {
        console.error("Selective sync job failed:", error);
        process.exit(1);
      });
  } else {
    contentSyncJob
      .run()
      .then(() => {
        console.log("Sync job completed successfully");
        process.exit(0);
      })
      .catch((error) => {
        console.error("Sync job failed:", error);
        process.exit(1);
      });
  }
}

module.exports = contentSyncJob;
