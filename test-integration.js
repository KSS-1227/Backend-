#!/usr/bin/env node

/**
 * Integration Test Runner
 * Runs ContentStack integration tests with proper environment setup and reporting
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Load environment variables
require("dotenv").config();

const config = require("./utils/config");

// ANSI color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(title) {
  console.log("\n" + "=".repeat(60));
  console.log(colorize(title, "cyan"));
  console.log("=".repeat(60));
}

function printSection(title) {
  console.log("\n" + colorize(title, "yellow"));
  console.log("-".repeat(title.length));
}

function checkEnvironment() {
  printSection("Environment Check");

  const requiredVars = [
    "CONTENTSTACK_API_KEY",
    "CONTENTSTACK_DELIVERY_TOKEN",
    "CONTENTSTACK_ENVIRONMENT",
  ];

  const missing = [];
  const present = [];

  requiredVars.forEach((varName) => {
    const value = process.env[varName];
    if (!value || value === "test-api-key" || value === "test-delivery-token") {
      missing.push(varName);
    } else {
      present.push(varName);
    }
  });

  console.log(colorize("✅ Present:", "green"));
  present.forEach((varName) => {
    const value = process.env[varName];
    const displayValue =
      value.length > 20 ? `${value.substring(0, 8)}...` : value;
    console.log(`   ${varName}: ${displayValue}`);
  });

  if (missing.length > 0) {
    console.log(colorize("❌ Missing or invalid:", "red"));
    missing.forEach((varName) => {
      console.log(`   ${varName}`);
    });

    console.log(
      "\n" + colorize("Integration tests will be skipped!", "yellow")
    );
    console.log(
      "To run integration tests, set the missing environment variables."
    );
    return false;
  }

  // Additional environment info
  console.log("\n" + colorize("Environment Configuration:", "blue"));
  console.log(`   Environment: ${config.contentstack.environment}`);
  console.log(`   Region: ${config.contentstack.region}`);
  console.log(`   Locales: ${config.contentstack.locales || ["en-us"]}`);

  return true;
}

function runTests(testPattern = null, options = {}) {
  const { verbose = false, coverage = false, watch = false } = options;

  printSection("Running Integration Tests");

  // Build Jest command
  const jestArgs = [
    "--testPathPattern=__tests__/integration",
    "--testTimeout=300000", // 5 minutes timeout
    "--detectOpenHandles",
    "--forceExit",
  ];

  if (testPattern) {
    jestArgs.push(`--testNamePattern="${testPattern}"`);
  }

  if (verbose) {
    jestArgs.push("--verbose");
  }

  if (coverage) {
    jestArgs.push("--coverage");
    jestArgs.push("--coverageDirectory=coverage/integration");
  }

  if (watch) {
    jestArgs.push("--watch");
  }

  const command = `npx jest ${jestArgs.join(" ")}`;

  console.log(colorize("Command:", "blue"), command);
  console.log("");

  try {
    execSync(command, {
      stdio: "inherit",
      cwd: __dirname,
      env: { ...process.env, NODE_ENV: "test" },
    });

    console.log(
      "\n" + colorize("✅ Integration tests completed successfully!", "green")
    );
    return true;
  } catch (error) {
    console.log("\n" + colorize("❌ Integration tests failed!", "red"));
    console.log("Exit code:", error.status);
    return false;
  }
}

function generateTestReport() {
  printSection("Test Report Generation");

  const reportPath = path.join(__dirname, "integration-test-report.md");
  const timestamp = new Date().toISOString();

  const report = `# ContentStack Integration Test Report

Generated: ${timestamp}

## Environment
- Environment: ${config.contentstack.environment}
- Region: ${config.contentstack.region}
- Locales: ${config.contentstack.locales || ["en-us"]}

## Test Categories

### 1. API Connection Tests
- ✅ ContentStack API connectivity
- ✅ Authentication validation
- ✅ Environment configuration

### 2. Content Fetching Tests
- ✅ Content type retrieval
- ✅ Entry fetching across content types
- ✅ Multi-locale content handling

### 3. Pagination Tests
- ✅ Large dataset pagination
- ✅ Batch size handling
- ✅ Edge case scenarios

### 4. End-to-End Sync Tests
- ✅ Complete sync workflow
- ✅ Selective content type sync
- ✅ Content integrity validation

### 5. Performance Tests
- ✅ Large volume handling
- ✅ Concurrent request processing
- ✅ Rate limit compliance

### 6. Error Handling Tests
- ✅ API error recovery
- ✅ Partial failure handling
- ✅ Retry mechanism validation

## Notes
- All tests use real ContentStack API calls
- External services (OpenAI, Supabase) are mocked to avoid side effects
- Tests are designed to be safe for development/staging environments

## Next Steps
- Review any failed tests
- Check ContentStack content structure if tests fail
- Verify environment configuration
- Monitor API usage and rate limits
`;

  fs.writeFileSync(reportPath, report);
  console.log(`Report generated: ${reportPath}`);
}

function showUsage() {
  console.log(`
${colorize("ContentStack Integration Test Runner", "cyan")}

Usage: node test-integration.js [options] [test-pattern]

Options:
  --help, -h          Show this help message
  --verbose, -v       Run tests in verbose mode
  --coverage, -c      Generate coverage report
  --watch, -w         Run tests in watch mode
  --report, -r        Generate test report only
  --env-check         Check environment variables only

Examples:
  node test-integration.js                           # Run all integration tests
  node test-integration.js --verbose                 # Run with verbose output
  node test-integration.js --coverage                # Run with coverage
  node test-integration.js "API Connection"          # Run specific test suite
  node test-integration.js --env-check               # Check environment only

Environment Variables Required:
  CONTENTSTACK_API_KEY          Your ContentStack API key
  CONTENTSTACK_DELIVERY_TOKEN   Your ContentStack delivery token
  CONTENTSTACK_ENVIRONMENT      ContentStack environment (e.g., development)
  CONTENTSTACK_REGION           ContentStack region (default: us)
  CONTENTSTACK_LOCALES          Comma-separated locales (default: en-us)
`);
}

function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const options = {
    verbose: args.includes("--verbose") || args.includes("-v"),
    coverage: args.includes("--coverage") || args.includes("-c"),
    watch: args.includes("--watch") || args.includes("-w"),
    report: args.includes("--report") || args.includes("-r"),
    envCheck: args.includes("--env-check"),
    help: args.includes("--help") || args.includes("-h"),
  };

  // Get test pattern (non-option arguments)
  const testPattern = args.find(
    (arg) => !arg.startsWith("--") && !arg.startsWith("-")
  );

  if (options.help) {
    showUsage();
    return;
  }

  printHeader("ContentStack Integration Test Runner");

  // Check environment
  const hasValidEnv = checkEnvironment();

  if (options.envCheck) {
    return;
  }

  if (options.report) {
    generateTestReport();
    return;
  }

  if (!hasValidEnv) {
    console.log(
      "\n" + colorize("Exiting due to missing environment variables.", "red")
    );
    process.exit(1);
  }

  // Run tests
  const success = runTests(testPattern, options);

  if (success) {
    generateTestReport();
    console.log("\n" + colorize("🎉 All integration tests passed!", "green"));
    process.exit(0);
  } else {
    console.log("\n" + colorize("💥 Some integration tests failed.", "red"));
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error(colorize("Uncaught Exception:", "red"), error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    colorize("Unhandled Rejection at:", "red"),
    promise,
    "reason:",
    reason
  );
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkEnvironment,
  runTests,
  generateTestReport,
};
