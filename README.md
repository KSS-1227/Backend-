# Search Backend API

A production-ready backend built with Node.js, Express, Supabase, Contentstack, and OpenAI for semantic search functionality.

## 🚀 Features

- **Semantic Search**: Vector-based search using OpenAI embeddings
- **CMS Integration**: Sync content from Contentstack
- **Analytics**: Comprehensive search analytics and insights
- **Real-time**: Background jobs for content synchronization
- **Production Ready**: Logging, error handling, and monitoring

## 🛠️ Tech Stack

- **Runtime**: Node.js (>= 18.0.0)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL + pgvector)
- **CMS**: Contentstack
- **AI**: OpenAI (text-embedding-3-large)
- **Logging**: Morgan + Custom Logger
- **Scheduling**: node-cron

## 📋 Prerequisites

1. **Node.js** (>= 18.0.0)
2. **Supabase Project** with pgvector extension
3. **Contentstack Account** with API credentials
4. **OpenAI API Key**

## 🔧 Setup

### 1. Clone and Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Setup

Run this SQL in your Supabase SQL Editor:

```sql
create extension if not exists vector;

create table content_entries (
  id text primary key,
  title text,
  snippet text,
  url text,
  content_type text,
  locale text,
  updated_at timestamptz,
  embedding vector(1536)
);

create table query_logs (
  id uuid primary key default gen_random_uuid(),
  query text,
  filters jsonb,
  timestamp timestamptz default now(),
  hits int
);

create or replace function match_content (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) returns table (
  id text,
  title text,
  snippet text,
  url text,
  content_type text,
  locale text,
  similarity float
) language sql stable as $$
  select
    id,
    title,
    snippet,
    url,
    content_type,
    locale,
    1 - (embedding <=> query_embedding) as similarity
  from content_entries
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in your credentials:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key

# Contentstack Configuration
CONTENTSTACK_API_KEY=your_api_key
CONTENTSTACK_DELIVERY_TOKEN=your_delivery_token
CONTENTSTACK_ENVIRONMENT=development

# OpenAI Configuration
OPENAI_API_KEY=sk-your_openai_api_key
```

### 4. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## 📚 API Endpoints

### 🔍 Search API

```bash
# Semantic search
POST /api/search
{
  "query": "your search query",
  "filters": {
    "contentTypes": ["blog_post"],
    "locales": ["en-us"]
  },
  "limit": 10,
  "threshold": 0.5
}

# Search stats
GET /api/search/stats

# Text similarity (testing)
POST /api/search/similarity
{
  "text1": "first text",
  "text2": "second text"
}
```

### 🎛️ Filters API

```bash
# Get all filter options
GET /api/filters

# Get content types only
GET /api/filters/content-types

# Get locales only
GET /api/filters/locales

# Get filter statistics
GET /api/filters/stats
```

### 📊 Analytics API

```bash
# Dashboard data
GET /api/analytics/dashboard?days=7

# Top search queries
GET /api/analytics/top-queries?limit=10&days=7

# Search trends
GET /api/analytics/trends?days=7

# Success rate
GET /api/analytics/success-rate?days=7

# Word cloud data
GET /api/analytics/wordcloud?limit=50&days=7

# Real-time stats
GET /api/analytics/realtime

# Export analytics
GET /api/analytics/export?days=30&format=csv
```

### ⚙️ Admin/Health

```bash
# Health check
GET /health

# Manual content sync
node jobs/syncContent.js
```

## 🔄 Background Jobs

### Content Sync Job

Automatically runs every hour to:

1. Fetch content from Contentstack
2. Generate embeddings via OpenAI
3. Sync to Supabase database

```bash
# Manual sync
npm run sync

# Or run directly
node jobs/syncContent.js
```

## 🏗️ Project Structure

```
backend/
├── index.js              # Entry point
├── app.js                # Express app setup
├── routes/               # API route handlers
│   ├── search.js         # Search endpoints
│   ├── filters.js        # Filter endpoints
│   └── analytics.js      # Analytics endpoints
├── services/             # Business logic
│   ├── supabase.js       # Supabase client & operations
│   ├── contentstack.js   # Contentstack integration
│   ├── embeddings.js     # OpenAI embeddings
│   └── analytics.js      # Analytics processing
├── jobs/                 # Background jobs
│   └── syncContent.js    # Content synchronization
├── utils/                # Utilities
│   ├── config.js         # Configuration management
│   └── logger.js         # Logging utility
├── package.json          # Dependencies
└── .env.example          # Environment template
```

## 🔐 Environment Variables

| Variable                      | Required | Description                                  |
| ----------------------------- | -------- | -------------------------------------------- |
| `SUPABASE_URL`                | ✅       | Your Supabase project URL                    |
| `SUPABASE_KEY`                | ✅       | Supabase anon/service role key               |
| `CONTENTSTACK_API_KEY`        | ✅       | Contentstack API key                         |
| `CONTENTSTACK_DELIVERY_TOKEN` | ✅       | Contentstack delivery token                  |
| `OPENAI_API_KEY`              | ✅       | OpenAI API key                               |
| `CONTENTSTACK_ENVIRONMENT`    | ✅       | Contentstack environment (e.g., development) |
| `CONTENTSTACK_REGION`         | ⚠️       | Contentstack region (default: us)            |
| `CONTENTSTACK_LOCALES`        | ⚠️       | Comma-separated locales (default: en-us)     |
| `PORT`                        | ⚠️       | Server port (default: 3000)                  |
| `NODE_ENV`                    | ⚠️       | Environment (development/production)         |

## 🚦 Usage Examples

### Search Request

```javascript
const response = await fetch("/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "machine learning tutorials",
    filters: {
      contentTypes: ["blog_post", "tutorial"],
      locales: ["en-us"],
    },
    limit: 5,
    threshold: 0.7,
  }),
});

const data = await response.json();
console.log(data.results);
```

### Get Analytics Dashboard

```javascript
const analytics = await fetch("/api/analytics/dashboard?days=7");
const data = await analytics.json();

console.log("Total queries:", data.summary.totalQueries);
console.log("Success rate:", data.summary.successRate);
console.log("Top queries:", data.topQueries);
```

## 🐛 Troubleshooting

### Common Issues

1. **"Missing required environment variables"**

   - Copy `.env.example` to `.env`
   - Fill in all required credentials

2. **"Failed to connect to Supabase"**

   - Verify your Supabase URL and key
   - Ensure pgvector extension is enabled
   - Check database tables exist

3. **"OpenAI API error"**

   - Verify your OpenAI API key
   - Check your usage limits
   - Ensure you have access to embedding models

4. **"Contentstack fetch failed"**
   - Verify API key and delivery token
   - Check environment and region settings
   - Ensure content types exist

### Debug Mode

Set `NODE_ENV=development` for detailed logging:

```bash
NODE_ENV=development npm start
```

## 📈 Performance

- **Embeddings**: Batched processing (100 items per batch)
- **Database**: Optimized vector similarity search
- **Caching**: Built-in Supabase connection pooling
- **Rate Limiting**: Automatic delays for API calls

## 🔒 Security

- **Input Validation**: All endpoints validate input
- **Error Handling**: Sanitized error messages in production
- **CORS**: Configurable allowed origins
- **Headers**: Security headers via Helmet.js

## 📝 Logs

Logs are output in:

- **Development**: Pretty-printed format
- **Production**: Structured JSON format

Log levels: `ERROR`, `WARN`, `INFO`, `DEBUG`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
