# Hourly World Information Ingestion System
## Isolated Design & Cost Analysis

## Executive Summary

This document outlines a **completely isolated hourly ingestion system** that updates a knowledge base from a broad range of world information sources without impacting the web application's performance. The system runs as a separate service/process with its own database, queue, and resources.

**Key Guarantees:**
- ✅ **Zero performance impact** on web app (separate process, isolated resources)
- ✅ **Fault tolerance** (failures don't affect main app)
- ✅ **Cost-effective** (prioritizes free sources, smart caching)
- ✅ **Scalable** (can handle 100+ sources efficiently)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    WEB APPLICATION                           │
│  (LLM Gateway, Memory Service, Web Frontend)                │
│  - Unaffected by ingestion                                   │
│  - Reads from shared knowledge base (read-only)               │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ Read-only queries
                           │
┌─────────────────────────────────────────────────────────────┐
│              SHARED KNOWLEDGE BASE                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  SQLite DB  │  │  Redis Cache  │  │  Vector Store│       │
│  │  (ingested_ │  │  (indexing)   │  │  (optional)  │       │
│  │   content)  │  │               │  │              │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ Writes
                           │
┌─────────────────────────────────────────────────────────────┐
│         ISOLATED INGESTION SERVICE                           │
│  (Separate Process/Container)                                │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Scheduler (Cron-like)                    │   │
│  │  - Hourly triggers per source category               │   │
│  │  - Staggered execution (avoid load spikes)           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Ingestion Queue                          │   │
│  │  - Separate from main app queue                       │   │
│  │  - Priority-based processing                          │   │
│  │  - Rate limiting per source                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Source Processors (Isolated)                  │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐             │   │
│  │  │ RSS     │ │ Sitemaps  │ │ News APIs│             │   │
│  │  │ Feeds   │ │           │ │          │             │   │
│  │  └─────────┘ └──────────┘ └──────────┘             │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Content Processor                              │   │
│  │  - Deduplication (hash-based)                          │   │
│  │  - Content extraction (HTML stripping)                  │   │
│  │  - Scoring & prioritization                            │   │
│  │  - TTL assignment                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Writer (Batch)                                 │   │
│  │  - Batch inserts (100-500 items/batch)                 │   │
│  │  - Transactional writes                                │   │
│  │  - Index updates                                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Source Catalog: "Broad List of World Information"

### Tier 1: Free Sources (RSS Feeds) - **PRIORITY**

**Technology & Science:**
- Hacker News RSS (top stories)
- TechCrunch RSS
- The Verge RSS
- Ars Technica RSS
- Wired RSS
- MIT Technology Review RSS
- Nature News RSS
- Science Daily RSS
- IEEE Spectrum RSS
- Scientific American RSS

**News & Business:**
- BBC News RSS (all categories)
- Reuters RSS (all categories)
- AP News RSS
- The Guardian RSS (all categories)
- Financial Times RSS (limited free tier)
- Bloomberg RSS (headlines)
- NPR RSS
- Al Jazeera RSS
- CNN RSS
- Washington Post RSS (headlines)

**Programming & Development:**
- GitHub Trending RSS
- Stack Overflow Blog RSS
- Reddit r/programming RSS (top posts)
- InfoQ RSS
- Dev.to RSS
- FreeCodeCamp RSS

**Documentation & Standards:**
- Python.org News RSS
- Node.js News RSS
- React Blog RSS
- MDN Web Docs Updates RSS

**Estimated Volume (Free RSS):**
- Items per hour: ~200-400 items
- Items per day: ~5,000-10,000 items
- **Cost: $0**

### Tier 2: Free/Cheap Sources (Sitemaps & APIs)

**News Aggregators:**
- Google News RSS (free)
- AllSides RSS (news aggregation)
- NewsAPI.org (free tier: 100 requests/day = ~4/hour)

**Documentation Sites (Sitemaps):**
- docs.python.org/sitemap.xml
- docs.react.dev/sitemap.xml
- nodejs.org/sitemap.xml
- developer.mozilla.org/sitemap.xml
- docs.rust-lang.org/sitemap.xml

**Estimated Volume (Free Tier 2):**
- Items per hour: ~50-100 items
- Items per day: ~1,000-2,000 items
- **Cost: $0** (if staying within free tier limits)

### Tier 3: Paid APIs (Optimal Usage)

**NewsData.io:**
- Current: Fallback only
- Enhanced: Scheduled ingestion
- Cost: $49/month (Professional tier)
  - 10,000 requests/month = ~333/hour (but we'll use ~50/hour)
  - Unlimited articles

**NewsAPI.org (if needed beyond free tier):**
- Developer: $449/month (250,000 requests/month = ~8,333/hour)
- Cost per request: ~$0.0018
- **Recommendation**: Use free tier only (100 requests/day = ~4/hour)

**Estimated Volume (Paid APIs):**
- Items per hour: ~50-100 items
- Items per day: ~1,000-2,000 items
- **Cost: $49/month** (NewsData.io only)

### Total Source Estimate

**Conservative Scenario:**
- 30-40 RSS feeds (free)
- 5-10 sitemaps (free)
- 1 paid news API (NewsData.io)

**Total Hourly Ingestion:**
- Items per hour: **300-500 items**
- Items per day: **7,000-12,000 items**
- Items per month: **210,000-360,000 items**

---

## Storage Architecture

### Database Schema

```sql
-- Separate database for ingestion (isolated from main app)
-- apps/ingestion-service/data/ingestion.db

CREATE TABLE ingested_content (
  id TEXT PRIMARY KEY,                    -- UUID or hash
  source_type TEXT NOT NULL,              -- 'rss', 'sitemap', 'news_api', 'github'
  source_url TEXT NOT NULL,                -- Original source URL/feed
  url TEXT NOT NULL,                       -- Article/content URL
  url_hash TEXT NOT NULL UNIQUE,           -- SHA256 hash for deduplication
  title TEXT,
  content TEXT,                            -- Full text (optional, for high-priority)
  summary TEXT,                            -- Extracted summary/snippet
  published_date INTEGER,                  -- Unix timestamp
  ingested_at INTEGER NOT NULL,            -- When we ingested it
  expires_at INTEGER,                      -- TTL-based expiration
  category TEXT,                           -- 'tech', 'news', 'science', etc.
  metadata TEXT,                           -- JSON: {author, tags, image_url, etc.}
  priority INTEGER DEFAULT 5,              -- 1-10 (higher = more important)
  source_authority REAL DEFAULT 0.5,       -- 0-1 trust score
  content_hash TEXT,                       -- Hash of content for dedup
  status TEXT DEFAULT 'active'             -- 'active', 'archived', 'expired'
);

-- Indexes for fast retrieval
CREATE INDEX idx_category_date ON ingested_content(category, published_date DESC);
CREATE INDEX idx_expires ON ingested_content(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_source_ingested ON ingested_content(source_type, source_url, ingested_at DESC);
CREATE INDEX idx_url_hash ON ingested_content(url_hash);
CREATE INDEX idx_priority_date ON ingested_content(priority DESC, published_date DESC);

-- Track ingestion jobs
CREATE TABLE ingestion_jobs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_identifier TEXT NOT NULL,        -- Feed URL, sitemap URL, etc.
  status TEXT NOT NULL,                    -- 'pending', 'running', 'completed', 'failed'
  started_at INTEGER,
  completed_at INTEGER,
  items_ingested INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,         -- Duplicates, low-quality
  error TEXT,
  next_run_at INTEGER,
  last_success_at INTEGER
);

-- Track crawled URLs (for sitemaps)
CREATE TABLE crawled_urls (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  last_crawled INTEGER,
  content_hash TEXT,
  crawl_count INTEGER DEFAULT 1,
  last_status_code INTEGER,
  etag TEXT,
  last_modified TEXT
);

-- Source configuration
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                      -- 'rss', 'sitemap', 'news_api'
  url TEXT NOT NULL UNIQUE,
  name TEXT,
  category TEXT,
  enabled BOOLEAN DEFAULT true,
  update_interval INTEGER,                 -- minutes
  priority INTEGER DEFAULT 5,
  rate_limit_per_hour INTEGER DEFAULT 60,
  last_fetch_at INTEGER,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  metadata TEXT                             -- JSON config
);
```

### Storage Size Estimates

**Per Item Storage:**
- Database row: ~2-5 KB (title + summary + metadata)
- Full content (if stored): ~10-50 KB per item
- **Conservative estimate: 5 KB/item average**

**Daily Storage:**
- 10,000 items/day × 5 KB = **50 MB/day**
- With full content (high-priority only): +100 MB/day = **150 MB/day**

**Monthly Storage:**
- Conservative: 50 MB/day × 30 = **1.5 GB/month**
- With full content: 150 MB/day × 30 = **4.5 GB/month**

**Annual Storage:**
- Conservative: **18 GB/year**
- With full content: **54 GB/year**

**SQLite Considerations:**
- SQLite handles databases up to 140 TB (more than sufficient)
- Recommendation: **Monthly partitions** or archiving older than 90 days
- Archive strategy: Move items older than 90 days to separate archive DB

---

## Cost Breakdown

### Infrastructure Costs

#### 1. Compute (Server/Container)

**Option A: Shared Server (Existing Infrastructure)**
- If running on same server as main app (isolated process):
  - **Cost: $0** (if server has capacity)
  - Resource usage: ~0.5-1 CPU core, ~500 MB RAM
  - **Recommendation**: Use this for MVP

**Option B: Separate Container/VM**
- Small VPS (2 CPU, 2 GB RAM): **$5-10/month**
- Container on cloud (e.g., Railway, Render): **$7-15/month**
- AWS/GCP micro instance: **$10-20/month**

**Recommendation:** Start with Option A, move to Option B if resource constraints arise.

#### 2. Storage

**SQLite (Local Disk):**
- **Cost: $0** (uses existing disk space)
- 54 GB/year = negligible on modern servers
- **Recommendation**: Local SQLite database

**Redis (Caching/Indexing):**
- If using existing Redis instance:
  - **Cost: $0** (shared)
  - Additional memory: ~500 MB - 1 GB
- If separate Redis:
  - Small Redis instance: **$5-10/month**

**Recommendation:** Use existing Redis (already in infrastructure).

#### 3. API Costs

**RSS Feeds:**
- **Cost: $0** (public feeds, no API keys)

**NewsData.io:**
- Professional tier: **$49/month**
  - 10,000 requests/month (we'll use ~1,500/month = ~50/hour)
  - Unlimited articles

**NewsAPI.org (Free Tier):**
- **Cost: $0**
- 100 requests/day = ~4/hour
- **Recommendation**: Use free tier only

**GitHub API:**
- **Cost: $0** (authenticated requests = 5,000/hour)
- No authentication needed for public RSS feeds

**Total API Costs:**
- **Minimum: $49/month** (NewsData.io only)
- **Maximum: $49/month** (if staying within free tiers)

#### 4. Bandwidth

**Estimated Hourly:**
- RSS feeds: ~10-20 MB/hour
- Sitemaps: ~5-10 MB/hour
- News API: ~5-10 MB/hour
- **Total: ~20-40 MB/hour**

**Monthly:**
- 40 MB/hour × 24 hours × 30 days = **~29 GB/month**
- **Cost: $0** (within typical server bandwidth limits)

### Total Monthly Cost Estimate

**Minimum (Conservative):**
- Compute (shared): **$0**
- Storage (SQLite): **$0**
- Redis (shared): **$0**
- APIs: **$49/month** (NewsData.io)
- **Total: $49/month**

**Scaled (Separate Infrastructure):**
- Compute (separate): **$10/month**
- Storage (SQLite): **$0**
- Redis (separate): **$10/month**
- APIs: **$49/month** (NewsData.io)
- **Total: $69/month**

**Note:** Could reduce to **$0/month** if skipping paid APIs and using only free RSS feeds.

---

## Isolation Design

### Process Isolation

**Separate Service:**
```typescript
// apps/ingestion-service/src/server.ts
// Completely separate Fastify/Express server
// Runs on different port (e.g., 3002)
// Separate database connection
// Separate job queue
```

**Containerization (Optional):**
```dockerfile
# Separate Docker container
# Resource limits: CPU 0.5-1 core, Memory 512 MB
# Network: Only outbound (no incoming connections from web app)
```

### Resource Isolation

**CPU Isolation:**
- Use Node.js `worker_threads` or separate process
- CPU throttling: Max 1 core
- Low priority scheduling (nice level)

**Memory Isolation:**
- Separate heap (Node.js V8 isolate)
- Memory limit: 512 MB - 1 GB
- Garbage collection tuning for background tasks

**Database Isolation:**
- **Separate SQLite database** (`ingestion.db`)
- Write lock isolation (SQLite handles this)
- Connection pooling (separate pool)

**Network Isolation:**
- Separate HTTP server (different port)
- No incoming connections from web app
- Rate limiting on outbound requests

### Failure Isolation

**Graceful Degradation:**
```typescript
// If ingestion service fails:
// - Main app continues operating normally
// - Ingestion retries with exponential backoff
// - Errors logged but don't propagate to main app
```

**Circuit Breaker Pattern:**
- If a source fails repeatedly, disable it temporarily
- Don't crash entire ingestion service
- Continue with other sources

### Performance Guarantees

**Zero Impact Guarantees:**

1. **Separate Process**
   - Ingestion runs in isolated Node.js process
   - No shared event loop with main app
   - Separate memory space

2. **Throttled Execution**
   - Jobs staggered across hour (not all at once)
   - Rate limiting per source
   - Backpressure handling

3. **Read-Only Access for Main App**
   - Main app only reads from knowledge base
   - Uses connection pooling (separate pool)
   - No write contention

4. **Database Optimization**
   - Separate WAL (Write-Ahead Logging) file
   - Batch inserts (100-500 items per transaction)
   - Vacuum/optimize during off-peak hours

5. **Monitoring & Alerting**
   - Ingestion metrics separate from main app
   - Alerts if ingestion impacts main app (shouldn't happen)

---

## Implementation Details

### Scheduler Design

```typescript
// apps/ingestion-service/src/scheduler.ts

interface SourceSchedule {
  sourceId: string;
  intervalMinutes: number;
  nextRunAt: number;
  priority: number;
}

class IngestionScheduler {
  private sources: Map<string, SourceSchedule> = new Map();
  private intervalId: NodeJS.Timeout | null = null;

  // Staggered execution: spread jobs across hour
  scheduleHourly(): void {
    // Run every minute, process 1-2 sources per minute
    this.intervalId = setInterval(() => {
      const now = Date.now();
      const readySources = Array.from(this.sources.values())
        .filter(s => s.nextRunAt <= now)
        .sort((a, b) => b.priority - a.priority);

      // Process top 2 ready sources per minute
      readySources.slice(0, 2).forEach(source => {
        this.enqueueIngestion(source.sourceId);
        // Update next run time
        source.nextRunAt = now + (source.intervalMinutes * 60 * 1000);
      });
    }, 60 * 1000); // Every minute
  }
}
```

### Source Processor Examples

**RSS Feed Processor:**
```typescript
// apps/ingestion-service/src/processors/rss.ts

async function processRSSFeed(feedUrl: string): Promise<IngestionResult> {
  // Fetch RSS feed
  const response = await fetch(feedUrl, {
    headers: { 'If-Modified-Since': lastModified },
    signal: AbortSignal.timeout(30000)
  });

  // Parse RSS
  const feed = await parseRSS(response.text());

  // Extract items
  const items = feed.items.map(item => ({
    url: item.link,
    title: item.title,
    summary: item.contentSnippet || item.description,
    publishedDate: new Date(item.pubDate).getTime(),
    category: extractCategory(feedUrl),
    metadata: { author: item.creator, tags: item.categories }
  }));

  // Deduplicate (check url_hash in DB)
  const newItems = await deduplicateItems(items);

  // Batch insert
  await batchInsert(newItems);

  return { ingested: newItems.length, skipped: items.length - newItems.length };
}
```

**Sitemap Processor:**
```typescript
// apps/ingestion-service/src/processors/sitemap.ts

async function processSitemap(sitemapUrl: string): Promise<IngestionResult> {
  // Fetch sitemap
  const sitemap = await fetchSitemap(sitemapUrl);

  // Filter by lastmod (only items updated in last 7 days)
  const recentUrls = sitemap.urls.filter(url => {
    const lastmod = new Date(url.lastmod);
    return Date.now() - lastmod.getTime() < 7 * 24 * 60 * 60 * 1000;
  });

  // Check which URLs are already crawled
  const uncrawled = await filterCrawledUrls(recentUrls);

  // Crawl URLs (with rate limiting)
  const items = await crawlUrls(uncrawled, { maxConcurrent: 5 });

  // Extract and store
  await batchInsert(items);

  return { ingested: items.length, skipped: recentUrls.length - uncrawled.length };
}
```

### Content Processing Pipeline

```typescript
// apps/ingestion-service/src/processors/content.ts

interface ProcessedItem {
  url: string;
  urlHash: string;
  title: string;
  summary: string;
  content?: string; // Only for high-priority items
  publishedDate: number;
  category: string;
  priority: number;
  expiresAt: number;
}

async function processContent(rawItem: RawItem): Promise<ProcessedItem> {
  // 1. Deduplication
  const urlHash = createHash('sha256').update(rawItem.url).digest('hex');
  if (await isDuplicate(urlHash)) {
    return null; // Skip
  }

  // 2. Content extraction
  const { title, summary, content } = await extractContent(rawItem.url);

  // 3. Scoring
  const priority = calculatePriority({
    sourceAuthority: rawItem.sourceAuthority,
    recency: Date.now() - rawItem.publishedDate,
    category: rawItem.category,
    contentQuality: content.length
  });

  // 4. TTL assignment
  const expiresAt = calculateTTL(rawItem.category);

  return {
    url: rawItem.url,
    urlHash,
    title,
    summary,
    content: priority >= 7 ? content : undefined, // Only store full content for high-priority
    publishedDate: rawItem.publishedDate,
    category: rawItem.category,
    priority,
    expiresAt
  };
}
```

### Batch Writer

```typescript
// apps/ingestion-service/src/writers/batch.ts

async function batchWrite(items: ProcessedItem[]): Promise<void> {
  const db = getIngestionDatabase();
  const batchSize = 500;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const stmt = db.prepare(`
      INSERT INTO ingested_content (
        id, source_type, source_url, url, url_hash, title, summary,
        content, published_date, ingested_at, expires_at, category,
        metadata, priority, source_authority, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insert = db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          generateId(),
          item.sourceType,
          item.sourceUrl,
          item.url,
          item.urlHash,
          item.title,
          item.summary,
          item.content,
          item.publishedDate,
          Date.now(),
          item.expiresAt,
          item.category,
          JSON.stringify(item.metadata),
          item.priority,
          item.sourceAuthority,
          item.contentHash
        );
      }
    });

    insert(batch);
  }
}
```

---

## Integration with Haiku 3

### Context Retrieval

```typescript
// apps/memory-service/src/ingestion/context.ts

