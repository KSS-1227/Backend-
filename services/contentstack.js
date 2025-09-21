const Contentstack = require("contentstack");
const config = require("../utils/config");
const logger = require("../utils/logger");
const performanceMonitor = require("../utils/performance");
const contentTypeManager = require("./contentTypeManager");
const {
  withRetry,
  isRetryableError,
  categorizeError,
} = require("../utils/retry");

class ContentstackService {
  constructor() {
    // Validate required configuration
    this.validateConfiguration();

    // Initialize ContentStack SDK with enhanced configuration
    this.stack = new Contentstack.Stack({
      api_key: config.contentstack.apiKey,
      delivery_token: config.contentstack.deliveryToken,
      environment: config.contentstack.environment,
      region: config.contentstack.region || "us", // Default to 'us' if not specified
    });

    // Set additional SDK options if available
    if (config.contentstack.host) {
      this.stack.setHost(config.contentstack.host);
    }

    logger.info("📚 Contentstack client initialized", {
      environment: config.contentstack.environment,
      region: config.contentstack.region || "us",
      timeout: config.contentstack.timeout || 30000,
      retryLimit: config.contentstack.retryLimit || 3,
      retryDelay: config.contentstack.retryDelay || 1000,
    });
  }

  /**
   * Validate ContentStack configuration
   */
  validateConfiguration() {
    const requiredFields = ["apiKey", "deliveryToken", "environment"];
    const missingFields = requiredFields.filter(
      (field) => !config.contentstack[field]
    );

    if (missingFields.length > 0) {
      const fieldMappings = {
        apiKey: "CONTENTSTACK_API_KEY",
        deliveryToken: "CONTENTSTACK_DELIVERY_TOKEN",
        environment: "CONTENTSTACK_ENVIRONMENT",
      };

      const missingEnvVars = missingFields.map((field) => fieldMappings[field]);
      const error =
        `ContentStack configuration error: Missing required environment variables: ${missingEnvVars.join(
          ", "
        )}. ` +
        `Please check your .env file and ensure these variables are set with valid values from your ContentStack dashboard.`;

      logger.error(error, {
        missingFields,
        missingEnvVars,
        configurationHelp:
          "Visit ContentStack dashboard > Settings to get API keys and tokens",
      });
      throw new Error(error);
    }

    // Validate region format if provided
    if (config.contentstack.region) {
      const validRegions = ["us", "eu", "azure-na", "azure-eu", "gcp-na"];
      if (!validRegions.includes(config.contentstack.region)) {
        const error =
          `ContentStack region configuration error: '${config.contentstack.region}' is not a valid region. ` +
          `Valid regions are: ${validRegions.join(
            ", "
          )}. Update CONTENTSTACK_REGION in your .env file.`;

        logger.error(error, {
          providedRegion: config.contentstack.region,
          validRegions,
          configurationHelp:
            "Check ContentStack documentation for your stack's region",
        });
        throw new Error(error);
      }
    }

    logger.debug("ContentStack configuration validated successfully", {
      environment: config.contentstack.environment,
      region: config.contentstack.region || "us (default)",
      timeout: config.contentstack.timeout,
      retryLimit: config.contentstack.retryLimit,
    });
  }

  /**
   * Fetch all content types with retry logic
   */
  async getContentTypes() {
    return performanceMonitor.timeOperation("getContentTypes", async () => {
      return withRetry(
        async () => {
          try {
            logger.debug("Fetching content types from ContentStack");
            const response = await this.stack.getContentTypes();
            // Extract the content_types array from the response
            const contentTypes = response.content_types || [];

            logger.info("Successfully fetched content types", {
              count: contentTypes.length,
              types: contentTypes.map((ct) => ct.uid).slice(0, 10), // Log first 10 types
            });

            return contentTypes;
          } catch (error) {
            const errorMessage = this.formatContentstackError(error);
            const errorCategory = categorizeError(error);

            logger.logError("getContentTypes", error, errorCategory);
            logger.error("Failed to fetch content types:", {
              originalError: error,
              formattedMessage: errorMessage,
              errorCategory,
            });
            throw new Error(`Contentstack API error: ${errorMessage}`);
          }
        },
        {
          maxRetries: config.contentstack.retryLimit || 3,
          baseDelay: config.contentstack.retryDelay || 1000,
          shouldRetry: isRetryableError,
        }
      );
    });
  }

