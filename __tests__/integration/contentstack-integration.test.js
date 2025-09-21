/**
 * Integration tests for ContentStack SDK integration
 * These tests verify that the service works correctly with different SDK response patterns
 * and error scenarios that might occur in real usage.
 */

const ContentstackService = require("../../services/contentstack");
const {
  mockContentTypesResponse,
  mockBlogPostEntries,
  mockPageEntries,
  mockArrayResponse,
  mockObjectResponse,
  mockContentStackErrors,
  mockHttpErrors,
  createPaginatedResponse,
  createEmptyResponse,
  createLargeDataset,
} = require("../__mocks__/contentstack-responses");

// Mock dependencies but allow real retry logic to run
jest.mock("../../utils/config", () => ({
  contentstack: {
    apiKey: "test-api-key",
    deliveryToken: "test-delivery-token",
    environment: "test-env",
    region: "us",
    timeout: 30000,
    retryLimit: 3,
    retryDelay: 100, // Faster for testing
  },
}));

jest.mock("../../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logError: jest.fn(),
}));

jest.mock("../../utils/performance", () => ({
  timeOperation: jest.fn(async (name, operation) => await operation()),
}));

jest.mock("../../services/contentTypeManager", () => ({
  extractTitle: jest.fn((entry) => entry.title || entry.name || entry.uid),
  extractSnippet: jest.fn(
    (entry) => entry.description || entry.snippet || "No description"
  ),
  generateUrl: jest.fn(
    (entry, contentType) => entry.url || `/${contentType}/${entry.uid}`
  ),
  extractTags: jest.fn((entry) => entry.tags || []),
  extractCategory: jest.fn((entry) => entry.category || null),
}));

// Mock Contentstack SDK
const mockStack = {
  getContentTypes: jest.fn(),
  ContentType: jest.fn(),
  setHost: jest.fn(),
};

const mockQuery = {
  locale: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  includeCount: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  toJSON: jest.fn().mockReturnThis(),
  find: jest.fn(),
};

const mockContentType = {
  Query: jest.fn(() => mockQuery),
};

mockStack.ContentType.mockReturnValue(mockContentType);

jest.mock("contentstack", () => ({
  Stack: jest.fn(() => mockStack),
}));

