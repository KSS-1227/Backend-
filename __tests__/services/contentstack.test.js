const ContentstackService = require("../../services/contentstack");
const {
  withRetry,
  isRetryableError,
  categorizeError,
} = require("../../utils/retry");
const logger = require("../../utils/logger");
const performanceMonitor = require("../../utils/performance");

// Mock dependencies
jest.mock("../../utils/config", () => ({
  contentstack: {
    apiKey: "test-api-key",
    deliveryToken: "test-delivery-token",
    environment: "test-env",
    region: "us",
    timeout: 30000,
    retryLimit: 3,
    retryDelay: 1000,
  },
}));

jest.mock("../../utils/logger");
jest.mock("../../utils/performance");
jest.mock("../../utils/retry");
jest.mock("../../services/contentTypeManager");

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

describe("ContentstackService", () => {
  let contentstackService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock withRetry to execute the operation directly
    withRetry.mockImplementation(async (operation) => {
      return await operation();
    });

    // Mock performance monitor
    performanceMonitor.timeOperation.mockImplementation(
      async (name, operation) => {
        return await operation();
      }
    );

    contentstackService = new ContentstackService();
  });

  describe("constructor", () => {
    it("should initialize ContentStack SDK with correct configuration", () => {
      const Contentstack = require("contentstack");

      expect(Contentstack.Stack).toHaveBeenCalledWith({
        api_key: "test-api-key",
        delivery_token: "test-delivery-token",
        environment: "test-env",
        region: "us",
        timeout: 30000,
        retryLimit: 3,
        retryDelay: 1000,
      });
    });

    it("should log initialization success", () => {
      expect(logger.info).toHaveBeenCalledWith(
        "📚 Contentstack client initialized",
        expect.objectContaining({
          environment: "test-env",
          region: "us",
          timeout: 30000,
          retryLimit: 3,
          retryDelay: 1000,
        })
      );
    });
  });

  describe("validateConfiguration", () => {
    it("should validate required configuration fields", () => {
      // This is tested implicitly in constructor
      expect(() => new ContentstackService()).not.toThrow();
    });
  });

  describe("getContentTypes", () => {
    it("should fetch content types successfully", async () => {
      const mockContentTypes = [
        { uid: "blog_post", title: "Blog Post" },
        { uid: "page", title: "Page" },
      ];

      mockStack.getContentTypes.mockResolvedValue({
        content_types: mockContentTypes,
      });

      const result = await contentstackService.getContentTypes();

      expect(result).toEqual(mockContentTypes);
      expect(mockStack.getContentTypes).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Successfully fetched content types",
        expect.objectContaining({
          count: 2,
          types: ["blog_post", "page"],
        })
      );
    });

    it("should handle empty content types response", async () => {
      mockStack.getContentTypes.mockResolvedValue({});

      const result = await contentstackService.getContentTypes();

      expect(result).toEqual([]);
    });

    it("should handle SDK errors and format them properly", async () => {
      const sdkError = new Error("SDK Error");
      sdkError.status = 401;
      sdkError.error_message = "Unauthorized";

      mockStack.getContentTypes.mockRejectedValue(sdkError);

      await expect(contentstackService.getContentTypes()).rejects.toThrow(
        "Contentstack API error: Unauthorized"
      );

      expect(logger.error).toHaveBeenCalled();
    });

    it("should use retry logic", async () => {
      const mockContentTypes = [{ uid: "test", title: "Test" }];
      mockStack.getContentTypes.mockResolvedValue({
        content_types: mockContentTypes,
      });

      await contentstackService.getContentTypes();

      expect(withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          baseDelay: 1000,
          shouldRetry: isRetryableError,
        })
      );
    });
  });

  describe("getEntriesByContentType", () => {
    beforeEach(() => {
      mockQuery.find.mockClear();
    });

    it("should fetch entries successfully with array response format", async () => {
      const mockEntries = [
        { uid: "entry1", title: "Entry 1" },
        { uid: "entry2", title: "Entry 2" },
      ];

      // Mock SDK response format: [entries, schema, count]
      mockQuery.find.mockResolvedValue([mockEntries, {}, 2]);

      const result = await contentstackService.getEntriesByContentType(
        "blog_post"
      );

      expect(result).toEqual({
        entries: mockEntries,
        count: 2,
      });

      expect(mockStack.ContentType).toHaveBeenCalledWith("blog_post");
      expect(mockQuery.locale).toHaveBeenCalledWith("en-us");
      expect(mockQuery.limit).toHaveBeenCalledWith(100);
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.includeCount).toHaveBeenCalled();
    });

    it("should fetch entries successfully with object response format", async () => {
      const mockEntries = [{ uid: "entry1", title: "Entry 1" }];

      // Mock SDK response format: { entries: [...], count: number }
      mockQuery.find.mockResolvedValue({
        entries: mockEntries,
        count: 1,
      });

      const result = await contentstackService.getEntriesByContentType("page");

      expect(result).toEqual({
        entries: mockEntries,
        count: 1,
      });
    });

    it("should handle custom locale, limit, and skip parameters", async () => {
      mockQuery.find.mockResolvedValue([[], {}, 0]);

      await contentstackService.getEntriesByContentType(
        "blog_post",
        "fr-fr",
        50,
        25
      );

      expect(mockQuery.locale).toHaveBeenCalledWith("fr-fr");
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      expect(mockQuery.skip).toHaveBeenCalledWith(25);
    });

    it("should handle empty results", async () => {
      mockQuery.find.mockResolvedValue([[], {}, 0]);

      const result = await contentstackService.getEntriesByContentType(
        "empty_type"
      );

      expect(result).toEqual({
        entries: [],
        count: 0,
      });
    });

    it("should handle SDK errors", async () => {
      const sdkError = new Error("Content type not found");
      sdkError.status = 404;

      mockQuery.find.mockRejectedValue(sdkError);

      await expect(
        contentstackService.getEntriesByContentType("nonexistent")
      ).rejects.toThrow("Contentstack API error for nonexistent:");

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("getEntriesByIds", () => {
    it("should fetch entries by IDs successfully", async () => {
      const mockEntries = [
        { uid: "id1", title: "Entry 1" },
        { uid: "id2", title: "Entry 2" },
      ];

      mockQuery.find.mockResolvedValue([mockEntries, {}, 2]);

      const result = await contentstackService.getEntriesByIds("blog_post", [
        "id1",
        "id2",
      ]);

      expect(result).toEqual(mockEntries);
      expect(mockQuery.where).toHaveBeenCalledWith("uid", {
        $in: ["id1", "id2"],
      });
    });

    it("should handle empty IDs array", async () => {
      const result = await contentstackService.getEntriesByIds("blog_post", []);

      expect(result).toEqual([]);
      expect(mockQuery.find).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid or empty IDs array"),
        expect.any(Object)
      );
    });

    it("should handle invalid IDs parameter", async () => {
      const result = await contentstackService.getEntriesByIds(
        "blog_post",
        null
      );

      expect(result).toEqual([]);
      expect(mockQuery.find).not.toHaveBeenCalled();
    });

    it("should handle custom locale", async () => {
      mockQuery.find.mockResolvedValue([[], {}, 0]);

      await contentstackService.getEntriesByIds("blog_post", ["id1"], "es-es");

      expect(mockQuery.locale).toHaveBeenCalledWith("es-es");
    });
  });

  describe("fetchBlogPosts", () => {
    it("should fetch blog posts successfully", async () => {
      const mockBlogPosts = [
        { uid: "post1", title: "Blog Post 1" },
        { uid: "post2", title: "Blog Post 2" },
      ];

      mockQuery.find.mockResolvedValue([mockBlogPosts, {}, 2]);

      const result = await contentstackService.fetchBlogPosts();

      expect(result).toEqual(mockBlogPosts);
      expect(mockStack.ContentType).toHaveBeenCalledWith("blog_post");
      expect(mockQuery.toJSON).toHaveBeenCalled();
    });

    it("should handle custom locale and limit", async () => {
      mockQuery.find.mockResolvedValue([[], {}, 0]);

      await contentstackService.fetchBlogPosts("de-de", 25);

      expect(mockQuery.locale).toHaveBeenCalledWith("de-de");
      expect(mockQuery.limit).toHaveBeenCalledWith(25);
    });
  });

  describe("getAllEntries", () => {
    it("should fetch all entries across content types", async () => {
      const mockContentTypes = [{ uid: "blog_post" }, { uid: "page" }];

      const mockBlogEntries = [{ uid: "blog1", title: "Blog 1" }];

      const mockPageEntries = [{ uid: "page1", title: "Page 1" }];

      // Mock getContentTypes
      mockStack.getContentTypes.mockResolvedValue({
        content_types: mockContentTypes,
      });

      // Mock getEntriesByContentType calls
      mockQuery.find
        .mockResolvedValueOnce([mockBlogEntries, {}, 1]) // blog_post
        .mockResolvedValueOnce([mockPageEntries, {}, 1]); // page

      const result = await contentstackService.getAllEntries();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        content_type: "blog_post",
        locale: "en-us",
      });
      expect(result[1]).toMatchObject({
        content_type: "page",
        locale: "en-us",
      });
    });

    it("should handle multiple locales", async () => {
      const mockContentTypes = [{ uid: "blog_post" }];
      const mockEntries = [{ uid: "blog1", title: "Blog 1" }];

      mockStack.getContentTypes.mockResolvedValue({
        content_types: mockContentTypes,
      });

      mockQuery.find
        .mockResolvedValueOnce([mockEntries, {}, 1]) // en-us
        .mockResolvedValueOnce([mockEntries, {}, 1]); // fr-fr

      const result = await contentstackService.getAllEntries([
        "en-us",
        "fr-fr",
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].locale).toBe("en-us");
      expect(result[1].locale).toBe("fr-fr");
    });

    it("should handle pagination correctly", async () => {
      const mockContentTypes = [{ uid: "blog_post" }];

      mockStack.getContentTypes.mockResolvedValue({
        content_types: mockContentTypes,
      });

      // Mock paginated responses
      const batch1 = Array.from({ length: 50 }, (_, i) => ({
        uid: `entry${i}`,
        title: `Entry ${i}`,
      }));
      const batch2 = Array.from({ length: 25 }, (_, i) => ({
        uid: `entry${i + 50}`,
        title: `Entry ${i + 50}`,
      }));

      mockQuery.find
        .mockResolvedValueOnce([batch1, {}, 75]) // First batch (50 entries, total 75)
        .mockResolvedValueOnce([batch2, {}, 75]); // Second batch (25 entries, total 75)

      const result = await contentstackService.getAllEntries(["en-us"], 50);

      expect(result).toHaveLength(75);
      expect(mockQuery.skip).toHaveBeenCalledWith(0); // First call
      expect(mockQuery.skip).toHaveBeenCalledWith(50); // Second call
    });

    it("should handle failed content types gracefully", async () => {
      const mockContentTypes = [{ uid: "blog_post" }, { uid: "failing_type" }];

      mockStack.getContentTypes.mockResolvedValue({
        content_types: mockContentTypes,
      });

      const mockEntries = [{ uid: "blog1", title: "Blog 1" }];
      const error = new Error("Content type error");

      mockQuery.find
        .mockResolvedValueOnce([mockEntries, {}, 1]) // blog_post succeeds
        .mockRejectedValueOnce(error); // failing_type fails

      const result = await contentstackService.getAllEntries();

      expect(result).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch batch"),
        expect.any(Object)
      );
    });
  });

  describe("transformEntry", () => {
    it("should transform entry to standard format", () => {
      const mockEntry = {
        uid: "test-uid",
        title: "Test Title",
        description: "Test description",
        updated_at: "2024-01-01T00:00:00Z",
        tag: ["tag1", "tag2"],
        category: "test-category",
      };

      const result = contentstackService.transformEntry(
        mockEntry,
        "blog_post",
        "en-us"
      );

      expect(result).toMatchObject({
        id: "blog_post_test-uid_en-us",
        uid: "test-uid",
        content_type: "blog_post",
        locale: "en-us",
        updated_at: "2024-01-01T00:00:00Z",
        raw_data: mockEntry,
      });
    });
  });

  describe("formatContentstackError", () => {
    it("should format ContentStack API errors", () => {
      const error = {
        error_message: "Invalid API key",
        error_code: "INVALID_API_KEY",
        status: 401,
      };

      const formatted = contentstackService.formatContentstackError(error);

      expect(formatted).toContain("Invalid API key");
      expect(formatted).toContain("Code: INVALID_API_KEY");
      expect(formatted).toContain("Status: 401");
    });

    it("should format HTTP errors", () => {
      const error = new Error("Request failed");
      error.status = 404;

      const formatted = contentstackService.formatContentstackError(error);

      expect(formatted).toContain("Resource not found");
      expect(formatted).toContain("Status: 404");
    });

    it("should format network errors", () => {
      const error = new Error("Connection timeout");
      error.code = "ETIMEDOUT";

      const formatted = contentstackService.formatContentstackError(error);

      expect(formatted).toContain("Request timeout");
      expect(formatted).toContain("Code: ETIMEDOUT");
    });

    it("should handle unknown error formats", () => {
      const error = new Error("Unknown error");

      const formatted = contentstackService.formatContentstackError(error);

      expect(formatted).toContain("Unknown error");
      expect(formatted).toContain("[Category:");
    });
  });

  describe("error handling and retry logic", () => {
    it("should use retry logic for all main methods", async () => {
      mockStack.getContentTypes.mockResolvedValue({ content_types: [] });

      await contentstackService.getContentTypes();

      expect(withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxRetries: 3,
          baseDelay: 1000,
          shouldRetry: isRetryableError,
        })
      );
    });

    it("should categorize errors correctly", () => {
      const networkError = new Error("Network error");
      networkError.code = "ECONNRESET";

      contentstackService.categorizeError(networkError);

      expect(categorizeError).toHaveBeenCalledWith(networkError);
    });

    it("should determine retryable errors correctly", () => {
      const retryableError = new Error("Timeout");
      retryableError.code = "ETIMEDOUT";

      contentstackService.isRetryableError(retryableError);

      expect(isRetryableError).toHaveBeenCalledWith(retryableError);
    });
  });

  describe("performance monitoring", () => {
    it("should monitor performance for all operations", async () => {
      mockStack.getContentTypes.mockResolvedValue({ content_types: [] });

      await contentstackService.getContentTypes();

      expect(performanceMonitor.timeOperation).toHaveBeenCalledWith(
        "getContentTypes",
        expect.any(Function)
      );
    });

    it("should include operation context in performance monitoring", async () => {
      mockQuery.find.mockResolvedValue([[], {}, 0]);

      await contentstackService.getEntriesByContentType(
        "blog_post",
        "en-us",
        50,
        25
      );

      expect(performanceMonitor.timeOperation).toHaveBeenCalledWith(
        "getEntriesByContentType",
        expect.any(Function),
        expect.objectContaining({
          contentType: "blog_post",
          locale: "en-us",
          limit: 50,
          skip: 25,
        })
      );
    });
  });
});