  /**
   * Fetch entries from a specific content type with retry logic
   */
  async getEntriesByContentType(
    contentType,
    locale = "en-us",
    limit = 100,
    skip = 0
  ) {
    return performanceMonitor.timeOperation(
      "getEntriesByContentType",
      async () => {
        return withRetry(
          async () => {
            try {
              logger.debug(
                `Fetching entries for content type: ${contentType}`,
                {
                  locale,
                  limit,
                  skip,
                }
              );

              // Use the correct SDK pattern for fetching entries
              const query = this.stack
                .ContentType(contentType)
                .Query();
              
              // Set query parameters
              query.language(locale);
              query.limit(limit);
              query.skip(skip);
              query.includeCount();

              const result = await query.find();

              // Handle different response formats from the SDK
              let entries = [];
              let count = 0;

              if (Array.isArray(result)) {
                // Format: [entries, schema, count]
                entries = result[0] || [];
                count = result[2] || result.count || 0;
              } else if (result && typeof result === "object") {
                // Format: { entries: [...], count: number }
                entries = result.entries || result[0] || [];
                count = result.count || 0;
              }

              logger.info(`Successfully fetched entries for ${contentType}`, {
                entriesReturned: entries.length,
                totalCount: count,
                locale,
                limit,
                skip,
              });

              return {
                entries,
                count,
              };
            } catch (error) {
              const errorMessage = this.formatContentstackError(error);
              const errorCategory = categorizeError(error);

              logger.logError("getEntriesByContentType", error, errorCategory);
              logger.error(
                `Failed to fetch entries for content type ${contentType}:`,
                {
                  originalError: error,
                  formattedMessage: errorMessage,
                  errorCategory,
                  locale,
                  limit,
                  skip,
                }
              );
              throw new Error(
                `Contentstack API error for ${contentType}: ${errorMessage}`
              );
            }
          },
          {
            maxRetries: config.contentstack.retryLimit || 3,
            baseDelay: config.contentstack.retryDelay || 1000,
            shouldRetry: isRetryableError,
          }
        );
      },
      { contentType, locale, limit, skip }
    );
  }

  /**
   * Fetch entries by specific IDs with retry logic
   */
  async getEntriesByIds(contentType, ids, locale = "en-us") {
    // Validate input parameters before retry logic
    if (!Array.isArray(ids) || ids.length === 0) {
      logger.warn(
        `Invalid or empty IDs array for content type ${contentType}`,
        {
          idsType: typeof ids,
          idsLength: Array.isArray(ids) ? ids.length : "N/A",
        }
      );
      return [];
    }

    return performanceMonitor.timeOperation(
      "getEntriesByIds",
      async () => {
        return withRetry(
          async () => {
            try {
              logger.debug(
                `Fetching entries by IDs for content type: ${contentType}`,
                {
                  requestedIds: ids.length,
                  locale,
                  sampleIds: ids.slice(0, 3), // Log first 3 IDs
                }
              );

              const query = this.stack
                .ContentType(contentType)
                .Query();
              
              query.language(locale);
              query.where("uid", { $in: ids });
              query.includeCount();

              const result = await query.find();

              // Handle different response formats from the SDK
              let entries = [];

              if (Array.isArray(result)) {
                // Format: [entries, schema, count]
                entries = result[0] || [];
              } else if (result && typeof result === "object") {
                // Format: { entries: [...] }
                entries = result.entries || result[0] || [];
              }

              logger.info(
                `Successfully fetched entries by IDs for ${contentType}`,
                {
                  requestedIds: ids.length,
                  foundEntries: entries.length,
                  locale,
                  matchRate: `${((entries.length / ids.length) * 100).toFixed(
                    1
                  )}%`,
                }
              );

              return entries;
            } catch (error) {
              const errorMessage = this.formatContentstackError(error);
              const errorCategory = categorizeError(error);

              logger.logError("getEntriesByIds", error, errorCategory);
              logger.error(
                `Failed to fetch entries by IDs for content type ${contentType}:`,
                {
                  originalError: error,
                  formattedMessage: errorMessage,
                  errorCategory,
                  ids: ids.slice(0, 5), // Log first 5 IDs for debugging
                  locale,
                }
              );
              throw new Error(
                `Contentstack API error for ${contentType}: ${errorMessage}`
              );
            }
          },
          {
            maxRetries: config.contentstack.retryLimit || 3,
            baseDelay: config.contentstack.retryDelay || 1000,
            shouldRetry: isRetryableError,
          }
        );
      },
      { contentType, locale, idsCount: ids.length }
    );
  }

