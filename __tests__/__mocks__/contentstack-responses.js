/**
 * Mock responses that match the ContentStack SDK response formats
 * These are used in unit tests to simulate different SDK response patterns
 */

// Mock content types response
const mockContentTypesResponse = {
  content_types: [
    {
      uid: "blog_post",
      title: "Blog Post",
      description: "Blog post content type",
      schema: [
        { uid: "title", data_type: "text", display_name: "Title" },
        {
          uid: "content",
          data_type: "rich_text_editor",
          display_name: "Content",
        },
        { uid: "author", data_type: "text", display_name: "Author" },
        {
          uid: "tags",
          data_type: "text",
          display_name: "Tags",
          multiple: true,
        },
      ],
    },
    {
      uid: "page",
      title: "Page",
      description: "Static page content type",
      schema: [
        { uid: "title", data_type: "text", display_name: "Title" },
        {
          uid: "content",
          data_type: "rich_text_editor",
          display_name: "Content",
        },
        { uid: "slug", data_type: "text", display_name: "URL Slug" },
      ],
    },
    {
      uid: "product",
      title: "Product",
      description: "Product catalog content type",
      schema: [
        { uid: "name", data_type: "text", display_name: "Product Name" },
        { uid: "description", data_type: "text", display_name: "Description" },
        { uid: "price", data_type: "number", display_name: "Price" },
        { uid: "category", data_type: "text", display_name: "Category" },
      ],
    },
  ],
};

// Mock blog post entries
const mockBlogPostEntries = [
  {
    uid: "blog_post_1",
    title: "Getting Started with ContentStack",
    content: {
      json: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "This is a comprehensive guide to getting started with ContentStack CMS.",
              },
            ],
          },
        ],
      },
    },
    author: "John Doe",
    tags: ["contentstack", "cms", "tutorial"],
    url: "/blog/getting-started-contentstack",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T10:00:00Z",
    locale: "en-us",
    _metadata: {
      uid: "blog_post_1",
      content_type_uid: "blog_post",
      updated_at: "2024-01-15T10:00:00Z",
    },
  },
  {
    uid: "blog_post_2",
    title: "Advanced ContentStack Features",
    content: {
      json: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "Explore advanced features like webhooks, extensions, and custom fields.",
              },
            ],
          },
        ],
      },
    },
    author: "Jane Smith",
    tags: ["contentstack", "advanced", "features"],
    url: "/blog/advanced-contentstack-features",
    created_at: "2024-01-16T14:30:00Z",
    updated_at: "2024-01-16T14:30:00Z",
    locale: "en-us",
    _metadata: {
      uid: "blog_post_2",
      content_type_uid: "blog_post",
      updated_at: "2024-01-16T14:30:00Z",
    },
  },
];

// Mock page entries
const mockPageEntries = [
  {
    uid: "about_page",
    title: "About Us",
    content: {
      json: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "Learn more about our company and mission.",
              },
            ],
          },
        ],
      },
    },
    slug: "about",
    url: "/about",
    created_at: "2024-01-10T09:00:00Z",
    updated_at: "2024-01-10T09:00:00Z",
    locale: "en-us",
    _metadata: {
      uid: "about_page",
      content_type_uid: "page",
      updated_at: "2024-01-10T09:00:00Z",
    },
  },
  {
    uid: "contact_page",
    title: "Contact Us",
    content: {
      json: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Get in touch with our team." }],
          },
        ],
      },
    },
    slug: "contact",
    url: "/contact",
    created_at: "2024-01-11T11:00:00Z",
    updated_at: "2024-01-11T11:00:00Z",
    locale: "en-us",
    _metadata: {
      uid: "contact_page",
      content_type_uid: "page",
      updated_at: "2024-01-11T11:00:00Z",
    },
  },
];

