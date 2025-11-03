# Ingestion Service

Isolated service for hourly ingestion of world information from RSS feeds, sitemaps, and news APIs.

## Phase 1: RSS Feed Ingestion (MVP)

Currently implements RSS feed ingestion with 10 default sources:
- Technology: Hacker News, TechCrunch, The Verge, Ars Technica
- News: BBC Technology, Reuters Technology, The Guardian Technology
- Science: Nature News, Scientific American
- Programming: GitHub Trending

## Architecture

- **Completely isolated**: Separate process, separate database, zero impact on main app
- **Hourly staggered execution**: Jobs spread across the hour (max 2 sources per minute)
- **Batch processing**: Efficient database writes in batches of 100 items
- **Deduplication**: Automatic duplicate detection by URL hash
- **TTL-based expiration**: Content expires based on category (7-30 days)

## Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run in development
pnpm dev

# Run in production
pnpm start
```

## Configuration

Environment variables (add to root `.env`):

```bash
# Enable/disable ingestion service
INGESTION_ENABLED=true

# Database path (default: ./data/ingestion.db)
INGESTION_DB_PATH=./data/ingestion.db

# Maximum items per hour (default: 500)
INGESTION_MAX_ITEMS_PER_HOUR=500

# Batch size for database writes (default: 100)
INGESTION_BATCH_SIZE=100

# Service port for health check (default: 3002)
INGESTION_SERVICE_PORT=3002

# Log level (default: info)
LOG_LEVEL=info
```

## Database Schema

The service creates a separate SQLite database with the following tables:

- `ingested_content` - Stores ingested items
- `ingestion_jobs` - Tracks ingestion job execution
- `sources` - Configuration for RSS feeds and other sources
- `crawled_urls` - For future sitemap support

## Usage

### Start the service

```bash
cd apps/ingestion-service
pnpm start
```

The service will:
1. Initialize the database and create schema
2. Load 10 default RSS feed sources
3. Start hourly scheduler with staggered execution
4. Process sources automatically

### Health Check

```bash
curl http://localhost:3002/health
```

Returns:
```json
{
  "status": "ok",
  "uptime": 3600,
  "sourceCount": 10,
  "nextRuns": [...]
}
```

## Monitoring

The service logs:
- Source ingestion start/complete
- Items ingested/skipped per source
- Job execution times
- Errors and failures

Check logs for:
- Successful ingestion counts
- Duplicate detection rates
- Source failure patterns

## Adding New Sources

Sources are defined in `src/config.ts`. To add more:

```typescript
{
  id: 'source-id',
  type: 'rss',
  url: 'https://example.com/feed.xml',
  name: 'Source Name',
  category: 'tech',
  enabled: true,
  updateInterval: 60, // minutes
  priority: 7, // 1-10
  rateLimitPerHour: 60,
}
```

## Database Location

By default, the database is created at:
- `./data/ingestion.db` (relative to ingestion-service directory)
- Or as specified by `INGESTION_DB_PATH`

The database is completely separate from the main application databases.

## Performance

- **Zero impact on main app**: Runs in separate process
- **Resource usage**: ~0.5 CPU core, ~200-500 MB RAM
- **Throughput**: 300-500 items/hour from 10 RSS feeds
- **Storage**: ~5 KB per item = ~50 MB/day = ~1.5 GB/month

## Next Steps (Future Phases)

- Phase 2: Add sitemap crawling
- Phase 3: Enhance with NewsData.io scheduled ingestion
- Phase 4: Integration with Haiku 3 context retrieval