  /**
   * Fetch all blog posts with retry logic
   */
  async fetchBlogPosts(locale = "en-us", limit = 100) {
    return performanceMonitor.timeOperation(
      "fetchBlogPosts",
      async () => {
        return withRetry(
          async () => {
            try {
              logger.debug("Fetching blog posts from ContentStack", {
                locale,
                limit,
              });

              const query = this.stack
                .ContentType("blog_post")
                .Query();
              
              query.language(locale);
              query.limit(limit);
              query.includeCount();
              query.toJSON();

              const result = await query.find();

              // Handle different response formats from the SDK
              let entries = [];

              if (Array.isArray(result)) {
                // Format: [entries, schema, count]
                entries = result[0] || [];
              } else if (result && typeof result === "object") {
                // Format: { entries: [...] }
                entries = result.entries || result[0] || [];
              }

              logger.info(`Successfully fetched blog posts`, {
                entriesReturned: entries.length,
                locale,
                limit,
              });

              return entries;
            } catch (error) {
              const errorMessage = this.formatContentstackError(error);
              const errorCategory = categorizeError(error);

              logger.logError("fetchBlogPosts", error, errorCategory);
              logger.error("Contentstack fetchBlogPosts error:", {
                originalError: error,
                formattedMessage: errorMessage,
                errorCategory,
                locale,
                limit,
              });
              throw new Error(`Contentstack API error: ${errorMessage}`);
            }
          },
          {
            maxRetries: config.contentstack.retryLimit || 3,
            baseDelay: config.contentstack.retryDelay || 1000,
            shouldRetry: isRetryableError,
          }
        );
      },
      { locale, limit }
    );
  }

  /**
   * Fetch all entries across all content types with pagination
   */
  async getAllEntries(locales = ["en-us"], batchSize = 50) {
    return performanceMonitor.timeOperation(
      "getAllEntries",
      async () => {
        try {
          const allEntries = [];
          const contentTypes = await this.getContentTypes();
          const failedContentTypes = [];
          const startTime = Date.now();

          logger.info(
            `📥 Starting comprehensive content sync from ${contentTypes.length} content types across ${locales.length} locale(s)`,
            {
              contentTypes: contentTypes.map((ct) => ct.uid),
              locales,
              batchSize,
            }
          );

          for (const contentType of contentTypes) {
            const uid = contentType.uid;
            logger.debug(`Processing content type: ${uid}`);

            for (const locale of locales) {
              let skip = 0;
              let hasMore = true;
              let batchCount = 0;
              let contentTypeEntries = 0;
              const contentTypeStartTime = Date.now();

              while (hasMore) {
                try {
                  batchCount++;
                  logger.debug(
                    `Fetching batch ${batchCount} for ${uid} (${locale}), skip: ${skip}`
                  );

                  const result = await this.getEntriesByContentType(
                    uid,
                    locale,
                    batchSize,
                    skip
                  );

                  const entries = result.entries || [];
                  const totalCount = result.count || 0;

                  if (entries.length === 0) {
                    logger.debug(`No more entries for ${uid} (${locale})`);
                    hasMore = false;
                    break;
                  }

                  // Transform entries to standard format
                  const transformedEntries = entries.map((entry) =>
                    this.transformEntry(entry, uid, locale)
                  );
                  allEntries.push(...transformedEntries);
                  contentTypeEntries += entries.length;

                  logger.debug(
                    `Batch ${batchCount}: Fetched ${entries.length} entries for ${uid} (${locale})`,
                    {
                      batchSize: entries.length,
                      contentTypeTotal: contentTypeEntries,
                      overallTotal: allEntries.length,
                      totalAvailable: totalCount,
                      progress: `${Math.round(
                        ((skip + entries.length) / totalCount) * 100
                      )}%`,
                    }
                  );

                  // Update pagination
                  skip += batchSize;

                  // Check if we have more entries based on the response
                  hasMore = entries.length === batchSize && skip < totalCount;

                  // Add a small delay to avoid rate limiting
                  await this.delay(200);

                  // Safety check to prevent infinite loops
                  if (batchCount > 100) {
                    logger.warn(
                      `Too many batches for ${uid} (${locale}), stopping at batch ${batchCount}`,
                      { maxBatchesReached: true, batchCount }
                    );
                    hasMore = false;
                  }
                } catch (error) {
                  const errorCategory = categorizeError(error);
                  logger.logError("getAllEntries_batch", error, errorCategory);
                  logger.warn(
                    `Failed to fetch batch ${batchCount} for ${uid} (${locale}), skipping remaining batches:`,
                    {
                      error: error.message,
                      errorCategory,
                      skip,
                      batchSize,
                      batchCount,
                    }
                  );
                  failedContentTypes.push({
                    uid,
                    locale,
                    error: error.message,
                    batchCount,
                  });
                  hasMore = false;
                }
              }

              const contentTypeDuration = Date.now() - contentTypeStartTime;
              if (contentTypeEntries > 0) {
                logger.info(
                  `✅ Completed ${uid} (${locale}): ${contentTypeEntries} entries`,
                  {
                    duration: `${contentTypeDuration}ms`,
                    entriesPerSecond: Math.round(
                      contentTypeEntries / (contentTypeDuration / 1000)
                    ),
                    batches: batchCount,
                  }
                );
              } else {
                logger.debug(`No entries found for ${uid} (${locale})`);
              }
            }
          }

          const totalDuration = Date.now() - startTime;
          const entriesPerSecond = Math.round(
            allEntries.length / (totalDuration / 1000)
          );

          // Log comprehensive summary
          logger.info(`✅ Content sync completed successfully`, {
            totalEntries: allEntries.length,
            contentTypes: contentTypes.length,
            locales: locales.length,
            duration: `${totalDuration}ms`,
            entriesPerSecond,
            averageEntriesPerContentType: Math.round(
              allEntries.length / contentTypes.length
            ),
            failedContentTypes: failedContentTypes.length,
          });

          if (failedContentTypes.length > 0) {
            logger.warn(
              `⚠️  Failed content types: ${failedContentTypes.length}`,
              {
                failed: failedContentTypes.map(
                  (f) => `${f.uid} (${f.locale}) - batch ${f.batchCount}`
                ),
                failureRate: `${(
                  (failedContentTypes.length /
                    (contentTypes.length * locales.length)) *
                  100
                ).toFixed(1)}%`,
              }
            );
          }

          return allEntries;
        } catch (error) {
          const errorMessage = this.formatContentstackError(error);
          const errorCategory = categorizeError(error);

          logger.logError("getAllEntries", error, errorCategory);
          logger.error("Failed to fetch all entries:", {
            originalError: error,
            formattedMessage: errorMessage,
            errorCategory,
            locales,
            batchSize,
          });
          throw new Error(`Contentstack API error: ${errorMessage}`);
        }
      },
      { locales, batchSize }
    );
  }

