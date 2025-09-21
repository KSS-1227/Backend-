# ContentStack Configuration Guide

This guide explains the ContentStack SDK configuration options and how to troubleshoot common issues.

## Environment Variables

### Required Variables

| Variable                      | Description                       | Where to Find                                                 |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `CONTENTSTACK_API_KEY`        | Your ContentStack API key         | ContentStack Dashboard > Settings > Stack Settings > API Keys |
| `CONTENTSTACK_DELIVERY_TOKEN` | Delivery token for content access | ContentStack Dashboard > Settings > Tokens > Delivery Tokens  |
| `CONTENTSTACK_ENVIRONMENT`    | Environment name                  | ContentStack Dashboard > Settings > Environments              |

### Optional SDK Configuration

| Variable                   | Default | Description                                  | Recommended Range                  |
| -------------------------- | ------- | -------------------------------------------- | ---------------------------------- |
| `CONTENTSTACK_TIMEOUT`     | 30000   | API request timeout in milliseconds          | 30000-60000                        |
| `CONTENTSTACK_RETRY_LIMIT` | 3       | Number of retry attempts for failed requests | 2-5                                |
| `CONTENTSTACK_RETRY_DELAY` | 1000    | Delay between retry attempts in milliseconds | 1000-5000                          |
| `CONTENTSTACK_REGION`      | us      | ContentStack region                          | us, eu, azure-na, azure-eu, gcp-na |

## Common Issues and Solutions

### Authentication Errors (401 Unauthorized)

**Symptoms:**

- "Authentication failed" errors
- "Invalid API key" messages
- Health check fails with 401 status

**Solutions:**

1. Verify `CONTENTSTACK_API_KEY` is correct
2. Check that `CONTENTSTACK_DELIVERY_TOKEN` is valid and not expired
3. Ensure `CONTENTSTACK_ENVIRONMENT` matches your ContentStack environment
4. Confirm tokens have proper permissions in ContentStack dashboard

### Access Forbidden (403 Forbidden)

**Symptoms:**

- "Access forbidden" errors
- Permission denied messages

**Solutions:**

1. Check delivery token permissions in ContentStack dashboard
2. Verify environment access permissions
3. Ensure API key has proper scope for the environment

### Timeout Issues

**Symptoms:**

- Request timeout errors
- "ETIMEDOUT" errors
- Slow API responses

**Solutions:**

1. Increase `CONTENTSTACK_TIMEOUT` value (try 60000 for 60 seconds)
2. Check network connectivity
3. Verify `CONTENTSTACK_REGION` is correct for your stack
4. Check ContentStack status page for service issues

### DNS Resolution Errors

**Symptoms:**

- "ENOTFOUND" errors
- DNS lookup failures
- Cannot connect to ContentStack

**Solutions:**

1. Verify `CONTENTSTACK_REGION` is correct
2. Check network connectivity
3. If using custom host, verify `CONTENTSTACK_HOST` setting

### SDK Errors

**Symptoms:**

- "Cannot call a class as a function" errors
- SDK initialization failures

**Solutions:**

1. Ensure ContentStack SDK is properly installed: `npm install contentstack`
2. Check that all required environment variables are set
3. Restart the application after configuration changes

## Health Check Endpoints

Use these endpoints to monitor ContentStack connectivity:

- `GET /api/health/contentstack` - Basic health check
- `GET /api/health/contentstack/monitor` - Detailed monitoring
- `GET /api/health/contentstack/metrics` - Performance metrics
- `GET /api/health/contentstack/errors` - Error statistics

## Configuration Validation

The application automatically validates your configuration on startup. If you see validation errors:

1. Check the error message for specific missing variables
2. Update your `.env` file with the required values
3. Restart the application
4. Use the health check endpoints to verify connectivity

## Performance Tuning

For optimal performance:

- Set `CONTENTSTACK_TIMEOUT` to 30000-60000ms
- Use `CONTENTSTACK_RETRY_LIMIT` of 2-5 attempts
- Set `CONTENTSTACK_RETRY_DELAY` to 1000-5000ms
- Choose the correct `CONTENTSTACK_REGION` for your stack location

## Getting Help

If you continue to experience issues:

1. Check the application logs for detailed error messages
2. Use the health check endpoints for diagnostics
3. Verify your ContentStack dashboard settings
4. Consult the ContentStack documentation for your specific setup
