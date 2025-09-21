const {
  withRetry,
  isRetryableError,
  categorizeError,
  sleep,
} = require("../../utils/retry");
const logger = require("../../utils/logger");

// Mock logger
jest.mock("../../utils/logger");

describe("Retry Utility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("withRetry", () => {
    it("should execute operation successfully on first attempt", async () => {
      const mockOperation = jest.fn().mockResolvedValue("success");

      const result = await withRetry(mockOperation);

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors", async () => {
      const retryableError = new Error("Network timeout");
      retryableError.code = "ETIMEDOUT";

      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue("success");

      const result = await withRetry(mockOperation, {
        maxRetries: 3,
        baseDelay: 10, // Use small delay for testing
      });

      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(
        "Operation succeeded on attempt 3/4"
      );
    });

    it("should not retry on non-retryable errors", async () => {
      const nonRetryableError = new Error("Authentication failed");
      nonRetryableError.status = 401;

      const mockOperation = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(withRetry(mockOperation)).rejects.toThrow(
        "Authentication failed"
      );

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Operation failed with non-retryable error",
        expect.objectContaining({
          error: "Authentication failed",
          errorType: "AUTHENTICATION",
        })
      );
    });

    it("should fail after max retries", async () => {
      const retryableError = new Error("Service unavailable");
      retryableError.status = 503;

      const mockOperation = jest.fn().mockRejectedValue(retryableError);

      await expect(withRetry(mockOperation, { maxRetries: 2 })).rejects.toThrow(
        "Service unavailable"
      );

      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(logger.error).toHaveBeenCalledWith(
        "Operation failed after 2 retries",
        expect.objectContaining({
          error: "Service unavailable",
          attempts: 2,
        })
      );
    });

    it("should use custom shouldRetry function", async () => {
      const error = new Error("Custom error");
      const customShouldRetry = jest.fn().mockReturnValue(false);
      const mockOperation = jest.fn().mockRejectedValue(error);

      await expect(
        withRetry(mockOperation, { shouldRetry: customShouldRetry })
      ).rejects.toThrow("Custom error");

      expect(customShouldRetry).toHaveBeenCalledWith(error);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should respect maxDelay configuration", async () => {
      const retryableError = new Error("Timeout");
      retryableError.code = "ETIMEDOUT";

      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue("success");

      const startTime = Date.now();
      await withRetry(mockOperation, {
        maxRetries: 1,
        baseDelay: 50000, // Very high base delay
        maxDelay: 100, // But low max delay
      });
      const endTime = Date.now();

      // Should not take more than a few hundred ms due to maxDelay
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("isRetryableError", () => {
    it("should identify network errors as retryable", () => {
      const networkError = new Error("Connection reset");
      networkError.code = "ECONNRESET";

      expect(isRetryableError(networkError)).toBe(true);
    });

    it("should identify timeout errors as retryable", () => {
      const timeoutError = new Error("Request timeout");
      timeoutError.code = "ETIMEDOUT";

      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it("should identify rate limit errors as retryable", () => {
      const rateLimitError = new Error("Too many requests");
      rateLimitError.status = 429;

      expect(isRetryableError(rateLimitError)).toBe(true);
    });

    it("should identify server errors as retryable", () => {
      const serverError = new Error("Internal server error");
      serverError.status = 500;

      expect(isRetryableError(serverError)).toBe(true);
    });

    it("should identify specific retryable status codes", () => {
      const retryableStatuses = [429, 502, 503, 504];

      retryableStatuses.forEach((status) => {
        const error = new Error("Server error");
        error.status = status;
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it("should identify transient error messages as retryable", () => {
      const transientMessages = [
        "timeout",
        "connection reset",
        "network error",
        "socket hang up",
        "service unavailable",
        "bad gateway",
      ];

      transientMessages.forEach((message) => {
        const error = new Error(message);
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it("should not retry authentication errors", () => {
      const authError = new Error("Unauthorized");
      authError.status = 401;

      expect(isRetryableError(authError)).toBe(false);
    });

    it("should not retry client errors (except 429)", () => {
      const clientErrors = [400, 401, 403, 404, 422];

      clientErrors.forEach((status) => {
        const error = new Error("Client error");
        error.status = status;
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it("should not retry validation errors", () => {
      const validationError = new Error("Invalid input data");
      expect(isRetryableError(validationError)).toBe(false);
    });
  });

  describe("categorizeError", () => {
    it("should categorize ContentStack specific errors", () => {
      const csError = {
        error_message: "Invalid API key",
        error_code: "UNAUTHORIZED",
        status: 401,
      };

      expect(categorizeError(csError)).toBe("AUTHENTICATION");
    });

    it("should categorize HTTP status codes", () => {
      const statusCategories = [
        { status: 401, expected: "AUTHENTICATION" },
        { status: 403, expected: "AUTHORIZATION" },
        { status: 404, expected: "NOT_FOUND" },
        { status: 429, expected: "RATE_LIMIT" },
        { status: 500, expected: "SERVER_ERROR" },
        { status: 400, expected: "CLIENT_ERROR" },
      ];

      statusCategories.forEach(({ status, expected }) => {
        const error = new Error("HTTP error");
        error.status = status;
        expect(categorizeError(error)).toBe(expected);
      });
    });

    it("should categorize by error message patterns", () => {
      const messageCategories = [
        { message: "Request timeout", expected: "TIMEOUT" },
        { message: "Network connection failed", expected: "NETWORK" },
        { message: "Unauthorized access", expected: "AUTHENTICATION" },
        { message: "Permission denied", expected: "AUTHORIZATION" },
        { message: "Resource not found", expected: "NOT_FOUND" },
        { message: "Invalid data format", expected: "VALIDATION" },
        { message: "Rate limit exceeded", expected: "RATE_LIMIT" },
      ];

      messageCategories.forEach(({ message, expected }) => {
        const error = new Error(message);
        expect(categorizeError(error)).toBe(expected);
      });
    });

    it("should categorize network error codes", () => {
      const networkCodes = [
        { code: "ETIMEDOUT", expected: "TIMEOUT" },
        { code: "ECONNRESET", expected: "NETWORK" },
        { code: "ENOTFOUND", expected: "NETWORK" },
      ];

      networkCodes.forEach(({ code, expected }) => {
        const error = new Error("Network error");
        error.code = code;
        expect(categorizeError(error)).toBe(expected);
      });
    });

    it("should return UNKNOWN for uncategorized errors", () => {
      const unknownError = new Error("Some random error");
      expect(categorizeError(unknownError)).toBe("UNKNOWN");
    });
  });

  describe("sleep", () => {
    it("should resolve after specified time", async () => {
      const startTime = Date.now();
      await sleep(50);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
