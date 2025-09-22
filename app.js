const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const config = require("./utils/config");
const logger = require("./utils/logger");

// Import routes
const searchRoutes = require("./routes/search");
const filtersRoutes = require("./routes/filters");
const analyticsRoutes = require("./routes/analytics");
const webhooksRoutes = require("./routes/webhooks");
const blogsRouter = require("./routes/blog"); // Assuming the file is blog.js as provided
const healthRoutes = require("./routes/health");

const app = express();

// Security middleware
app.use(helmet());

// Compression middleware
app.use(compression());

// CORS middleware
app.use(
  cors({
    origin: "https://semantic-search-frontend.eu-contentstackapps.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Origin",
      "X-Requested-With",
      "Accept",
    ],
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
if (config.nodeEnv === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Custom request logger
app.use(logger.requestLogger());

// Serve static files (for favicon and other assets)
app.use(express.static("public"));

// Favicon handler to prevent 404 errors
app.get("/favicon.ico", (req, res) => {
  res.status(204).end(); // No content response
});

// Root route - API welcome message
app.get("/", (req, res) => {
  res.json({
    message: "Backend API is running successfully!",
    status: "active",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    endpoints: {
      health: "/health",
      search: "/api/search",
      filters: "/api/filters",
      analytics: "/api/analytics",
      webhooks: "/api/webhook",
      blogs: "/api/blogs",
    },
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv || "production",
    cors: "enabled",
  });
});

// Simple test endpoints for debugging
app.get("/api/test", (req, res) => {
  res.json({
    message: "API GET is working!",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv || "production",
  });
});

app.post("/api/test", (req, res) => {
  res.json({
    message: "API POST is working!",
    body: req.body,
    timestamp: new Date().toISOString(),
  });
});

// Test OpenAI API connection with detailed diagnostics
app.get("/api/test-openai", async (req, res) => {
  try {
    // Check API key format first
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        status: "error",
        message: "OpenAI API key is missing from environment variables",
        timestamp: new Date().toISOString(),
      });
    }

    console.log("OpenAI API Key format:", apiKey.substring(0, 10) + "...");
    console.log("API Key length:", apiKey.length);
    console.log("API Key starts with:", apiKey.substring(0, 8));

    const embeddingsService = require("./services/embeddings");

    console.log("Testing OpenAI API...");
    const testEmbedding = await embeddingsService.generateEmbedding(
      "test query"
    );

    res.json({
      status: "success",
      message: "OpenAI API is working!",
      embeddingLength: testEmbedding.length,
      keyFormat: apiKey.substring(0, 8) + "...",
      keyLength: apiKey.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("OpenAI test failed:", error);
    res.status(500).json({
      status: "error",
      message: "OpenAI API failed",
      error: error.message,
      errorCode: error.code || "unknown",
      keyFormat: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY.substring(0, 8) + "..."
        : "missing",
      timestamp: new Date().toISOString(),
    });
  }
});

// Test Supabase connection
app.get("/api/test-supabase", async (req, res) => {
  try {
    const supabaseService = require("./services/supabase");

    console.log("Testing Supabase connection...");
    // Try to get filter options (simple query)
    const filterOptions = await supabaseService.getFilterOptions();

    res.json({
      status: "success",
      message: "Supabase connection is working!",
      contentTypes: filterOptions.contentTypes?.length || 0,
      locales: filterOptions.locales?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Supabase test failed:", error);
    res.status(500).json({
      status: "error",
      message: "Supabase connection failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test both services together
app.get("/api/test-services", async (req, res) => {
  const results = {
    openai: { status: "unknown" },
    supabase: { status: "unknown" },
    timestamp: new Date().toISOString(),
  };

  // Test OpenAI
  try {
    const embeddingsService = require("./services/embeddings");
    await embeddingsService.generateEmbedding("test");
    results.openai = { status: "success", message: "OpenAI working" };
  } catch (error) {
    results.openai = { status: "error", message: error.message };
  }

  // Test Supabase
  try {
    const supabaseService = require("./services/supabase");
    await supabaseService.getFilterOptions();
    results.supabase = { status: "success", message: "Supabase working" };
  } catch (error) {
    results.supabase = { status: "error", message: error.message };
  }

  const allWorking =
    results.openai.status === "success" &&
    results.supabase.status === "success";

  res.status(allWorking ? 200 : 500).json({
    status: allWorking ? "success" : "error",
    message: allWorking ? "All services working!" : "Some services failed",
    results: results,
  });
});

// Test Contentstack blog entries
app.get("/api/test-contentstack-blogs", async (req, res) => {
  try {
    const contentstackService = require("./services/contentstack");

    console.log("Fetching blog entries from Contentstack...");

    // Try to fetch blog posts
    const blogPosts = await contentstackService.fetchBlogPosts();

    res.json({
      status: "success",
      message: "Successfully fetched blog entries from Contentstack",
      totalEntries: blogPosts.length,
      entries: blogPosts.map((post) => ({
        uid: post.uid,
        title: post.title,
        url: post.url || post.slug,
        created_at: post.created_at,
        updated_at: post.updated_at,
        locale: post.locale,
        contentPreview: post.content
          ? post.content.substring(0, 200) + "..."
          : "No content",
        tags: post.tags || [],
        category: post.category || "Uncategorized",
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Contentstack blog fetch failed:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch blog entries from Contentstack",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Test all Contentstack content
app.get("/api/test-contentstack-all", async (req, res) => {
  try {
    const contentstackService = require("./services/contentstack");

    console.log("Fetching all content from Contentstack...");

    // Get all entries across all content types
    const allEntries = await contentstackService.getAllEntries();

    // Group by content type
    const groupedEntries = {};
    allEntries.forEach((entry) => {
      const contentType = entry.contentType || "unknown";
      if (!groupedEntries[contentType]) {
        groupedEntries[contentType] = [];
      }
      groupedEntries[contentType].push({
        uid: entry.uid,
        title: entry.title,
        url: entry.url || entry.slug,
        locale: entry.locale,
        created_at: entry.created_at,
        contentPreview: entry.content
          ? entry.content.substring(0, 150) + "..."
          : "No content",
      });
    });

    res.json({
      status: "success",
      message: "Successfully fetched all content from Contentstack",
      totalEntries: allEntries.length,
      contentTypes: Object.keys(groupedEntries),
      entriesByType: groupedEntries,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Contentstack all content fetch failed:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch content from Contentstack",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// API routes
app.use("/api/search", searchRoutes);
app.use("/api/filters", filtersRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/webhook", webhooksRoutes);
app.use("/api/blogs", blogsRouter);
app.use("/api/health", healthRoutes);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  const statusCode = err.statusCode || err.status || 500;
  const message =
    config.nodeEnv === "development" ? err.message : "Internal Server Error";

  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
    ...(config.nodeEnv === "development" && { stack: err.stack }),
  });
});

module.exports = app;
