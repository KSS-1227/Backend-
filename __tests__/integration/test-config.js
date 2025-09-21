/**
 * Integration Test Configuration
 * Manages settings and utilities for integration tests
 */

const config = require("../../utils/config");

// Check if real ContentStack credentials are available
const hasRealCredentials =
  config.contentstack.apiKey &&
  config.contentstack.deliveryToken &&
  config.contentstack.apiKey !== "test-api-key" &&
  config.contentstack.deliveryToken !== "test-delivery-token" &&
  config.contentstack.apiKey.length > 10 &&
  config.contentstack.deliveryToken.length > 10;

// Test environment configuration
const testConfig = {
  // Credentials check
  hasRealCredentials,

  // Test timeouts (in milliseconds)
  timeouts: {
    short: 30000, // 30 seconds
    medium: 60000, // 1 minute
    long: 120000, // 2 minutes
    extended: 300000, // 5 minutes
  },

  // Test data limits
  limits: {
    maxContentTypesToTest: 3,
    maxLocalesPerTest: 3,
    maxEntriesPerBatch: 50,
    maxConcurrentRequests: 5,
  },

  // ContentStack environment info
  environment: {
    apiKey: config.contentstack.apiKey,
    environment: config.contentstack.environment,
    region: config.contentstack.region,
    locales: config.contentstack.locales || ["en-us"],
  },

  // Test categories
  categories: {
    CONNECTION: "connection",
    PAGINATION: "pagination",
    SYNC: "sync",
    PERFORMANCE: "performance",
    MULTI_LOCALE: "multi-locale",
    ERROR_HANDLING: "error-handling",
  },
};

/**
 * Utility functions for integration tests
 */
const testUtils = {
  /**
   * Skip test if no real credentials
   */
  skipIfNoCredentials: (testFn) => {
    return hasRealCredentials ? testFn : testFn.skip;
  },

  /**
   * Log test environment info
   */
  logEnvironmentInfo: () => {
    if (hasRealCredentials) {
      console.log("\n=== Integration Test Environment ===");
      console.log(`Environment: ${testConfig.environment.environment}`);
      console.log(`Region: ${testConfig.environment.region}`);
      console.log(
        `API Key: ${testConfig.environment.apiKey.substring(0, 8)}...`
      );
      console.log(`Locales: ${testConfig.environment.locales.join(", ")}`);
      console.log("=====================================\n");
    } else {
      console.log("\n=== Integration Tests Skipped ===");
      console.log("Reason: No real ContentStack credentials found");
      console.log("To run integration tests, set:");
      console.log("- CONTENTSTACK_API_KEY");
      console.log("- CONTENTSTACK_DELIVERY_TOKEN");
      console.log("- CONTENTSTACK_ENVIRONMENT");
      console.log("==================================\n");
    }
  },

  /**
   * Create test data validator
   */
  createValidator: () => ({
    validateContentType: (contentType) => {
      expect(contentType).toHaveProperty("uid");
      expect(contentType).toHaveProperty("title");
      expect(typeof contentType.uid).toBe("string");
      expect(typeof contentType.title).toBe("string");
      expect(contentType.uid.length).toBeGreaterThan(0);
    },

    validateEntry: (entry) => {
      expect(entry).toBeDefined();
      expect(typeof entry).toBe("object");
      expect(entry).toHaveProperty("uid");
      expect(typeof entry.uid).toBe("string");
    },

    validateTransformedEntry: (entry) => {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("content_type");
      expect(entry).toHaveProperty("locale");
      expect(entry).toHaveProperty("raw_data");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.content_type).toBe("string");
      expect(typeof entry.locale).toBe("string");
      expect(typeof entry.raw_data).toBe("object");
    },

    validateApiResponse: (response) => {
      expect(response).toHaveProperty("entries");
      expect(response).toHaveProperty("count");
      expect(Array.isArray(response.entries)).toBe(true);
      expect(typeof response.count).toBe("number");
    },
  }),

  /**
   * Performance measurement utilities
   */
  performance: {
    measure: async (name, operation) => {
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;

      console.log(`⏱️  ${name}: ${duration}ms`);

      return { result, duration };
    },

    expectWithinTime: (duration, maxTime, operation = "Operation") => {
      expect(duration).toBeLessThan(maxTime);
      console.log(
        `✅ ${operation} completed within ${maxTime}ms (actual: ${duration}ms)`
      );
    },
  },

  /**
   * Mock service utilities
   */
  mocks: {
    createEmbeddingsMock: () => {
      return jest.fn().mockImplementation(async (entries) => {
        // Simulate processing time
        await new Promise((resolve) => setTimeout(resolve, 10));

        return entries.map((entry, index) => ({
          ...entry,
          embedding: new Array(1536).fill(0.1 + index * 0.01),
          processed_at: new Date().toISOString(),
        }));
      });
    },

    createSupabaseMock: () => {
      return jest.fn().mockImplementation(async (entries) => {
        // Simulate database operation time
        await new Promise((resolve) => setTimeout(resolve, 5));

        return {
          success: true,
          count: entries.length,
          inserted: entries.length,
          updated: 0,
          errors: [],
        };
      });
    },
  },

  /**
   * Test data generators
   */
  generators: {
    createMockEntry: (uid, contentType, locale = "en-us") => ({
      uid,
      title: `Test Entry ${uid}`,
      content_type: contentType,
      locale,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),

    createMockContentType: (uid, title) => ({
      uid,
      title: title || `Test Content Type ${uid}`,
      description: `Description for ${uid}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  },

  /**
   * Error simulation utilities
   */
  errors: {
    createNetworkError: (message = "Network timeout") => {
      const error = new Error(message);
      error.code = "ETIMEDOUT";
      error.errno = "ETIMEDOUT";
      return error;
    },

    createAuthError: (message = "Unauthorized") => {
      const error = new Error(message);
      error.status = 401;
      error.statusCode = 401;
      return error;
    },

    createRateLimitError: (message = "Rate limit exceeded") => {
      const error = new Error(message);
      error.status = 429;
      error.statusCode = 429;
      return error;
    },

    createServerError: (message = "Internal server error") => {
      const error = new Error(message);
      error.status = 500;
      error.statusCode = 500;
      return error;
    },
  },
};

/**
 * Test suite helpers
 */
const suiteHelpers = {
  /**
   * Setup for integration tests
   */
  setupIntegrationTest: () => {
    beforeAll(() => {
      testUtils.logEnvironmentInfo();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });
  },

  /**
   * Setup for sync job tests
   */
  setupSyncJobTest: () => {
    let originalEmbeddingsService;
    let originalSupabaseService;

    beforeAll(() => {
      testUtils.logEnvironmentInfo();

      // Store original services
      originalEmbeddingsService = require("../../services/embeddings");
      originalSupabaseService = require("../../services/supabase");
    });

    beforeEach(() => {
      jest.clearAllMocks();

      // Setup mocks
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      embeddingsService.processContentEntries =
        testUtils.mocks.createEmbeddingsMock();
      supabaseService.batchUpsertContentEntries =
        testUtils.mocks.createSupabaseMock();
    });

    afterEach(() => {
      // Reset sync job state
      const contentSyncJob = require("../../jobs/syncContent");
      if (contentSyncJob.isRunning) {
        contentSyncJob.isRunning = false;
      }
    });

    return { originalEmbeddingsService, originalSupabaseService };
  },
};

module.exports = {
  testConfig,
  testUtils,
  suiteHelpers,
  hasRealCredentials,
};
