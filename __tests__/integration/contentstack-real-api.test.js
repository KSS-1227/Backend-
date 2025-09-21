/**
 * Real ContentStack API Integration Tests
 * These tests call the actual ContentStack API to verify the SDK integration works correctly
 * with real data and different environments.
 *
 * NOTE: These tests require valid ContentStack credentials in environment variables.
 * They are designed to be run against a test/development ContentStack environment.
 */

const ContentstackService = require("../../services/contentstack");
const contentSyncJob = require("../../jobs/syncContent");
const config = require("../../utils/config");
const logger = require("../../utils/logger");

// Skip these tests if no real ContentStack credentials are provided
const hasCredentials =
  config.contentstack.apiKey &&
  config.contentstack.deliveryToken &&
  config.contentstack.apiKey !== "test-api-key" &&
  config.contentstack.deliveryToken !== "test-delivery-token";

const describeIf = hasCredentials ? describe : describe.skip;

describeIf("ContentStack Real API Integration Tests", () => {
  let contentstackService;

  beforeAll(() => {
    // Initialize service with real credentials
    contentstackService = new ContentstackService();

    // Log test environment info
    console.log("Running integration tests with:");
    console.log(`- Environment: ${config.contentstack.environment}`);
    console.log(`- Region: ${config.contentstack.region}`);
    console.log(`- API Key: ${config.contentstack.apiKey.substring(0, 8)}...`);
  });

  beforeEach(() => {
    // Clear any previous logs
    jest.clearAllMocks();
  });

  describe("ContentStack API Connection and Authentication", () => {
    it("should successfully connect to ContentStack API", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      expect(Array.isArray(contentTypes)).toBe(true);
      expect(contentTypes.length).toBeGreaterThan(0);

      // Verify content type structure
      contentTypes.forEach((contentType) => {
        expect(contentType).toHaveProperty("uid");
        expect(contentType).toHaveProperty("title");
        expect(typeof contentType.uid).toBe("string");
        expect(typeof contentType.title).toBe("string");
      });

      console.log(
        `✅ Found ${contentTypes.length} content types:`,
        contentTypes.map((ct) => ct.uid).join(", ")
      );
    }, 30000);

    it("should handle different environments correctly", async () => {
      // Test that the service respects the configured environment
      const contentTypes = await contentstackService.getContentTypes();

      expect(contentTypes).toBeDefined();
      expect(Array.isArray(contentTypes)).toBe(true);

      // Log environment-specific info
      console.log(
        `Environment ${config.contentstack.environment} has ${contentTypes.length} content types`
      );
    }, 30000);

    it("should validate API credentials and permissions", async () => {
      // This test verifies that the credentials have proper read permissions
      try {
        const contentTypes = await contentstackService.getContentTypes();
        expect(contentTypes).toBeDefined();

        // Try to fetch entries from the first content type to verify read permissions
        if (contentTypes.length > 0) {
          const firstContentType = contentTypes[0].uid;
          const result = await contentstackService.getEntriesByContentType(
            firstContentType,
            "en-us",
            5,
            0
          );

          expect(result).toHaveProperty("entries");
          expect(result).toHaveProperty("count");
          expect(Array.isArray(result.entries)).toBe(true);

          console.log(
            `✅ Successfully accessed entries for content type: ${firstContentType}`
          );
        }
      } catch (error) {
        if (
          error.message.includes("401") ||
          error.message.includes("Unauthorized")
        ) {
          throw new Error(
            "API credentials are invalid or lack proper permissions"
          );
        }
        throw error;
      }
    }, 30000);
  });

  describe("Content Type Fetching Across Environments", () => {
    it("should fetch content types with proper structure", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      expect(contentTypes.length).toBeGreaterThan(0);

      // Verify each content type has required properties
      contentTypes.forEach((contentType, index) => {
        expect(contentType.uid).toBeDefined();
        expect(contentType.title).toBeDefined();
        expect(typeof contentType.uid).toBe("string");
        expect(typeof contentType.title).toBe("string");
        expect(contentType.uid.length).toBeGreaterThan(0);

        console.log(
          `Content Type ${index + 1}: ${contentType.uid} - ${contentType.title}`
        );
      });
    }, 30000);

    it("should handle different content types consistently", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      // Test fetching entries from multiple content types
      const testResults = [];
      const maxContentTypesToTest = Math.min(3, contentTypes.length);

      for (let i = 0; i < maxContentTypesToTest; i++) {
        const contentType = contentTypes[i];

        try {
          const result = await contentstackService.getEntriesByContentType(
            contentType.uid,
            "en-us",
            10,
            0
          );

          testResults.push({
            contentType: contentType.uid,
            success: true,
            entryCount: result.entries.length,
            totalCount: result.count,
          });

          // Verify response structure
          expect(result).toHaveProperty("entries");
          expect(result).toHaveProperty("count");
          expect(Array.isArray(result.entries)).toBe(true);
          expect(typeof result.count).toBe("number");
        } catch (error) {
          testResults.push({
            contentType: contentType.uid,
            success: false,
            error: error.message,
          });
        }
      }

      // Log results
      console.log("Content type fetch results:", testResults);

      // At least one content type should work
      const successfulFetches = testResults.filter((r) => r.success);
      expect(successfulFetches.length).toBeGreaterThan(0);
    }, 60000);

    it("should work with different locales if configured", async () => {
      const configuredLocales = config.contentstack.locales || ["en-us"];
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for locale testing");
        return;
      }

      const firstContentType = contentTypes[0].uid;
      const localeResults = [];

      // Test first few locales
      const localesToTest = configuredLocales.slice(0, 2);

      for (const locale of localesToTest) {
        try {
          const result = await contentstackService.getEntriesByContentType(
            firstContentType,
            locale,
            5,
            0
          );

          localeResults.push({
            locale,
            success: true,
            entryCount: result.entries.length,
          });

          // Verify entries have locale information
          result.entries.forEach((entry) => {
            expect(entry).toBeDefined();
            // Entry should have some content
            expect(Object.keys(entry).length).toBeGreaterThan(0);
          });
        } catch (error) {
          localeResults.push({
            locale,
            success: false,
            error: error.message,
          });
        }
      }

      console.log("Locale test results:", localeResults);

      // At least the default locale should work
      const defaultLocaleResult = localeResults.find(
        (r) => r.locale === "en-us"
      );
      if (defaultLocaleResult) {
        expect(defaultLocaleResult.success).toBe(true);
      }
    }, 45000);
  });

  describe("Pagination Functionality with Real Data", () => {
    it("should handle pagination correctly with real content", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for pagination testing");
        return;
      }

      // Find a content type with enough entries for pagination testing
      let testContentType = null;
      let totalEntries = 0;

      for (const contentType of contentTypes.slice(0, 3)) {
        try {
          const result = await contentstackService.getEntriesByContentType(
            contentType.uid,
            "en-us",
            1,
            0
          );

          if (result.count > 5) {
            // Need at least 5 entries for meaningful pagination test
            testContentType = contentType.uid;
            totalEntries = result.count;
            break;
          }
        } catch (error) {
          console.log(
            `Skipping ${contentType.uid} due to error:`,
            error.message
          );
        }
      }

      if (!testContentType) {
        console.log(
          "No content type with sufficient entries found for pagination test"
        );
        return;
      }

      console.log(
        `Testing pagination with content type: ${testContentType} (${totalEntries} total entries)`
      );

      // Test pagination with small page size
      const pageSize = 3;
      const maxPages = Math.min(3, Math.ceil(totalEntries / pageSize));

      const allFetchedEntries = [];
      const entryIds = new Set();

      for (let page = 0; page < maxPages; page++) {
        const skip = page * pageSize;

        const result = await contentstackService.getEntriesByContentType(
          testContentType,
          "en-us",
          pageSize,
          skip
        );

        expect(result).toHaveProperty("entries");
        expect(result).toHaveProperty("count");
        expect(result.count).toBe(totalEntries); // Total count should be consistent

        // Verify we got the expected number of entries (or remaining entries)
        const expectedEntries = Math.min(pageSize, totalEntries - skip);
        expect(result.entries.length).toBeLessThanOrEqual(expectedEntries);

        // Verify no duplicate entries across pages
        result.entries.forEach((entry) => {
          expect(entryIds.has(entry.uid)).toBe(false);
          entryIds.add(entry.uid);
          allFetchedEntries.push(entry);
        });

        console.log(
          `Page ${page + 1}: ${result.entries.length} entries (skip: ${skip})`
        );
      }

      expect(allFetchedEntries.length).toBeGreaterThan(0);
      expect(entryIds.size).toBe(allFetchedEntries.length); // No duplicates

      console.log(
        `✅ Pagination test completed: ${allFetchedEntries.length} unique entries fetched`
      );
    }, 60000);

    it("should handle large batch sizes correctly", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for batch size testing");
        return;
      }

      const firstContentType = contentTypes[0].uid;

      // Test with different batch sizes
      const batchSizes = [1, 10, 50, 100];

      for (const batchSize of batchSizes) {
        try {
          const result = await contentstackService.getEntriesByContentType(
            firstContentType,
            "en-us",
            batchSize,
            0
          );

          expect(result).toHaveProperty("entries");
          expect(result).toHaveProperty("count");
          expect(Array.isArray(result.entries)).toBe(true);
          expect(result.entries.length).toBeLessThanOrEqual(batchSize);

          console.log(
            `Batch size ${batchSize}: ${result.entries.length} entries returned`
          );
        } catch (error) {
          console.log(`Batch size ${batchSize} failed:`, error.message);
          // Large batch sizes might fail due to API limits, which is acceptable
          if (batchSize <= 50) {
            throw error; // Small batch sizes should work
          }
        }
      }
    }, 45000);

    it("should handle edge cases in pagination", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for edge case testing");
        return;
      }

      const firstContentType = contentTypes[0].uid;

      // Test edge case: skip beyond available entries
      const result = await contentstackService.getEntriesByContentType(
        firstContentType,
        "en-us",
        10,
        10000 // Very high skip value
      );

      expect(result).toHaveProperty("entries");
      expect(result).toHaveProperty("count");
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.entries.length).toBe(0); // Should return empty array

      console.log(
        "✅ Edge case test passed: high skip value returns empty results"
      );
    }, 30000);
  });

  describe("End-to-End Sync Job with Real ContentStack Content", () => {
    it("should complete full sync job successfully", async () => {
      // Mock the dependencies that we don't want to actually call
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      const originalProcessContentEntries =
        embeddingsService.processContentEntries;
      const originalBatchUpsertContentEntries =
        supabaseService.batchUpsertContentEntries;

      // Mock embeddings service to avoid OpenAI API calls
      embeddingsService.processContentEntries = jest
        .fn()
        .mockImplementation(async (entries) => {
          return entries.map((entry) => ({
            ...entry,
            embedding: new Array(1536).fill(0.1), // Mock embedding vector
          }));
        });

      // Mock Supabase service to avoid database writes
      supabaseService.batchUpsertContentEntries = jest.fn().mockResolvedValue({
        success: true,
        count: 0,
      });

      try {
        // Run the sync job
        await contentSyncJob.run();

        // Verify that the sync job completed without errors
        const status = contentSyncJob.getStatus();
        expect(status.lastRunStatus).toBe("success");
        expect(status.stats.successfulRuns).toBeGreaterThan(0);

        // Verify that embeddings service was called
        expect(embeddingsService.processContentEntries).toHaveBeenCalled();

        // Verify that Supabase service was called
        expect(supabaseService.batchUpsertContentEntries).toHaveBeenCalled();

        console.log("✅ End-to-end sync job completed successfully");
        console.log("Sync status:", status);
      } finally {
        // Restore original functions
        embeddingsService.processContentEntries = originalProcessContentEntries;
        supabaseService.batchUpsertContentEntries =
          originalBatchUpsertContentEntries;
      }
    }, 120000);

    it("should handle selective content type sync", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for selective sync testing");
        return;
      }

      // Mock dependencies
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      const originalProcessContentEntries =
        embeddingsService.processContentEntries;
      const originalBatchUpsertContentEntries =
        supabaseService.batchUpsertContentEntries;

      embeddingsService.processContentEntries = jest
        .fn()
        .mockImplementation(async (entries) => {
          return entries.map((entry) => ({
            ...entry,
            embedding: new Array(1536).fill(0.1),
          }));
        });

      supabaseService.batchUpsertContentEntries = jest.fn().mockResolvedValue({
        success: true,
        count: 0,
      });

      try {
        // Test selective sync with first content type
        const testContentTypes = [contentTypes[0].uid];

        await contentSyncJob.syncContentTypes(testContentTypes);

        // Verify that the sync completed
        const status = contentSyncJob.getStatus();
        expect(status.isRunning).toBe(false);

        console.log(
          `✅ Selective sync completed for content types: ${testContentTypes.join(
            ", "
          )}`
        );
      } finally {
        // Restore original functions
        embeddingsService.processContentEntries = originalProcessContentEntries;
        supabaseService.batchUpsertContentEntries =
          originalBatchUpsertContentEntries;
      }
    }, 90000);

    it("should validate content integrity during sync", async () => {
      // Test the content validation functionality
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for validation testing");
        return;
      }

      // Fetch some real content for validation
      const firstContentType = contentTypes[0].uid;
      const result = await contentstackService.getEntriesByContentType(
        firstContentType,
        "en-us",
        5,
        0
      );

      const entries = result.entries.map((entry) =>
        contentstackService.transformEntry(entry, firstContentType, "en-us")
      );

      // Test content validation
      const isValid = contentSyncJob.validateContentResponse(entries);
      expect(isValid).toBe(true);

      // Test with invalid content
      const invalidEntries = [null, undefined, {}, { id: "test" }];
      const isInvalid = contentSyncJob.validateContentResponse(invalidEntries);
      expect(isInvalid).toBe(false);

      console.log("✅ Content validation tests passed");
    }, 30000);

    it("should handle sync job error scenarios gracefully", async () => {
      // Test error handling by temporarily breaking the ContentStack service
      const originalGetAllEntries = contentstackService.getAllEntries;

      // Mock a failure
      contentstackService.getAllEntries = jest
        .fn()
        .mockRejectedValue(new Error("Simulated API failure"));

      try {
        await contentSyncJob.run();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toContain("Simulated API failure");

        // Verify error was logged and status updated
        const status = contentSyncJob.getStatus();
        expect(status.lastRunStatus).toBe("error");
        expect(status.stats.lastError).toBeDefined();
        expect(status.stats.lastError.message).toContain(
          "Simulated API failure"
        );

        console.log("✅ Error handling test passed");
      } finally {
        // Restore original function
        contentstackService.getAllEntries = originalGetAllEntries;
      }
    }, 30000);
  });

  describe("Performance and Reliability Tests", () => {
    it("should handle concurrent requests without issues", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for concurrency testing");
        return;
      }

      // Make multiple concurrent requests
      const concurrentRequests = Math.min(3, contentTypes.length);
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const contentType = contentTypes[i].uid;
        const promise = contentstackService.getEntriesByContentType(
          contentType,
          "en-us",
          5,
          0
        );
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      // Verify all requests succeeded
      results.forEach((result, index) => {
        expect(result).toHaveProperty("entries");
        expect(result).toHaveProperty("count");
        expect(Array.isArray(result.entries)).toBe(true);

        console.log(
          `Concurrent request ${index + 1}: ${result.entries.length} entries`
        );
      });

      console.log("✅ Concurrency test passed");
    }, 45000);

    it("should respect rate limits and retry appropriately", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for rate limit testing");
        return;
      }

      // Make rapid sequential requests to test rate limiting
      const rapidRequests = 5;
      const results = [];
      const startTime = Date.now();

      for (let i = 0; i < rapidRequests; i++) {
        try {
          const result = await contentstackService.getEntriesByContentType(
            contentTypes[0].uid,
            "en-us",
            1,
            i
          );
          results.push({ success: true, entries: result.entries.length });
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }

      const duration = Date.now() - startTime;

      // At least some requests should succeed
      const successfulRequests = results.filter((r) => r.success).length;
      expect(successfulRequests).toBeGreaterThan(0);

      console.log(
        `Rate limit test: ${successfulRequests}/${rapidRequests} requests succeeded in ${duration}ms`
      );
      console.log("Results:", results);
    }, 60000);

    it("should handle large content volumes efficiently", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for volume testing");
        return;
      }

      // Find content type with most entries
      let largestContentType = null;
      let maxEntries = 0;

      for (const contentType of contentTypes.slice(0, 3)) {
        try {
          const result = await contentstackService.getEntriesByContentType(
            contentType.uid,
            "en-us",
            1,
            0
          );

          if (result.count > maxEntries) {
            maxEntries = result.count;
            largestContentType = contentType.uid;
          }
        } catch (error) {
          console.log(`Skipping ${contentType.uid}:`, error.message);
        }
      }

      if (!largestContentType || maxEntries < 10) {
        console.log(
          "No content type with sufficient entries for volume testing"
        );
        return;
      }

      console.log(`Testing with ${largestContentType} (${maxEntries} entries)`);

      // Test fetching larger batches
      const startTime = Date.now();
      const batchSize = Math.min(50, maxEntries);

      const result = await contentstackService.getEntriesByContentType(
        largestContentType,
        "en-us",
        batchSize,
        0
      );

      const duration = Date.now() - startTime;

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries.length).toBeLessThanOrEqual(batchSize);

      console.log(
        `✅ Volume test: ${result.entries.length} entries fetched in ${duration}ms`
      );

      // Performance check: should complete within reasonable time
      expect(duration).toBeLessThan(30000); // 30 seconds max
    }, 45000);
  });

  describe("Multi-locale Content Testing", () => {
    it("should handle multi-locale content correctly", async () => {
      const configuredLocales = config.contentstack.locales || ["en-us"];
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0 || configuredLocales.length <= 1) {
        console.log(
          "Insufficient content types or locales for multi-locale testing"
        );
        return;
      }

      const testContentType = contentTypes[0].uid;
      const localeResults = {};

      // Test each configured locale
      for (const locale of configuredLocales.slice(0, 3)) {
        // Test max 3 locales
        try {
          const result = await contentstackService.getEntriesByContentType(
            testContentType,
            locale,
            5,
            0
          );

          localeResults[locale] = {
            success: true,
            entryCount: result.entries.length,
            totalCount: result.count,
          };

          // Verify entries are properly localized
          result.entries.forEach((entry) => {
            expect(entry).toBeDefined();
            expect(typeof entry).toBe("object");
          });
        } catch (error) {
          localeResults[locale] = {
            success: false,
            error: error.message,
          };
        }
      }

      console.log("Multi-locale test results:", localeResults);

      // At least the default locale should work
      expect(localeResults["en-us"]).toBeDefined();
      if (localeResults["en-us"]) {
        expect(localeResults["en-us"].success).toBe(true);
      }
    }, 60000);

    it("should transform entries correctly for different locales", async () => {
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for transformation testing");
        return;
      }

      const testContentType = contentTypes[0].uid;
      const result = await contentstackService.getEntriesByContentType(
        testContentType,
        "en-us",
        3,
        0
      );

      if (result.entries.length === 0) {
        console.log("No entries available for transformation testing");
        return;
      }

      // Test transformation
      const transformedEntries = result.entries.map((entry) =>
        contentstackService.transformEntry(entry, testContentType, "en-us")
      );

      transformedEntries.forEach((transformed) => {
        expect(transformed).toHaveProperty("id");
        expect(transformed).toHaveProperty("content_type");
        expect(transformed).toHaveProperty("locale");
        expect(transformed).toHaveProperty("raw_data");

        expect(transformed.content_type).toBe(testContentType);
        expect(transformed.locale).toBe("en-us");
        expect(transformed.id).toContain(testContentType);
        expect(transformed.id).toContain("en-us");
      });

      console.log(
        `✅ Transformation test passed for ${transformedEntries.length} entries`
      );
    }, 30000);
  });
});

// Helper function to check if integration tests should run
function shouldRunIntegrationTests() {
  return hasCredentials;
}

// Export for use in other test files
module.exports = {
  shouldRunIntegrationTests,
  hasCredentials,
};
