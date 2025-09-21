/**
 * Comprehensive tests for ContentStack error handling and formatting
 * Tests the formatContentstackError method with various error types
 */

const ContentstackService = require("../../services/contentstack");
const { categorizeError } = require("../../utils/retry");

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
jest.mock("contentstack", () => ({
  Stack: jest.fn(() => ({
    getContentTypes: jest.fn(),
    ContentType: jest.fn(),
    setHost: jest.fn(),
  })),
}));

describe("ContentStack Error Handling", () => {
  let contentstackService;

  beforeEach(() => {
    jest.clearAllMocks();
    contentstackService = new ContentstackService();
  });

  describe("formatContentstackError", () => {
    describe("ContentStack API errors", () => {
      it("should format structured ContentStack error objects", () => {
        const error = {
          error_message: "Invalid API key provided",
          error_code: "INVALID_API_KEY",
          status: 401,
          errors: [],
        };

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Invalid API key provided");
        expect(formatted).toContain("Code: INVALID_API_KEY");
        expect(formatted).toContain("Status: 401");
        expect(formatted).toContain("[Category:");
      });

      it("should format ContentStack errors with detailed error array", () => {
        const error = {
          error_message: "Validation failed",
          error_code: "VALIDATION_ERROR",
          status: 422,
          errors: [
            { message: "Title is required" },
            { message: "Content cannot be empty" },
          ],
        };

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Validation failed");
        expect(formatted).toContain(
          "Details: Title is required, Content cannot be empty"
        );
      });

      it("should format ContentStack errors with object errors", () => {
        const error = {
          error_message: "Schema validation failed",
          error_code: "SCHEMA_ERROR",
          status: 400,
          errors: { field: "title", issue: "required" },
        };

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Schema validation failed");
        expect(formatted).toContain(
          'Details: {"field":"title","issue":"required"}'
        );
      });
    });

    describe("HTTP response errors", () => {
      it("should format axios-style response errors", () => {
        const error = {
          response: {
            status: 404,
            data: {
              error_message: "Content type not found",
              error_code: "CONTENT_TYPE_NOT_FOUND",
            },
          },
        };

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Content type not found");
        expect(formatted).toContain("Code: CONTENT_TYPE_NOT_FOUND");
        expect(formatted).toContain("Status: 404");
      });

      it("should format response errors without ContentStack structure", () => {
        const error = {
          response: {
            status: 503,
            data: {
              message: "Service temporarily unavailable",
            },
          },
        };

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Service temporarily unavailable");
        expect(formatted).toContain("Status: 503");
      });
    });

    describe("HTTP status code errors", () => {
      it("should provide specific messages for common HTTP status codes", () => {
        const statusMessages = [
          {
            status: 401,
            expectedMessage:
              "Authentication failed - check API key and delivery token",
          },
          {
            status: 403,
            expectedMessage:
              "Access forbidden - check permissions and environment settings",
          },
          {
            status: 404,
            expectedMessage:
              "Resource not found - check content type or entry ID",
          },
          {
            status: 429,
            expectedMessage: "Rate limit exceeded - too many requests",
          },
          {
            status: 500,
            expectedMessage:
              "Internal server error - ContentStack service issue",
          },
          {
            status: 502,
            expectedMessage:
              "Bad gateway - ContentStack service temporarily unavailable",
          },
          {
            status: 503,
            expectedMessage:
              "Service unavailable - ContentStack maintenance or overload",
          },
          {
            status: 504,
            expectedMessage: "Gateway timeout - ContentStack service timeout",
          },
        ];

        statusMessages.forEach(({ status, expectedMessage }) => {
          const error = new Error("HTTP error");
          error.status = status;

          const formatted = contentstackService.formatContentstackError(error);

          expect(formatted).toContain(expectedMessage);
          expect(formatted).toContain(`Status: ${status}`);
        });
      });

      it("should handle statusCode property as well as status", () => {
        const error = new Error("HTTP error");
        error.statusCode = 429;

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Rate limit exceeded");
        expect(formatted).toContain("Status: 429");
      });
    });

    describe("Network and connection errors", () => {
      it("should format network error codes with descriptive messages", () => {
        const networkErrors = [
          { code: "ECONNRESET", expectedMessage: "Connection reset by server" },
          {
            code: "ENOTFOUND",
            expectedMessage:
              "DNS lookup failed - check ContentStack region/host settings",
          },
          {
            code: "ETIMEDOUT",
            expectedMessage:
              "Request timeout - ContentStack service may be slow",
          },
          {
            code: "ECONNREFUSED",
            expectedMessage:
              "Connection refused - ContentStack service unavailable",
          },
        ];

        networkErrors.forEach(({ code, expectedMessage }) => {
          const error = new Error("Network error");
          error.code = code;

          const formatted = contentstackService.formatContentstackError(error);

          expect(formatted).toContain(expectedMessage);
          expect(formatted).toContain(`Code: ${code}`);
        });
      });

      it("should handle unknown network error codes", () => {
        const error = new Error("Unknown network error");
        error.code = "EUNKNOWN";

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Network error: EUNKNOWN");
        expect(formatted).toContain("Code: EUNKNOWN");
      });
    });

    describe("JSON string errors", () => {
      it("should parse JSON error messages", () => {
        const jsonError = JSON.stringify({
          error_message: "Parsed from JSON",
          error_code: "JSON_ERROR",
          status: 400,
          errors: ["Detail 1", "Detail 2"],
        });

        const error = new Error(jsonError);

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Parsed from JSON");
        expect(formatted).toContain("Code: JSON_ERROR");
        expect(formatted).toContain('Details: ["Detail 1","Detail 2"]');
      });

      it("should handle malformed JSON in error messages", () => {
        const error = new Error("{ invalid json");

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("{ invalid json");
      });
    });

    describe("Complex error objects", () => {
      it("should handle errors with raw error details", () => {
        const complexError = {
          message: "Complex error",
          details: { nested: { data: "value" } },
          timestamp: "2024-01-15T10:00:00Z",
        };

        const formatted =
          contentstackService.formatContentstackError(complexError);

        expect(formatted).toContain("Complex error");
        expect(formatted).toContain("Raw error:");
        expect(formatted).toContain('"nested"');
      });

      it("should handle circular reference errors safely", () => {
        const circularError = { message: "Circular error" };
        circularError.self = circularError; // Create circular reference

        const formatted =
          contentstackService.formatContentstackError(circularError);

        expect(formatted).toContain("Circular error");
        // Should not throw due to circular reference
      });
    });

    describe("Fallback error handling", () => {
      it("should handle null/undefined errors", () => {
        const nullFormatted = contentstackService.formatContentstackError(null);
        const undefinedFormatted =
          contentstackService.formatContentstackError(undefined);

        expect(nullFormatted).toContain("Unknown ContentStack error");
        expect(undefinedFormatted).toContain("Unknown ContentStack error");
      });

      it("should handle errors without message property", () => {
        const error = { code: "NO_MESSAGE" };

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("Unknown ContentStack error");
        expect(formatted).toContain("Raw error:");
      });

      it("should handle string errors", () => {
        const stringError = "Simple string error";

        const formatted =
          contentstackService.formatContentstackError(stringError);

        expect(formatted).toContain("Unknown ContentStack error");
      });
    });

    describe("Error categorization integration", () => {
      it("should include error category in formatted message", () => {
        const { categorizeError } = require("../../utils/retry");
        categorizeError.mockReturnValue("NETWORK");

        const error = new Error("Network timeout");
        error.code = "ETIMEDOUT";

        const formatted = contentstackService.formatContentstackError(error);

        expect(formatted).toContain("[Category: NETWORK]");
        expect(categorizeError).toHaveBeenCalledWith(error);
      });

      it("should handle different error categories", () => {
        const { categorizeError } = require("../../utils/retry");

        const categories = [
          "AUTHENTICATION",
          "AUTHORIZATION",
          "RATE_LIMIT",
          "SERVER_ERROR",
          "CLIENT_ERROR",
        ];

        categories.forEach((category) => {
          categorizeError.mockReturnValue(category);

          const error = new Error("Test error");
          const formatted = contentstackService.formatContentstackError(error);

          expect(formatted).toContain(`[Category: ${category}]`);
        });
      });
    });

    describe("Real-world error scenarios", () => {
      it("should format typical authentication error", () => {
        const authError = {
          error_message:
            "The access token you have used is invalid or has expired.",
          error_code: "InvalidAccessToken",
          status: 401,
          errors: [],
        };

        const formatted =
          contentstackService.formatContentstackError(authError);

        expect(formatted).toContain("access token");
        expect(formatted).toContain("invalid or has expired");
        expect(formatted).toContain("Code: InvalidAccessToken");
        expect(formatted).toContain("Status: 401");
      });

      it("should format typical rate limiting error", () => {
        const rateLimitError = {
          error_message:
            "You have exceeded the rate limit. Please try again after some time.",
          error_code: "RateLimitExceeded",
          status: 429,
          errors: [],
        };

        const formatted =
          contentstackService.formatContentstackError(rateLimitError);

        expect(formatted).toContain("exceeded the rate limit");
        expect(formatted).toContain("Code: RateLimitExceeded");
        expect(formatted).toContain("Status: 429");
      });

      it("should format typical content type not found error", () => {
        const notFoundError = {
          response: {
            status: 404,
            data: {
              error_message:
                "The Content Type 'nonexistent_type' was not found.",
              error_code: "ContentTypeNotFound",
            },
          },
        };

        const formatted =
          contentstackService.formatContentstackError(notFoundError);

        expect(formatted).toContain("Content Type");
        expect(formatted).toContain("was not found");
        expect(formatted).toContain("Code: ContentTypeNotFound");
        expect(formatted).toContain("Status: 404");
      });

      it("should format network timeout in production scenario", () => {
        const timeoutError = new Error("connect ETIMEDOUT 52.84.147.25:443");
        timeoutError.code = "ETIMEDOUT";
        timeoutError.errno = -4039;
        timeoutError.syscall = "connect";

        const formatted =
          contentstackService.formatContentstackError(timeoutError);

        expect(formatted).toContain("Request timeout");
        expect(formatted).toContain("ContentStack service may be slow");
        expect(formatted).toContain("Code: ETIMEDOUT");
      });
    });
  });
});