  /**
   * Transform Contentstack entry to standard format using content type manager
   */
  transformEntry(entry, contentType, locale) {
    // Extract basic fields using content type manager
    const uid = entry.uid;
    const title = contentTypeManager.extractTitle(entry, contentType);
    const snippet = contentTypeManager.extractSnippet(entry, contentType);
    const url = contentTypeManager.generateUrl(entry, contentType);
    const updatedAt =
      entry.updated_at ||
      entry._metadata?.updated_at ||
      new Date().toISOString();

    // Extract additional fields using content type manager
    const tags = contentTypeManager.extractTags(entry, contentType);
    const category = contentTypeManager.extractCategory(entry, contentType);

    return {
      id: `${contentType}_${uid}_${locale}`,
      uid,
      title,
      snippet,
      url,
      content_type: contentType,
      locale,
      updated_at: updatedAt,
      tags,
      category,
      raw_data: entry, // Keep original data for reference
    };
  }

  /**
   * Extract title from entry (tries multiple common field names)
   */
  extractTitle(entry) {
    const titleFields = ["title", "name", "heading", "display_name", "label"];

    for (const field of titleFields) {
      if (entry[field]) {
        return typeof entry[field] === "string"
          ? entry[field]
          : entry[field].toString();
      }
    }

    return entry.uid || "Untitled";
  }

  /**
   * Extract snippet/description from entry
   */
  extractSnippet(entry) {
    const snippetFields = [
      "description",
      "snippet",
      "summary",
      "excerpt",
      "content",
      "body",
    ];

    for (const field of snippetFields) {
      if (entry[field]) {
        let text = entry[field];

        // Handle rich text fields
        if (typeof text === "object" && text.json) {
          text = this.extractTextFromRichText(text);
        } else if (typeof text === "object") {
          text = JSON.stringify(text);
        }

        // Truncate to reasonable length
        return this.truncateText(text.toString(), 500);
      }
    }

    return "No description available";
  }

