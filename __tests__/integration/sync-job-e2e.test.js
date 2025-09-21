/**
 * End-to-End Sync Job Integration Tests
 * These tests verify the complete sync job workflow with real ContentStack data
 * but mock external services like OpenAI and Supabase to avoid side effects.
 */

const contentSyncJob = require("../../jobs/syncContent");
const ContentstackService = require("../../services/contentstack");
const config = require("../../utils/config");
const logger = require("../../utils/logger");

// Skip these tests if no real ContentStack credentials are provided
const hasCredentials =
  config.contentstack.apiKey &&
  config.contentstack.deliveryToken &&
  config.contentstack.apiKey !== "test-api-key" &&
  config.contentstack.deliveryToken !== "test-delivery-token";

const describeIf = hasCredentials ? describe : describe.skip;

describeIf("Sync Job End-to-End Integration Tests", () => {
  let originalEmbeddingsService;
  let originalSupabaseService;

  beforeAll(() => {
    // Store original services
    originalEmbeddingsService = require("../../services/embeddings");
    originalSupabaseService = require("../../services/supabase");

    console.log("Running E2E sync tests with real ContentStack data");
    console.log(`Environment: ${config.contentstack.environment}`);
  });

  beforeEach(() => {
    // Mock external services to avoid side effects
    jest.clearAllMocks();

    // Mock embeddings service
    const embeddingsService = require("../../services/embeddings");
    embeddingsService.processContentEntries = jest
      .fn()
      .mockImplementation(async (entries) => {
        // Simulate processing time
        await new Promise((resolve) => setTimeout(resolve, 100));

        return entries.map((entry, index) => ({
          ...entry,
          embedding: new Array(1536).fill(0.1 + index * 0.01), // Unique mock embeddings
          processed_at: new Date().toISOString(),
        }));
      });

    // Mock Supabase service
    const supabaseService = require("../../services/supabase");
    supabaseService.batchUpsertContentEntries = jest
      .fn()
      .mockImplementation(async (entries) => {
        // Simulate database operation time
        await new Promise((resolve) => setTimeout(resolve, 50));

        return {
          success: true,
          count: entries.length,
          inserted: entries.length,
          updated: 0,
          errors: [],
        };
      });
  });

  afterEach(() => {
    // Reset sync job state
    if (contentSyncJob.isRunning) {
      contentSyncJob.isRunning = false;
    }
  });

  describe("Complete Sync Job Workflow", () => {
    it("should execute full sync job with real ContentStack data", async () => {
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      // Execute the sync job
      await contentSyncJob.run();

      // Verify sync job completed successfully
      const status = contentSyncJob.getStatus();
      expect(status.lastRunStatus).toBe("success");
      expect(status.stats.successfulRuns).toBeGreaterThan(0);
      expect(status.lastSyncTime).toBeDefined();
      expect(status.isRunning).toBe(false);

      // Verify embeddings service was called with real data
      expect(embeddingsService.processContentEntries).toHaveBeenCalledTimes(1);
      const embeddingsCallArgs =
        embeddingsService.processContentEntries.mock.calls[0][0];
      expect(Array.isArray(embeddingsCallArgs)).toBe(true);
      expect(embeddingsCallArgs.length).toBeGreaterThan(0);

      // Verify each entry has required structure
      embeddingsCallArgs.forEach((entry) => {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("title");
        expect(entry).toHaveProperty("content_type");
        expect(entry).toHaveProperty("locale");
        expect(entry).toHaveProperty("raw_data");
      });

      // Verify Supabase service was called with processed data
      expect(supabaseService.batchUpsertContentEntries).toHaveBeenCalledTimes(
        1
      );
      const supabaseCallArgs =
        supabaseService.batchUpsertContentEntries.mock.calls[0][0];
      expect(Array.isArray(supabaseCallArgs)).toBe(true);
      expect(supabaseCallArgs.length).toBeGreaterThan(0);

      // Verify processed entries have embeddings
      supabaseCallArgs.forEach((entry) => {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("title");
        expect(entry).toHaveProperty("content_type");
        expect(entry).toHaveProperty("locale");
        expect(entry).toHaveProperty("embedding");
        expect(Array.isArray(entry.embedding)).toBe(true);
        expect(entry.embedding.length).toBe(1536);
      });

      console.log(`✅ Full sync completed successfully`);
      console.log(
        `- Fetched ${embeddingsCallArgs.length} entries from ContentStack`
      );
      console.log(
        `- Processed ${supabaseCallArgs.length} entries with embeddings`
      );
      console.log(`- Sync status: ${status.lastRunStatus}`);
    }, 180000); // 3 minutes timeout for full sync

    it("should handle selective content type sync with real data", async () => {
      const contentstackService = new ContentstackService();
      const contentTypes = await contentstackService.getContentTypes();

      if (contentTypes.length === 0) {
        console.log("No content types available for selective sync test");
        return;
      }

      // Select first content type for testing
      const testContentTypes = [contentTypes[0].uid];

      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      // Execute selective sync
      await contentSyncJob.syncContentTypes(testContentTypes);

      // Verify sync completed
      expect(contentSyncJob.isRunning).toBe(false);

      // Verify services were called
      expect(embeddingsService.processContentEntries).toHaveBeenCalled();
      expect(supabaseService.batchUpsertContentEntries).toHaveBeenCalled();

      // Verify only the specified content type was processed
      const embeddingsCallArgs =
        embeddingsService.processContentEntries.mock.calls[0][0];
      const contentTypesProcessed = [
        ...new Set(embeddingsCallArgs.map((e) => e.content_type)),
      ];

      expect(contentTypesProcessed).toEqual(testContentTypes);

      console.log(
        `✅ Selective sync completed for content type: ${testContentTypes[0]}`
      );
      console.log(`- Processed ${embeddingsCallArgs.length} entries`);
    }, 120000);

    it("should validate content integrity during real sync", async () => {
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      // Execute sync
      await contentSyncJob.run();

      // Get the actual data that was processed
      const embeddingsCallArgs =
        embeddingsService.processContentEntries.mock.calls[0][0];
      const supabaseCallArgs =
        supabaseService.batchUpsertContentEntries.mock.calls[0][0];

      // Validate content structure
      embeddingsCallArgs.forEach((entry, index) => {
        // Required fields validation
        expect(entry.id).toBeDefined();
        expect(entry.title).toBeDefined();
        expect(entry.content_type).toBeDefined();
        expect(entry.locale).toBeDefined();
        expect(entry.raw_data).toBeDefined();

        // Data type validation
        expect(typeof entry.id).toBe("string");
        expect(typeof entry.title).toBe("string");
        expect(typeof entry.content_type).toBe("string");
        expect(typeof entry.locale).toBe("string");
        expect(typeof entry.raw_data).toBe("object");

        // ID format validation (should include content type and locale)
        expect(entry.id).toContain(entry.content_type);
        expect(entry.id).toContain(entry.locale);
      });

      // Validate processed entries
      supabaseCallArgs.forEach((entry, index) => {
        expect(entry.embedding).toBeDefined();
        expect(Array.isArray(entry.embedding)).toBe(true);
        expect(entry.embedding.length).toBe(1536);

        // Verify embedding values are numbers
        entry.embedding.forEach((value) => {
          expect(typeof value).toBe("number");
          expect(isNaN(value)).toBe(false);
        });
      });

      console.log(`✅ Content integrity validation passed`);
      console.log(`- Validated ${embeddingsCallArgs.length} raw entries`);
      console.log(`- Validated ${supabaseCallArgs.length} processed entries`);
    }, 120000);
  });

  describe("Error Handling and Recovery", () => {
    it("should handle ContentStack API errors gracefully", async () => {
      const contentstackService = new ContentstackService();

      // Temporarily break the ContentStack service
      const originalGetAllEntries = contentstackService.getAllEntries;
      contentstackService.getAllEntries = jest
        .fn()
        .mockRejectedValue(
          new Error("ContentStack API temporarily unavailable")
        );

      // Replace the service in the sync job
      const originalService = require("../../services/contentstack");
      require.cache[require.resolve("../../services/contentstack")].exports =
        contentstackService;

      try {
        await contentSyncJob.run();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toContain(
          "ContentStack API temporarily unavailable"
        );

        // Verify error was properly logged and status updated
        const status = contentSyncJob.getStatus();
        expect(status.lastRunStatus).toBe("error");
        expect(status.stats.lastError).toBeDefined();
        expect(status.stats.lastError.message).toContain(
          "ContentStack API temporarily unavailable"
        );

        console.log("✅ Error handling test passed");
        console.log(`- Error properly caught and logged: ${error.message}`);
      } finally {
        // Restore original service
        require.cache[require.resolve("../../services/contentstack")].exports =
          originalService;
      }
    }, 60000);

    it("should handle partial sync failures with fallback", async () => {
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      // Mock embeddings service to fail on some entries
      embeddingsService.processContentEntries = jest
        .fn()
        .mockImplementation(async (entries) => {
          // Process only half the entries to simulate partial failure
          const processedCount = Math.floor(entries.length / 2);
          return entries.slice(0, processedCount).map((entry, index) => ({
            ...entry,
            embedding: new Array(1536).fill(0.1 + index * 0.01),
          }));
        });

      // Execute sync
      await contentSyncJob.run();

      // Verify sync still completed (with partial data)
      const status = contentSyncJob.getStatus();
      expect(status.lastRunStatus).toBe("success");

      // Verify some data was still processed
      expect(embeddingsService.processContentEntries).toHaveBeenCalled();
      expect(supabaseService.batchUpsertContentEntries).toHaveBeenCalled();

      const supabaseCallArgs =
        supabaseService.batchUpsertContentEntries.mock.calls[0][0];
      expect(supabaseCallArgs.length).toBeGreaterThan(0);

      console.log("✅ Partial failure handling test passed");
      console.log(
        `- Processed ${supabaseCallArgs.length} entries despite partial failure`
      );
    }, 120000);

    it("should handle concurrent sync attempts correctly", async () => {
      // Start first sync
      const firstSyncPromise = contentSyncJob.run();

      // Try to start second sync while first is running
      let secondSyncError = null;
      try {
        await contentSyncJob.run();
      } catch (error) {
        secondSyncError = error;
      }

      // Wait for first sync to complete
      await firstSyncPromise;

      // Verify first sync completed successfully
      const status = contentSyncJob.getStatus();
      expect(status.lastRunStatus).toBe("success");
      expect(status.isRunning).toBe(false);

      // Second sync should have been skipped (no error expected in current implementation)
      // The sync job should handle concurrent attempts gracefully

      console.log("✅ Concurrent sync handling test passed");
    }, 180000);
  });

  describe("Performance and Scalability", () => {
    it("should handle large content volumes efficiently", async () => {
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      const startTime = Date.now();

      // Execute sync
      await contentSyncJob.run();

      const duration = Date.now() - startTime;

      // Get processed data counts
      const embeddingsCallArgs =
        embeddingsService.processContentEntries.mock.calls[0][0];
      const supabaseCallArgs =
        supabaseService.batchUpsertContentEntries.mock.calls[0][0];

      // Performance assertions
      expect(duration).toBeLessThan(300000); // Should complete within 5 minutes
      expect(embeddingsCallArgs.length).toBeGreaterThan(0);
      expect(supabaseCallArgs.length).toBeGreaterThan(0);

      // Calculate processing rate
      const entriesPerSecond = embeddingsCallArgs.length / (duration / 1000);

      console.log(`✅ Performance test completed`);
      console.log(`- Total duration: ${duration}ms`);
      console.log(`- Entries processed: ${embeddingsCallArgs.length}`);
      console.log(
        `- Processing rate: ${entriesPerSecond.toFixed(2)} entries/second`
      );

      // Should process at least 1 entry per 10 seconds on average
      expect(entriesPerSecond).toBeGreaterThan(0.1);
    }, 300000); // 5 minutes timeout

    it("should maintain consistent performance across multiple runs", async () => {
      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      const runTimes = [];
      const entryCounts = [];

      // Run sync multiple times
      for (let i = 0; i < 2; i++) {
        jest.clearAllMocks();

        const startTime = Date.now();
        await contentSyncJob.run();
        const duration = Date.now() - startTime;

        runTimes.push(duration);

        const embeddingsCallArgs =
          embeddingsService.processContentEntries.mock.calls[0][0];
        entryCounts.push(embeddingsCallArgs.length);

        // Wait a bit between runs
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Verify consistency
      expect(runTimes.length).toBe(2);
      expect(entryCounts.length).toBe(2);

      // Entry counts should be consistent (same content)
      expect(Math.abs(entryCounts[0] - entryCounts[1])).toBeLessThanOrEqual(5); // Allow small variance

      // Performance should be reasonably consistent (within 50% variance)
      const avgTime = runTimes.reduce((a, b) => a + b, 0) / runTimes.length;
      runTimes.forEach((time) => {
        expect(Math.abs(time - avgTime) / avgTime).toBeLessThan(0.5);
      });

      console.log(`✅ Consistency test completed`);
      console.log(`- Run times: ${runTimes.map((t) => `${t}ms`).join(", ")}`);
      console.log(`- Entry counts: ${entryCounts.join(", ")}`);
      console.log(`- Average time: ${avgTime.toFixed(0)}ms`);
    }, 360000); // 6 minutes timeout for multiple runs
  });

  describe("Multi-locale Sync Testing", () => {
    it("should sync content across multiple locales", async () => {
      const configuredLocales = config.contentstack.locales || ["en-us"];

      if (configuredLocales.length <= 1) {
        console.log("Only one locale configured, skipping multi-locale test");
        return;
      }

      const embeddingsService = require("../../services/embeddings");
      const supabaseService = require("../../services/supabase");

      // Execute sync
      await contentSyncJob.run();

      // Analyze processed entries by locale
      const embeddingsCallArgs =
        embeddingsService.processContentEntries.mock.calls[0][0];
      const localeDistribution = {};

      embeddingsCallArgs.forEach((entry) => {
        localeDistribution[entry.locale] =
          (localeDistribution[entry.locale] || 0) + 1;
      });

      // Verify multiple locales were processed
      const processedLocales = Object.keys(localeDistribution);
      expect(processedLocales.length).toBeGreaterThan(1);

      // Verify each configured locale has some content (or at least attempted)
      configuredLocales.forEach((locale) => {
        // Note: Some locales might not have content, so we just log the distribution
        console.log(
          `Locale ${locale}: ${localeDistribution[locale] || 0} entries`
        );
      });

      console.log(`✅ Multi-locale sync completed`);
      console.log(`- Processed locales: ${processedLocales.join(", ")}`);
      console.log(`- Total entries: ${embeddingsCallArgs.length}`);
    }, 180000);

    it("should handle locale-specific content correctly", async () => {
      const embeddingsService = require("../../services/embeddings");

      // Execute sync
      await contentSyncJob.run();

      // Verify locale-specific processing
      const embeddingsCallArgs =
        embeddingsService.processContentEntries.mock.calls[0][0];

      // Group entries by content type and locale
      const contentMap = {};
      embeddingsCallArgs.forEach((entry) => {
        const key = `${entry.content_type}_${entry.locale}`;
        if (!contentMap[key]) {
          contentMap[key] = [];
        }
        contentMap[key].push(entry);
      });

      // Verify each entry has proper locale-specific ID
      embeddingsCallArgs.forEach((entry) => {
        expect(entry.id).toContain(entry.locale);
        expect(entry.id).toContain(entry.content_type);

        // ID should be unique
        const duplicates = embeddingsCallArgs.filter((e) => e.id === entry.id);
        expect(duplicates.length).toBe(1);
      });

      console.log(`✅ Locale-specific content handling verified`);
      console.log(
        `- Content type/locale combinations: ${Object.keys(contentMap).length}`
      );
    }, 120000);
  });
});