// Mock product entries
const mockProductEntries = [
  {
    uid: "product_1",
    name: "Premium Widget",
    description: "A high-quality widget for all your needs",
    price: 99.99,
    category: "widgets",
    url: "/products/premium-widget",
    created_at: "2024-01-12T08:00:00Z",
    updated_at: "2024-01-12T08:00:00Z",
    locale: "en-us",
    _metadata: {
      uid: "product_1",
      content_type_uid: "product",
      updated_at: "2024-01-12T08:00:00Z",
    },
  },
];

// Different SDK response formats for testing

// Format 1: Array response [entries, schema, count]
const mockArrayResponse = (entries, count = null) => [
  entries,
  {}, // schema object (usually empty in responses)
  count || entries.length,
];

// Format 2: Object response { entries: [...], count: number }
const mockObjectResponse = (entries, count = null) => ({
  entries,
  count: count || entries.length,
});

// Mock error responses
const mockContentStackErrors = {
  unauthorized: {
    error_message: "Unauthorized. Please check your credentials.",
    error_code: "UNAUTHORIZED",
    status: 401,
    errors: [],
  },

  forbidden: {
    error_message: "Access forbidden. Check your permissions.",
    error_code: "FORBIDDEN",
    status: 403,
    errors: [],
  },

  notFound: {
    error_message: "The requested content type was not found.",
    error_code: "NOT_FOUND",
    status: 404,
    errors: [],
  },

  rateLimited: {
    error_message: "Rate limit exceeded. Please try again later.",
    error_code: "RATE_LIMIT_EXCEEDED",
    status: 429,
    errors: [],
  },

  serverError: {
    error_message: "Internal server error. Please try again.",
    error_code: "INTERNAL_SERVER_ERROR",
    status: 500,
    errors: [],
  },

  networkTimeout: {
    message: "Request timeout",
    code: "ETIMEDOUT",
    errno: -4039,
  },

  connectionReset: {
    message: "Connection reset by peer",
    code: "ECONNRESET",
    errno: -4077,
  },

  dnsError: {
    message: "getaddrinfo ENOTFOUND api.contentstack.io",
    code: "ENOTFOUND",
    errno: -3008,
  },
};

// Mock HTTP response errors
const mockHttpErrors = {
  badGateway: {
    response: {
      status: 502,
      data: {
        message: "Bad Gateway",
        error:
          "The server received an invalid response from the upstream server",
      },
    },
  },

  serviceUnavailable: {
    response: {
      status: 503,
      data: {
        message: "Service Unavailable",
        error: "The server is temporarily unable to handle the request",
      },
    },
  },

  gatewayTimeout: {
    response: {
      status: 504,
      data: {
        message: "Gateway Timeout",
        error:
          "The server did not receive a timely response from the upstream server",
      },
    },
  },
};

// Utility functions for creating test scenarios
const createPaginatedResponse = (allEntries, limit, skip) => {
  const paginatedEntries = allEntries.slice(skip, skip + limit);
  return mockArrayResponse(paginatedEntries, allEntries.length);
};

const createEmptyResponse = () => mockArrayResponse([], 0);

const createLargeDataset = (contentType, count) => {
  return Array.from({ length: count }, (_, index) => ({
    uid: `${contentType}_${index + 1}`,
    title: `${contentType} Entry ${index + 1}`,
    description: `Description for ${contentType} entry ${index + 1}`,
    url: `/${contentType}/${contentType}-entry-${index + 1}`,
    created_at: new Date(Date.now() - (count - index) * 86400000).toISOString(),
    updated_at: new Date(Date.now() - (count - index) * 86400000).toISOString(),
    locale: "en-us",
    _metadata: {
      uid: `${contentType}_${index + 1}`,
      content_type_uid: contentType,
      updated_at: new Date(
        Date.now() - (count - index) * 86400000
      ).toISOString(),
    },
  }));
};

module.exports = {
  mockContentTypesResponse,
  mockBlogPostEntries,
  mockPageEntries,
  mockProductEntries,
  mockArrayResponse,
  mockObjectResponse,
  mockContentStackErrors,
  mockHttpErrors,
  createPaginatedResponse,
  createEmptyResponse,
  createLargeDataset,
};