  /**
   * Extract tags from entry
   */
  extractTags(entry) {
    const tagFields = ["tag", "keywords", "categories"];

    for (const field of tagFields) {
      if (entry[field]) {
        if (Array.isArray(entry[field])) {
          return entry[field].map((tag) =>
            typeof tag === "string"
              ? tag
              : tag.title || tag.name || tag.toString()
          );
        } else if (typeof entry[field] === "string") {
          return entry[field].split(",").map((tag) => tag.trim());
        }
      }
    }

    return [];
  }

  /**
   * Extract category from entry
   */
  extractCategory(entry) {
    const categoryFields = ["category", "type", "section"];

    for (const field of categoryFields) {
      if (entry[field]) {
        return typeof entry[field] === "string"
          ? entry[field]
          : entry[field].title || entry[field].name || entry[field].toString();
      }
    }

    return null;
  }

  /**
   * Extract plain text from Contentstack rich text format
   */
  extractTextFromRichText(richText) {
    try {
      if (!richText.json || !richText.json.children) {
        return "";
      }

      const extractText = (nodes) => {
        let text = "";
        for (const node of nodes) {
          if (node.type === "text") {
            text += node.text;
          } else if (node.children) {
            text += extractText(node.children);
          }
        }
        return text;
      };

      return extractText(richText.json.children);
    } catch (error) {
      logger.warn("Failed to extract text from rich text:", error);
      return "";
    }
  }

