const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const config = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },

  // Contentstack configuration
  contentstack: {
    apiKey: process.env.CONTENTSTACK_API_KEY,
    deliveryToken: process.env.CONTENTSTACK_DELIVERY_TOKEN,
    environment: process.env.CONTENTSTACK_ENVIRONMENT || "development",
    region: process.env.CONTENTSTACK_REGION || "us", // Changed default from "eu" to "us" for better compatibility
    // Timeout and retry configuration
    timeout: parseInt(process.env.CONTENTSTACK_TIMEOUT) || 30000, // 30 seconds default
    retryLimit: parseInt(process.env.CONTENTSTACK_RETRY_LIMIT) || 3,
    retryDelay: parseInt(process.env.CONTENTSTACK_RETRY_DELAY) || 1000, // 1 second default
    // Optional host override
    host: process.env.CONTENTSTACK_HOST,
  },

  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: "text-embedding-3-small", // Changed to match 1536 dimensions
    maxTokens: 4000, // Reduced for better performance
  },

  // Search configuration
  search: {
    defaultLimit: 10,
    maxLimit: 100,
    defaultThreshold: 0.5,
    embeddingDimensions: 1536,
  },

  // Analytics configuration
  analytics: {
    retentionDays: 30,
    maxWordCloudTerms: 50,
  },
};

// Validate required environment variables
const requiredVars = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "CONTENTSTACK_API_KEY",
  "CONTENTSTACK_DELIVERY_TOKEN",
  "CONTENTSTACK_ENVIRONMENT",
  "OPENAI_API_KEY",
];

const missingVars = requiredVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(
    "❌ Configuration Error: Missing required environment variables"
  );
  console.error(`Missing variables: ${missingVars.join(", ")}`);
  console.error("\n🔧 To fix this issue:");
  console.error("1. Copy .env.example to .env: cp .env.example .env");
  console.error("2. Update the following variables in your .env file:");

  missingVars.forEach((varName) => {
    switch (varName) {
      case "SUPABASE_URL":
        console.error(
          `   - ${varName}: Get from your Supabase project dashboard > Settings > API`
        );
        break;
      case "SUPABASE_KEY":
        console.error(
          `   - ${varName}: Get the 'anon public' key from Supabase project dashboard > Settings > API`
        );
        break;
      case "CONTENTSTACK_API_KEY":
        console.error(
          `   - ${varName}: Get from ContentStack dashboard > Settings > Stack Settings > API Keys`
        );
        break;
      case "CONTENTSTACK_DELIVERY_TOKEN":
        console.error(
          `   - ${varName}: Get from ContentStack dashboard > Settings > Tokens > Delivery Tokens`
        );
        break;
      case "CONTENTSTACK_ENVIRONMENT":
        console.error(
          `   - ${varName}: Set to your ContentStack environment name (e.g., 'development', 'production')`
        );
        break;
      case "OPENAI_API_KEY":
        console.error(
          `   - ${varName}: Get from OpenAI dashboard > API Keys (https://platform.openai.com/api-keys)`
        );
        break;
      default:
        console.error(
          `   - ${varName}: Check documentation for required value`
        );
    }
  });

  console.error("\n📚 For more help, see the README.md file");
  process.exit(1);
}

// Validate ContentStack SDK configuration values
function validateContentStackConfig() {
  const warnings = [];
  const errors = [];

  // Validate timeout
  if (config.contentstack.timeout < 5000) {
    warnings.push(
      "⚠️  CONTENTSTACK_TIMEOUT is less than 5 seconds. This may cause timeouts for large content requests."
    );
  }
  if (config.contentstack.timeout > 120000) {
    warnings.push(
      "⚠️  CONTENTSTACK_TIMEOUT is greater than 2 minutes. Consider reducing for better user experience."
    );
  }

  // Validate retry limit
  if (config.contentstack.retryLimit > 5) {
    warnings.push(
      "⚠️  CONTENTSTACK_RETRY_LIMIT is greater than 5. High retry counts may cause delays."
    );
  }
  if (config.contentstack.retryLimit < 1) {
    errors.push(
      "❌ CONTENTSTACK_RETRY_LIMIT must be at least 1. Set to a value between 1-5."
    );
  }

  // Validate retry delay
  if (config.contentstack.retryDelay < 100) {
    warnings.push(
      "⚠️  CONTENTSTACK_RETRY_DELAY is less than 100ms. This may cause rate limiting issues."
    );
  }
  if (config.contentstack.retryDelay > 10000) {
    warnings.push(
      "⚠️  CONTENTSTACK_RETRY_DELAY is greater than 10 seconds. Consider reducing for better performance."
    );
  }

  // Validate region
  const validRegions = ["us", "eu", "azure-na", "azure-eu", "gcp-na"];
  if (
    config.contentstack.region &&
    !validRegions.includes(config.contentstack.region)
  ) {
    errors.push(
      `❌ CONTENTSTACK_REGION '${
        config.contentstack.region
      }' is invalid. Valid options: ${validRegions.join(", ")}`
    );
  }

  // Display warnings
  if (warnings.length > 0) {
    console.warn("\n⚠️  ContentStack Configuration Warnings:");
    warnings.forEach((warning) => console.warn(warning));
    console.warn(
      "💡 These settings will work but may not be optimal. Check .env.example for recommended values.\n"
    );
  }

  // Display errors and exit if any
  if (errors.length > 0) {
    console.error("\n❌ ContentStack Configuration Errors:");
    errors.forEach((error) => console.error(error));
    console.error("\n🔧 To fix these issues:");
    console.error("1. Update your .env file with valid values");
    console.error("2. Refer to .env.example for recommended settings");
    console.error(
      "3. Check ContentStack documentation for region-specific settings"
    );
    process.exit(1);
  }
}

// Run validation
validateContentStackConfig();

module.exports = config;