async function retrieveContextForQuery(query: string, category?: string): Promise<string> {
  const db = getIngestionDatabase();
  
  // Search ingested content
  const results = db.prepare(`
    SELECT title, summary, published_date, url
    FROM ingested_content
    WHERE status = 'active'
      AND expires_at > ?
      ${category ? 'AND category = ?' : ''}
      AND (title LIKE ? OR summary LIKE ?)
    ORDER BY priority DESC, published_date DESC
    LIMIT 5
  `).all(
    Date.now(),
    category || null,
    `%${query}%`,
    `%${query}%`
  );

  // Format for context injection
  const context = results.map(r => 
    `${r.title} (${formatDate(r.published_date)}): ${r.summary}`
  ).join('\n');

  return context;
}
```

### Enhanced System Prompt

```typescript
// In composeSearchResponse.ts or routes.ts

const baseSystemPrompt = `...`;

async function enhanceSystemPrompt(query: string): Promise<string> {
  const context = await retrieveContextForQuery(query);
  
  if (!context) return baseSystemPrompt;

  return `${baseSystemPrompt}

RECENT INFORMATION FROM OUR KNOWLEDGE BASE:
${context}

Note: The above information is from our curated knowledge base, updated hourly with verified sources.`;
}
```

---

## Monitoring & Metrics

### Key Metrics

1. **Ingestion Metrics**
   - Items ingested per hour/day
   - Items skipped (duplicates)
   - Sources active/failed
   - Average ingestion time per source

2. **Storage Metrics**
   - Database size
   - Items by category
   - Expiration rate (items expiring per day)

3. **Quality Metrics**
   - Source reliability (% success rate)
   - Content freshness (average age)
   - Deduplication effectiveness

4. **Performance Metrics**
   - Job queue depth
   - Average processing time
   - Memory usage
   - CPU usage

### Alerting

- **Critical**: Ingestion service down for > 1 hour
- **Warning**: Source failure rate > 20%
- **Info**: Storage approaching limits (> 80% capacity)

---

## Rollout Plan

### Phase 1: MVP (Week 1)
1. Set up isolated ingestion service structure
2. Implement RSS feed processor (10 feeds)
3. Basic database schema
4. Hourly scheduler
5. **Cost: $0** (RSS only)

### Phase 2: Expansion (Week 2)
1. Add more RSS feeds (30-40 total)
2. Implement sitemap processor (5 sites)
3. Add NewsData.io integration
4. Batch writing optimization
5. **Cost: $49/month** (NewsData.io)

### Phase 3: Integration (Week 3)
1. Context retrieval for Haiku
2. Enhanced system prompts
3. Monitoring dashboard
4. Performance tuning

### Phase 4: Optimization (Week 4)
1. Storage archiving
2. Source quality scoring
3. Advanced deduplication
4. Rate limiting refinement

---

## Risk Mitigation

### Risk 1: Storage Growth
- **Mitigation**: TTL-based expiration, monthly archiving, selective full-content storage

### Risk 2: Source Failures
- **Mitigation**: Circuit breaker pattern, multiple sources per category, graceful degradation

### Risk 3: API Rate Limits
- **Mitigation**: Staggered scheduling, rate limiting per source, exponential backoff

### Risk 4: Performance Impact (Despite Isolation)
- **Mitigation**: Resource limits, separate process, read-only access from main app, monitoring

---

## Summary

**Architecture:**
- ✅ Completely isolated service (separate process)
- ✅ Separate database (ingestion.db)
- ✅ Separate queue and scheduling
- ✅ Zero shared resources with main app

**Scale:**
- **300-500 items/hour** from 40-50 sources
- **7,000-12,000 items/day**
- **210,000-360,000 items/month**

**Cost:**
- **Minimum: $49/month** (NewsData.io only)
- **Maximum: $69/month** (separate infrastructure)
- **Free option: $0/month** (RSS feeds only, no paid APIs)

**Storage:**
- **1.5-4.5 GB/month**
- **18-54 GB/year** (with archiving strategy)

**Performance Guarantee:**
- **Zero impact** on web app (isolated process, read-only access, resource limits)

This design provides a scalable, cost-effective solution for keeping Haiku 3 updated with real-world information while maintaining complete isolation from the main application.