  /**
   * Generate URL for entry (customize based on your URL structure)
   */
  generateUrl(entry, contentType) {
    // This is a basic implementation - customize based on your URL structure
    const baseUrl = process.env.CONTENT_BASE_URL || "https://example.com";
    const slug = entry.url || entry.slug || entry.uid;

    return `${baseUrl}/${contentType}/${slug}`;
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Utility function to add delay
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is retryable using the retry utility
   * @param {Error} error - The error to check
   * @returns {boolean} - True if the error should be retried
   */
  isRetryableError(error) {
    return isRetryableError(error);
  }

  /**
   * Categorize an error using the retry utility
   * @param {Error} error - The error to categorize
   * @returns {string} - The error category
   */
  categorizeError(error) {
    return categorizeError(error);
  }

  /**
   * Formats a Contentstack SDK error into a more readable string with enhanced error handling
   */
  formatContentstackError(error) {
    const errorCategory = categorizeError(error);
    let formattedMessage = "";
    let errorCode = "";
    let status = "";
    let details = "";

    // Handle structured ContentStack error objects
    if (error.error_message) {
      formattedMessage = error.error_message;
      errorCode = error.error_code || "UNKNOWN";
      status = error.status || error.statusCode || "UNKNOWN";

      if (error.errors && Array.isArray(error.errors)) {
        details = ` Details: ${error.errors
          .map((e) => e.message || e)
          .join(", ")}`;
      } else if (error.errors) {
        details = ` Details: ${JSON.stringify(error.errors)}`;
      }
    }
    // Handle SDK response errors with nested error structure
    else if (error.response && error.response.data) {
      const responseData = error.response.data;
      if (responseData.error_message) {
        formattedMessage = responseData.error_message;
        errorCode = responseData.error_code || "UNKNOWN";
        status = error.response.status || "UNKNOWN";

        if (responseData.errors) {
          details = ` Details: ${JSON.stringify(responseData.errors)}`;
        }
      } else {
        formattedMessage = responseData.message || "Unknown API error";
        status = error.response.status || "UNKNOWN";
      }
    }
    // Handle HTTP errors with status codes
    else if (error.status || error.statusCode) {
      status = error.status || error.statusCode;
      formattedMessage = error.message || `HTTP ${status} error`;

      // Add specific messages for common HTTP errors
      switch (status) {
        case 401:
          formattedMessage =
            "Authentication failed - check API key and delivery token";
          break;
        case 403:
          formattedMessage =
            "Access forbidden - check permissions and environment settings";
          break;
        case 404:
          formattedMessage =
            "Resource not found - check content type or entry ID";
          break;
        case 429:
          formattedMessage = "Rate limit exceeded - too many requests";
          break;
        case 500:
          formattedMessage =
            "Internal server error - ContentStack service issue";
          break;
        case 502:
          formattedMessage =
            "Bad gateway - ContentStack service temporarily unavailable";
          break;
        case 503:
          formattedMessage =
            "Service unavailable - ContentStack maintenance or overload";
          break;
        case 504:
          formattedMessage = "Gateway timeout - ContentStack service timeout";
          break;
      }
    }
    // Handle string error messages that might be JSON
    else if (typeof error.message === "string") {
      try {
        const parsedError = JSON.parse(error.message);
        if (parsedError.error_message) {
          formattedMessage = parsedError.error_message;
          errorCode = parsedError.error_code || "UNKNOWN";
          status = parsedError.statusText || parsedError.status || "UNKNOWN";

          if (parsedError.errors) {
            details = ` Details: ${JSON.stringify(parsedError.errors)}`;
          }
        } else {
          formattedMessage = error.message;
        }
      } catch (e) {
        // Not a JSON string, use the original message
        formattedMessage = error.message;
      }
    }
    // Handle network and connection errors
    else if (error.code) {
      switch (error.code) {
        case "ECONNRESET":
          formattedMessage = "Connection reset by server";
          break;
        case "ENOTFOUND":
          formattedMessage =
            "DNS lookup failed - check ContentStack region/host settings";
          break;
        case "ETIMEDOUT":
          formattedMessage =
            "Request timeout - ContentStack service may be slow";
          break;
        case "ECONNREFUSED":
          formattedMessage =
            "Connection refused - ContentStack service unavailable";
          break;
        default:
          formattedMessage = error.message || `Network error: ${error.code}`;
      }
      errorCode = error.code;
    }
    // Fallback for unknown error formats
    else {
      formattedMessage = error.message || "Unknown ContentStack error";
      if (typeof error === "object") {
        try {
          details = ` Raw error: ${JSON.stringify(error, null, 2)}`;
        } catch (e) {
          details = ` Raw error: ${error.toString()}`;
        }
      }
    }

    // Build the final formatted message
    let result = formattedMessage;

    if (errorCode && errorCode !== "UNKNOWN") {
      result += ` (Code: ${errorCode})`;
    }

    if (status && status !== "UNKNOWN") {
      result += ` (Status: ${status})`;
    }

    result += ` [Category: ${errorCategory}]`;

    if (details) {
      result += details;
    }

    return result;
  }

  /**
   * Get content statistics with retry logic
   */
  async getContentStats(locale = "en-us") {
    return performanceMonitor.timeOperation(
      "getContentStats",
      async () => {
        return withRetry(
          async () => {
            try {
              const contentTypes = await this.getContentTypes();
              const stats = {
                contentTypes: contentTypes.length,
                totalEntries: 0,
                entriesByType: {},
                locale,
                timestamp: new Date().toISOString(),
              };

              logger.info(
                `📊 Getting content statistics for ${contentTypes.length} content types`,
                { locale }
              );

              for (const contentType of contentTypes) {
                try {
                  const result = await this.getEntriesByContentType(
                    contentType.uid,
                    locale,
                    1, // Only fetch 1 entry to get count
                    0
                  );
                  const count = result.count || 0;
                  stats.entriesByType[contentType.uid] = count;
                  stats.totalEntries += count;

                  logger.debug(
                    `Content type ${contentType.uid}: ${count} entries`
                  );
                } catch (error) {
                  const errorCategory = categorizeError(error);
                  logger.logError(
                    "getContentStats_contentType",
                    error,
                    errorCategory
                  );
                  logger.warn(`Failed to get count for ${contentType.uid}:`, {
                    error: error.message,
                    errorCategory,
                  });
                  stats.entriesByType[contentType.uid] = 0;
                }
              }

              logger.info(`📊 Content statistics completed`, {
                totalEntries: stats.totalEntries,
                contentTypes: stats.contentTypes,
                locale,
                averageEntriesPerType: Math.round(
                  stats.totalEntries / stats.contentTypes
                ),
                topContentTypes: Object.entries(stats.entriesByType)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([type, count]) => `${type}: ${count}`),
              });
              return stats;
            } catch (error) {
              const errorMessage = this.formatContentstackError(error);
              const errorCategory = categorizeError(error);

              logger.logError("getContentStats", error, errorCategory);
              logger.error("Failed to get content stats:", {
                originalError: error,
                formattedMessage: errorMessage,
                errorCategory,
                locale,
              });
              throw new Error(`Contentstack API error: ${errorMessage}`);
            }
          },
          {
            maxRetries: config.contentstack.retryLimit || 3,
            baseDelay: config.contentstack.retryDelay || 1000,
            shouldRetry: isRetryableError,
          }
        );
      },
      { locale }
    );
  }

  /**
   * Get performance metrics for monitoring
   */
  getPerformanceMetrics() {
    return performanceMonitor.getPerformanceSummary();
  }

  /**
   * Get active operations for monitoring
   */
  getActiveOperations() {
    return performanceMonitor.getActiveOperations();
  }
}

module.exports = new ContentstackService();
