# ContentStack Integration Tests

This directory contains comprehensive integration tests for the ContentStack SDK integration. These tests verify that the ContentStack service works correctly with real ContentStack API data across different environments and scenarios.

## Overview

The integration tests are designed to:

1. **Test Real API Integration**: Call actual ContentStack APIs to verify SDK functionality
2. **Validate Pagination**: Test pagination with real data across different content volumes
3. **Verify Multi-Environment Support**: Ensure the integration works across different ContentStack environments
4. **Test End-to-End Sync**: Validate the complete sync job workflow with real ContentStack content
5. **Performance Testing**: Verify the integration handles large content volumes efficiently
6. **Error Handling**: Test recovery mechanisms with real API error scenarios

## Test Files

### `contentstack-real-api.test.js`

Core integration tests that call the actual ContentStack API:

- **API Connection Tests**: Verify authentication and basic connectivity
- **Content Type Fetching**: Test content type retrieval across environments
- **Pagination Tests**: Validate pagination with real data
- **Multi-locale Support**: Test content fetching across different locales
- **Performance Tests**: Verify handling of large content volumes
- **Concurrency Tests**: Test multiple simultaneous API calls

### `sync-job-e2e.test.js`

End-to-end tests for the complete sync job workflow:

- **Full Sync Workflow**: Test complete sync job with real ContentStack data
- **Selective Sync**: Test syncing specific content types
- **Content Validation**: Verify content integrity during sync
- **Error Recovery**: Test fallback mechanisms and error handling
- **Performance Monitoring**: Validate sync performance with real data
- **Multi-locale Sync**: Test syncing across multiple locales

### `test-config.js`

Shared configuration and utilities for integration tests:

- Environment validation
- Test data generators
- Mock service utilities
- Performance measurement tools
- Error simulation helpers

## Prerequisites

### Environment Variables

The integration tests require valid ContentStack credentials:

```bash
# Required
CONTENTSTACK_API_KEY=your_contentstack_api_key
CONTENTSTACK_DELIVERY_TOKEN=your_contentstack_delivery_token
CONTENTSTACK_ENVIRONMENT=development  # or staging/production

# Optional
CONTENTSTACK_REGION=us                 # Default: us
CONTENTSTACK_LOCALES=en-us,es-es,fr-fr # Default: en-us
CONTENTSTACK_TIMEOUT=30000             # Default: 30000
CONTENTSTACK_RETRY_LIMIT=3             # Default: 3
```

### ContentStack Environment Setup

1. **Test Environment**: Use a development or staging ContentStack environment
2. **Content Types**: Ensure your environment has at least one content type with entries
3. **Locales**: Configure multiple locales if testing multi-locale functionality
4. **Permissions**: Ensure the API key has read permissions for all content types

## Running the Tests

### Using the Test Runner (Recommended)

```bash
# Check environment setup
npm run test:integration:env

# Run all integration tests
npm run test:integration

# Run with verbose output
npm run test:integration:verbose

# Run with coverage report
npm run test:integration:coverage

# Run specific test suite
node test-integration.js "API Connection"
```

### Using Jest Directly

```bash
# Run all integration tests
npx jest __tests__/integration --testTimeout=300000

# Run specific test file
npx jest __tests__/integration/contentstack-real-api.test.js

# Run with verbose output
npx jest __tests__/integration --verbose --testTimeout=300000
```

## Test Categories

### 1. Connection and Authentication

- Verify API connectivity
- Validate credentials and permissions
- Test environment-specific configuration

### 2. Content Type Operations

- Fetch all content types
- Validate content type structure
- Test content type consistency across environments

### 3. Entry Fetching

- Retrieve entries by content type
- Test different batch sizes
- Validate entry structure and data

### 4. Pagination Testing

- Test pagination with real data
- Verify large dataset handling
- Test edge cases (empty results, high skip values)

### 5. Multi-locale Support

- Fetch content in multiple locales
- Validate locale-specific data
- Test locale fallback mechanisms

