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
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    credentials: true,
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: process.env.npm_package_version || "1.0.0",
  });
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