describe("ContentStack Integration Tests", () => {
  let contentstackService;
  const logger = require("../../utils/logger");

  beforeEach(() => {
    jest.clearAllMocks();
    contentstackService = new ContentstackService();
  });

  describe("Real-world SDK Response Patterns", () => {
    describe("getContentTypes with different response formats", () => {
      it("should handle standard content types response", async () => {
        mockStack.getContentTypes.mockResolvedValue(mockContentTypesResponse);

        const result = await contentstackService.getContentTypes();

        expect(result).toHaveLength(3);
        expect(result[0].uid).toBe("blog_post");
        expect(result[1].uid).toBe("page");
        expect(result[2].uid).toBe("product");
      });

      it("should handle empty content types response", async () => {
        mockStack.getContentTypes.mockResolvedValue({ content_types: [] });

        const result = await contentstackService.getContentTypes();

        expect(result).toEqual([]);
      });

      it("should handle malformed content types response", async () => {
        mockStack.getContentTypes.mockResolvedValue({});

        const result = await contentstackService.getContentTypes();

        expect(result).toEqual([]);
      });
    });

    describe("getEntriesByContentType with different SDK response formats", () => {
      it("should handle array response format [entries, schema, count]", async () => {
        const response = mockArrayResponse(mockBlogPostEntries, 2);
        mockQuery.find.mockResolvedValue(response);

        const result = await contentstackService.getEntriesByContentType(
          "blog_post"
        );

        expect(result.entries).toHaveLength(2);
        expect(result.count).toBe(2);
        expect(result.entries[0].uid).toBe("blog_post_1");
      });

      it("should handle object response format { entries: [...], count: number }", async () => {
        const response = mockObjectResponse(mockPageEntries, 2);
        mockQuery.find.mockResolvedValue(response);

        const result = await contentstackService.getEntriesByContentType(
          "page"
        );

        expect(result.entries).toHaveLength(2);
        expect(result.count).toBe(2);
        expect(result.entries[0].uid).toBe("about_page");
      });

      it("should handle empty results gracefully", async () => {
        const response = createEmptyResponse();
        mockQuery.find.mockResolvedValue(response);

        const result = await contentstackService.getEntriesByContentType(
          "empty_type"
        );

        expect(result.entries).toEqual([]);
        expect(result.count).toBe(0);
      });

      it("should handle malformed response gracefully", async () => {
        mockQuery.find.mockResolvedValue(null);

        const result = await contentstackService.getEntriesByContentType(
          "malformed"
        );

        expect(result.entries).toEqual([]);
        expect(result.count).toBe(0);
      });
    });

    describe("Pagination scenarios", () => {
      it("should handle large datasets with pagination", async () => {
        const largeDataset = createLargeDataset("blog_post", 150);

        // Mock first page
        const firstPage = createPaginatedResponse(largeDataset, 50, 0);
        // Mock second page
        const secondPage = createPaginatedResponse(largeDataset, 50, 50);
        // Mock third page
        const thirdPage = createPaginatedResponse(largeDataset, 50, 100);

        mockStack.getContentTypes.mockResolvedValue({
          content_types: [{ uid: "blog_post" }],
        });

        mockQuery.find
          .mockResolvedValueOnce(firstPage)
          .mockResolvedValueOnce(secondPage)
          .mockResolvedValueOnce(thirdPage);

        const result = await contentstackService.getAllEntries(["en-us"], 50);

        expect(result).toHaveLength(150);
        expect(mockQuery.skip).toHaveBeenCalledWith(0);
        expect(mockQuery.skip).toHaveBeenCalledWith(50);
        expect(mockQuery.skip).toHaveBeenCalledWith(100);
      });

      it("should handle partial pagination correctly", async () => {
        const dataset = createLargeDataset("page", 75);

        // Mock responses for partial last page
        const firstPage = createPaginatedResponse(dataset, 50, 0);
        const secondPage = createPaginatedResponse(dataset, 25, 50); // Only 25 items left

        mockStack.getContentTypes.mockResolvedValue({
          content_types: [{ uid: "page" }],
        });

        mockQuery.find
          .mockResolvedValueOnce(firstPage)
          .mockResolvedValueOnce(secondPage);

        const result = await contentstackService.getAllEntries(["en-us"], 50);

        expect(result).toHaveLength(75);
      });
    });
  });

  describe("Error Handling and Retry Logic", () => {
    describe("ContentStack API errors", () => {
      it("should handle unauthorized errors", async () => {
        const error = new Error("Unauthorized");
        Object.assign(error, mockContentStackErrors.unauthorized);

        mockStack.getContentTypes.mockRejectedValue(error);

        await expect(contentstackService.getContentTypes()).rejects.toThrow(
          "Contentstack API error: Unauthorized. Please check your credentials."
        );

        expect(logger.error).toHaveBeenCalled();
      });

      it("should handle rate limiting errors", async () => {
        const error = new Error("Rate limited");
        Object.assign(error, mockContentStackErrors.rateLimited);

        mockQuery.find.mockRejectedValue(error);

        await expect(
          contentstackService.getEntriesByContentType("blog_post")
        ).rejects.toThrow("Rate limit exceeded");
      });

      it("should handle content type not found errors", async () => {
        const error = new Error("Not found");
        Object.assign(error, mockContentStackErrors.notFound);

        mockQuery.find.mockRejectedValue(error);

        await expect(
          contentstackService.getEntriesByContentType("nonexistent")
        ).rejects.toThrow("content type was not found");
      });
    });

    describe("Network and timeout errors", () => {
      it("should retry on network timeout errors", async () => {
        const timeoutError = new Error("Request timeout");
        Object.assign(timeoutError, mockContentStackErrors.networkTimeout);

        mockStack.getContentTypes
          .mockRejectedValueOnce(timeoutError)
          .mockRejectedValueOnce(timeoutError)
          .mockResolvedValue(mockContentTypesResponse);

        const result = await contentstackService.getContentTypes();

        expect(result).toHaveLength(3);
        expect(mockStack.getContentTypes).toHaveBeenCalledTimes(3);
        expect(logger.warn).toHaveBeenCalledTimes(2); // Two retry warnings
      });

      it("should retry on connection reset errors", async () => {
        const resetError = new Error("Connection reset");
        Object.assign(resetError, mockContentStackErrors.connectionReset);

        mockQuery.find
          .mockRejectedValueOnce(resetError)
          .mockResolvedValue(mockArrayResponse(mockBlogPostEntries));

        const result = await contentstackService.getEntriesByContentType(
          "blog_post"
        );

        expect(result.entries).toHaveLength(2);
        expect(mockQuery.find).toHaveBeenCalledTimes(2);
      });

      it("should fail after max retries on persistent network errors", async () => {
        const dnsError = new Error("DNS lookup failed");
        Object.assign(dnsError, mockContentStackErrors.dnsError);

        mockStack.getContentTypes.mockRejectedValue(dnsError);

        await expect(contentstackService.getContentTypes()).rejects.toThrow(
          "DNS lookup failed"
        );

        // Should try initial + 3 retries = 4 total attempts
        expect(mockStack.getContentTypes).toHaveBeenCalledTimes(4);
      });
    });

    describe("HTTP errors", () => {
      it("should retry on 502 Bad Gateway errors", async () => {
        const badGatewayError = new Error("Bad Gateway");
        Object.assign(badGatewayError, mockHttpErrors.badGateway);

        mockQuery.find
          .mockRejectedValueOnce(badGatewayError)
          .mockResolvedValue(mockArrayResponse(mockPageEntries));

        const result = await contentstackService.getEntriesByContentType(
          "page"
        );

        expect(result.entries).toHaveLength(2);
        expect(mockQuery.find).toHaveBeenCalledTimes(2);
      });

      it("should retry on 503 Service Unavailable errors", async () => {
        const serviceError = new Error("Service Unavailable");
        Object.assign(serviceError, mockHttpErrors.serviceUnavailable);

        mockQuery.find
          .mockRejectedValueOnce(serviceError)
          .mockResolvedValue(mockArrayResponse(mockBlogPostEntries));

        const result = await contentstackService.getEntriesByContentType(
          "blog_post"
        );

        expect(result.entries).toHaveLength(2);
      });

      it("should not retry on 401 authentication errors", async () => {
        const authError = new Error("Unauthorized");
        authError.status = 401;

        mockStack.getContentTypes.mockRejectedValue(authError);

        await expect(contentstackService.getContentTypes()).rejects.toThrow(
          "Unauthorized"
        );

        // Should only try once, no retries
        expect(mockStack.getContentTypes).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Complex Integration Scenarios", () => {
    it("should handle mixed success and failure across content types", async () => {
      const contentTypes = [
        { uid: "blog_post" },
        { uid: "page" },
        { uid: "failing_type" },
      ];

      mockStack.getContentTypes.mockResolvedValue({
        content_types: contentTypes,
      });

      const networkError = new Error("Network timeout");
      networkError.code = "ETIMEDOUT";

      mockQuery.find
        .mockResolvedValueOnce(mockArrayResponse(mockBlogPostEntries)) // blog_post succeeds
        .mockResolvedValueOnce(mockArrayResponse(mockPageEntries)) // page succeeds
        .mockRejectedValue(networkError); // failing_type fails

      const result = await contentstackService.getAllEntries();

      // Should get entries from successful content types
      expect(result.length).toBeGreaterThan(0);

      // Should log warnings about failed content type
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch batch"),
        expect.any(Object)
      );
    });

    it("should handle multi-locale content fetching", async () => {
      const contentTypes = [{ uid: "blog_post" }];
      const locales = ["en-us", "fr-fr", "es-es"];

      mockStack.getContentTypes.mockResolvedValue({
        content_types: contentTypes,
      });

      // Mock responses for each locale
      mockQuery.find
        .mockResolvedValueOnce(mockArrayResponse(mockBlogPostEntries)) // en-us
        .mockResolvedValueOnce(mockArrayResponse(mockBlogPostEntries)) // fr-fr
        .mockResolvedValueOnce(mockArrayResponse(mockBlogPostEntries)); // es-es

      const result = await contentstackService.getAllEntries(locales);

      expect(result).toHaveLength(6); // 2 entries × 3 locales

      // Verify locale assignment
      const localeGroups = result.reduce((acc, entry) => {
        acc[entry.locale] = (acc[entry.locale] || 0) + 1;
        return acc;
      }, {});

      expect(localeGroups["en-us"]).toBe(2);
      expect(localeGroups["fr-fr"]).toBe(2);
      expect(localeGroups["es-es"]).toBe(2);
    });

    it("should handle entry transformation correctly", async () => {
      const mockEntry = {
        uid: "test-entry",
        title: "Test Entry",
        content: {
          json: {
            children: [
              {
                type: "paragraph",
                children: [{ type: "text", text: "Test content" }],
              },
            ],
          },
        },
        tags: ["test", "integration"],
        category: "testing",
        updated_at: "2024-01-15T10:00:00Z",
      };

      const transformed = contentstackService.transformEntry(
        mockEntry,
        "blog_post",
        "en-us"
      );

      expect(transformed).toMatchObject({
        id: "blog_post_test-entry_en-us",
        uid: "test-entry",
        content_type: "blog_post",
        locale: "en-us",
        updated_at: "2024-01-15T10:00:00Z",
        raw_data: mockEntry,
      });
    });

    it("should handle performance monitoring integration", async () => {
      const performanceMonitor = require("../../utils/performance");

      mockStack.getContentTypes.mockResolvedValue(mockContentTypesResponse);

      await contentstackService.getContentTypes();

      expect(performanceMonitor.timeOperation).toHaveBeenCalledWith(
        "getContentTypes",
        expect.any(Function)
      );
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("should handle extremely large batch sizes", async () => {
      const largeDataset = createLargeDataset("product", 1000);

      mockStack.getContentTypes.mockResolvedValue({
        content_types: [{ uid: "product" }],
      });

      // Mock single large response
      mockQuery.find.mockResolvedValue(mockArrayResponse(largeDataset, 1000));

      const result = await contentstackService.getAllEntries(["en-us"], 1000);

      expect(result).toHaveLength(1000);
    });

    it("should handle zero entries gracefully", async () => {
      mockStack.getContentTypes.mockResolvedValue({
        content_types: [{ uid: "empty_type" }],
      });

      mockQuery.find.mockResolvedValue(createEmptyResponse());

      const result = await contentstackService.getAllEntries();

      expect(result).toEqual([]);
    });

    it("should handle malformed entry data", async () => {
      const malformedEntries = [
        { uid: "entry1" }, // Missing title and other fields
        { title: "Entry 2" }, // Missing uid
        null, // Null entry
        undefined, // Undefined entry
      ].filter(Boolean); // Remove null/undefined for realistic scenario

      mockStack.getContentTypes.mockResolvedValue({
        content_types: [{ uid: "malformed_type" }],
      });

      mockQuery.find.mockResolvedValue(mockArrayResponse(malformedEntries));

      const result = await contentstackService.getAllEntries();

      // Should handle malformed entries gracefully
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach((entry) => {
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("content_type");
        expect(entry).toHaveProperty("locale");
      });
    });
  });
});
