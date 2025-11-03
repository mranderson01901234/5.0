# Ingestion Service Phase 1 - Setup Guide

## What Was Implemented

✅ **Complete Phase 1 MVP** - RSS Feed Ingestion System

### Components Created:

1. **Ingestion Service** (`apps/ingestion-service/`)
   - Isolated service with separate database
   - No dependencies on main app

2. **Database Schema** (`src/db.ts`)
   - `ingested_content` - Stores RSS items
   - `ingestion_jobs` - Tracks job execution
   - `sources` - Source configuration
   - `crawled_urls` - For future sitemap support

3. **RSS Processor** (`src/processors/rss.ts`)
   - Fetches and parses RSS feeds
   - Deduplicates by URL hash
   - Calculates priority and TTL

4. **Batch Writer** (`src/writers/batch.ts`)
   - Efficient batch database inserts
   - Duplicate detection
   - Source statistics tracking

5. **Scheduler** (`src/scheduler.ts`)
   - Hourly staggered execution
   - Processes max 2 sources per minute
   - Priority-based scheduling

6. **10 Default RSS Feeds**
   - Hacker News, TechCrunch, The Verge, Ars Technica
   - BBC Technology, Reuters Technology, The Guardian Technology
   - Nature News, Scientific American
   - GitHub Trending

## Quick Start

### 1. Install Dependencies

```bash
# From root directory
pnpm install
```

### 2. Configure (Optional)

Add to root `.env` file:

```bash
# Enable ingestion service
INGESTION_ENABLED=true

# Custom database path (optional)
INGESTION_DB_PATH=./data/ingestion.db

# Service port (optional, default: 3002)
INGESTION_SERVICE_PORT=3002
```

### 3. Start the Service

**Development mode (with hot reload):**
```bash
cd apps/ingestion-service
pnpm dev
```

**Production mode:**
```bash
cd apps/ingestion-service
pnpm build
pnpm start
```

### 4. Verify It's Working

**Check logs:**
- You should see: "Ingestion service started"
- Source initialization: "Sources initialized"
- First ingestion runs within the hour

**Health check:**
```bash
curl http://localhost:3002/health
```

**Check database:**
```bash
sqlite3 apps/ingestion-service/data/ingestion.db "SELECT COUNT(*) FROM ingested_content;"
```

## How It Works

1. **Startup**: Service initializes database and loads 10 RSS sources
2. **Scheduling**: Sources are scheduled with staggered start times (spread across first hour)
3. **Hourly Cycle**: Every minute, scheduler checks for ready sources (max 2 per minute)
4. **Processing**: Each source:
   - Fetches RSS feed
   - Parses items
   - Deduplicates by URL hash
   - Writes to database in batches
   - Updates statistics
5. **Next Run**: Source rescheduled based on `updateInterval` (typically 60-120 minutes)

## Expected Output

### Logs (per source ingestion):

```
[ingestion-service] Starting source ingestion source=hackernews
[rss-processor] Fetching RSS feed source=hackernews url=https://hnrss.org/frontpage
[rss-processor] RSS feed parsed source=hackernews itemCount=30
[batch-writer] Batch write complete total=30 ingested=28 skipped=2
[ingestion-scheduler] Source ingestion complete source=hackernews ingested=28 skipped=2 elapsed=2456
```

### Database Growth:

- **Per hour**: ~50-150 items (depends on source activity)
- **Per day**: ~500-2,000 items
- **Per month**: ~15,000-60,000 items
- **Storage**: ~50 MB - 200 MB per month

## Monitoring

### Check Ingestion Stats:

```sql
-- Items ingested today
SELECT COUNT(*) FROM ingested_content 
WHERE ingested_at > strftime('%s', 'now', '-1 day') * 1000;

-- Items by category
SELECT category, COUNT(*) as count 
FROM ingested_content 
WHERE status = 'active' 
GROUP BY category;

-- Source success rates
SELECT 
  s.name,
  s.success_count,
  s.failure_count,
  ROUND(s.success_count * 100.0 / (s.success_count + s.failure_count), 2) as success_rate
FROM sources s
WHERE s.success_count + s.failure_count > 0;
```

### Recent Ingestion Jobs:

```sql
SELECT 
  source_identifier,
  status,
  items_ingested,
  items_skipped,
  datetime(started_at/1000, 'unixepoch') as started,
  datetime(completed_at/1000, 'unixepoch') as completed
FROM ingestion_jobs
ORDER BY started_at DESC
LIMIT 20;
```

## Troubleshooting

### Service won't start

- Check `INGESTION_ENABLED=true` in `.env`
- Check logs for database path errors
- Ensure `data/` directory is writable

### No items being ingested

- Check source URLs are accessible
- Verify network connectivity
- Check logs for fetch errors
- Verify sources are enabled in database:
  ```sql
  SELECT * FROM sources WHERE enabled = 1;
  ```

### High duplicate rate

- This is normal - RSS feeds often have overlapping items
- Check `items_skipped` in logs
- Duplicates are detected by URL hash (prevents re-ingestion)

### Sources failing

- Check logs for specific error messages
- Some feeds may be temporarily unavailable
- Service continues with other sources (graceful degradation)

## Isolation Guarantees

✅ **Zero Performance Impact on Main App**

- Separate Node.js process
- Separate database file (`ingestion.db`)
- No shared event loop
- No shared memory
- Read-only access from main app (if needed in future)

## Next Steps (Phase 2+)

After Phase 1 is stable, consider:

- **Phase 2**: Add sitemap crawling for documentation sites
- **Phase 3**: Scheduled NewsData.io ingestion
- **Phase 4**: Integration with Haiku 3 context retrieval

## Cost

**Phase 1: $0/month**
- All RSS feeds are free
- No API costs
- Uses existing server resources
- Minimal storage (SQLite)