### 6. End-to-End Sync

- Complete sync job workflow
- Content transformation and validation
- Integration with embeddings and database services

### 7. Performance and Scalability

- Large volume content handling
- Concurrent request processing
- Rate limit compliance
- Performance benchmarking

### 8. Error Handling and Recovery

- API error scenarios
- Network failure recovery
- Partial sync failure handling
- Retry mechanism validation

## Test Data Requirements

### Minimum Content Requirements

- At least 1 content type with entries
- At least 5 entries per content type (for pagination tests)
- Content with required fields (title, uid, etc.)

### Recommended Content Setup

- 2-3 different content types
- 10+ entries per content type
- Multiple locales configured
- Mix of content with different field types

## Mocking Strategy

The integration tests use a hybrid approach:

- **ContentStack API**: Real API calls to test actual integration
- **External Services**: Mocked to avoid side effects
  - OpenAI embeddings service (mocked)
  - Supabase database operations (mocked)
  - Email notifications (mocked)

This approach ensures we test the actual ContentStack integration while avoiding:

- Unnecessary API costs (OpenAI)
- Database pollution (Supabase)
- External service dependencies

## Performance Expectations

### Typical Performance Benchmarks

- Content type fetching: < 5 seconds
- Entry fetching (50 entries): < 10 seconds
- Full sync job: < 5 minutes (depends on content volume)
- Pagination (100 entries): < 30 seconds

### Performance Monitoring

Tests include performance monitoring to:

- Track API response times
- Monitor sync job duration
- Identify performance regressions
- Validate rate limit compliance

## Troubleshooting

### Common Issues

#### Tests Skipped

```
Integration Tests Skipped
Reason: No real ContentStack credentials found
```

**Solution**: Set the required environment variables

#### Authentication Errors

```
API credentials are invalid or lack proper permissions
```

**Solution**: Verify API key and delivery token, check permissions

#### Timeout Errors

```
Test timeout exceeded
```

**Solution**: Check network connectivity, increase timeout, or reduce test scope

#### No Content Found

```
No content types available for testing
```

**Solution**: Add content to your ContentStack environment

### Debug Mode

Enable debug logging:

```bash
DEBUG=contentstack* npm run test:integration
```

### Selective Testing

Run specific test categories:

```bash
# Test only API connection
node test-integration.js "API Connection"

# Test only pagination
node test-integration.js "Pagination"

# Test only sync job
node test-integration.js "Sync Job"
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: "18"

      - name: Install dependencies
        run: npm ci
        working-directory: ./backend

      - name: Run integration tests
        env:
          CONTENTSTACK_API_KEY: ${{ secrets.CONTENTSTACK_API_KEY }}
          CONTENTSTACK_DELIVERY_TOKEN: ${{ secrets.CONTENTSTACK_DELIVERY_TOKEN }}
          CONTENTSTACK_ENVIRONMENT: development
        run: npm run test:integration
        working-directory: ./backend
```

## Best Practices

### Test Environment Management

1. Use dedicated test/development ContentStack environments
2. Don't run integration tests against production
3. Regularly clean up test data
4. Monitor API usage and rate limits

### Test Data Management

1. Use consistent test content structure
2. Include edge cases in test data
3. Test with realistic content volumes
4. Validate data integrity regularly

### Performance Considerations

1. Run integration tests separately from unit tests
2. Use appropriate timeouts for different test types
3. Monitor and optimize slow tests
4. Consider parallel test execution for large suites

### Error Handling

1. Test both success and failure scenarios
2. Validate error messages and codes
3. Test recovery mechanisms
4. Include network failure simulations

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Include appropriate timeouts and error handling
3. Add performance monitoring for new operations
4. Update this documentation with new test categories
5. Ensure tests work across different ContentStack environments
6. Mock external services appropriately

## Support

For issues with integration tests:

1. Check environment variable configuration
2. Verify ContentStack environment setup
3. Review test logs for specific error messages
4. Check ContentStack API documentation for changes
5. Validate network connectivity and permissions
