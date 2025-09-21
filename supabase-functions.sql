-- Complete Supabase Database Setup for Search Application
-- Run this in your Supabase SQL Editor

-- Enable vector extension (if not already enabled)
create extension if not exists vector;

-- Ensure tables exist (from README.md but complete versions)
create table if not exists content_entries (
  id text primary key,
  title text,
  snippet text,
  url text,
  content_type text,
  locale text,
  updated_at timestamptz,
  embedding vector(1536)
);

create table if not exists query_logs (
  id uuid primary key default gen_random_uuid(),
  query text,
  filters jsonb,
  timestamp timestamptz default now(),
  hits int
);

create table if not exists search_analytics (
  id uuid primary key default gen_random_uuid(),
  query text,
  filters jsonb,
  results_count int4,
  response_time_ms int4,
  timestamp timestamptz default now()
);

-- ========================================
-- MISSING FUNCTIONS - CRITICAL TO ADD
-- ========================================

-- 1. Enhanced match_content function with filtering support
create or replace function match_content (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_content_types text[] default null,
  filter_locales text[] default null
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
    content_entries.id,
    content_entries.title,
    content_entries.snippet,
    content_entries.url,
    content_entries.content_type,
    content_entries.locale,
    1 - (content_entries.embedding <=> query_embedding) as similarity
  from content_entries
  where 
    1 - (content_entries.embedding <=> query_embedding) > match_threshold
    and (filter_content_types is null or content_entries.content_type = any(filter_content_types))
    and (filter_locales is null or content_entries.locale = any(filter_locales))
  order by content_entries.embedding <=> query_embedding
  limit match_count;
$$;

-- 2. Get top queries function for analytics
create or replace function get_top_queries (
  limit_count int default 10,
  days_interval int default 7
) returns table (
  query text,
  query_count bigint,
  avg_hits numeric,
  last_searched timestamptz
) language sql stable as $$
  select
    query_logs.query,
    count(*) as query_count,
    round(avg(query_logs.hits::numeric), 2) as avg_hits,
    max(query_logs.timestamp) as last_searched
  from query_logs
  where 
    query_logs.timestamp >= (now() - interval '1 day' * days_interval)
    and query_logs.query is not null
    and trim(query_logs.query) != ''
  group by query_logs.query
  order by query_count desc, last_searched desc
  limit limit_count;
$$;

-- 3. Additional useful analytics functions
create or replace function get_search_stats (
  days_interval int default 7
) returns table (
  total_searches bigint,
  successful_searches bigint,
  success_rate numeric,
  avg_results_per_search numeric,
  unique_queries bigint
) language sql stable as $$
  select
    count(*) as total_searches,
    count(*) filter (where hits > 0) as successful_searches,
    round(
      (count(*) filter (where hits > 0)::numeric / count(*)::numeric) * 100, 2
    ) as success_rate,
    round(avg(hits::numeric), 2) as avg_results_per_search,
    count(distinct query) as unique_queries
  from query_logs
  where timestamp >= (now() - interval '1 day' * days_interval);
$$;

-- 4. Function to clean old query logs (optional, for maintenance)
create or replace function cleanup_old_logs (
  retention_days int default 30
) returns int language plpgsql as $$
declare
  deleted_count int;
begin
  delete from query_logs 
  where timestamp < (now() - interval '1 day' * retention_days);
  
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Index for vector similarity search (critical for performance)
create index if not exists content_entries_embedding_idx on content_entries 
using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Indexes for filtering
create index if not exists content_entries_content_type_idx on content_entries (content_type);
create index if not exists content_entries_locale_idx on content_entries (locale);
create index if not exists content_entries_updated_at_idx on content_entries (updated_at);

-- Indexes for query logs and analytics
create index if not exists query_logs_timestamp_idx on query_logs (timestamp);
create index if not exists query_logs_query_idx on query_logs (query);
create index if not exists query_logs_hits_idx on query_logs (hits);

-- Index for search analytics
create index if not exists search_analytics_timestamp_idx on search_analytics (timestamp);

-- ========================================
-- ROW LEVEL SECURITY (Optional but recommended)
-- ========================================

-- Enable RLS
alter table content_entries enable row level security;
alter table query_logs enable row level security;
alter table search_analytics enable row level security;

-- Allow public read access (adjust based on your security requirements)
create policy "Allow public read access on content_entries" on content_entries
  for select using (true);

create policy "Allow public insert on query_logs" on query_logs
  for insert with check (true);

create policy "Allow public read access on query_logs" on query_logs
  for select using (true);

create policy "Allow public access on search_analytics" on search_analytics
  for all using (true);

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
