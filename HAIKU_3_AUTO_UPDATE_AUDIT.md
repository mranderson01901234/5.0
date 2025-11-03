# Haiku 3 Model Auto-Update Audit

## Executive Summary

This audit examines how the **Claude 3 Haiku** model (`claude-3-haiku-20240307`) could be enhanced to automatically update with real-world information from various sources including RSS feeds, sitemaps, news APIs, and other optimal data channels. The current implementation uses Haiku 3 in real-time for various tasks but lacks any background data ingestion or knowledge base update mechanisms.

## Current Architecture

### Haiku 3 Usage Points

The Haiku 3 model is currently used in three primary contexts:

1. **LLM Gateway - General Chat/Routing** (`apps/llm-gateway/`)
   - Location: `apps/llm-gateway/src/routes.ts`
   - Usage: 70% of traffic routed through Haiku 3 for general chat
   - Pattern: Real-time API calls per request
   - Model: `claude-3-haiku-20240307`

2. **Memory Service - Source Reranking** (`apps/memory-service/src/research/pipeline/fetchAndRerank.ts`)
   - Function: `haikuRerankSources()`
   - Purpose: Intelligently selects and ranks web search sources
   - Pattern: Called per research pipeline execution
   - Timeout: 6 seconds
   - Context: Analyzes search results to rank sources by relevance/authority

3. **Memory Service - Search Response Composition** (`apps/memory-service/src/composeSearchResponse.ts`)
   - Functions: `composeSearchResponse()`, `composeSearchResponseStream()`
   - Purpose: Transforms search results into natural language responses
   - Pattern: Real-time streaming or batch processing
   - Timeout: 8 seconds
   - Context: Synthesizes web search results into conversational responses

4. **Memory Service - Query Summarization** (`apps/memory-service/src/utils/querySummarizer.ts`)
   - Purpose: Summarizes user queries for memory storage
   - Pattern: Per-message processing

### Current Information Sources

The system currently uses **reactive, on-demand** information fetching:

1. **Brave Search API** (Primary)
   - Location: `apps/memory-service/src/research/fetchers/brave.ts`
   - Features:
     - Web search with freshness parameters (`pd`=past day, `pw`=past week, `pm`=past month)
     - Real-time API calls per query
     - No background ingestion
   - Limitations:
     - Rate-limited (429 errors handled)
     - Query-dependent (no proactive updates)
     - No persistent knowledge base

2. **NewsData.io API** (Fallback)
   - Location: `apps/memory-service/src/research/fetchers/newsdata.ts`
   - Features:
     - News-specific content
     - Activated when Brave returns low-value results
     - News topic focused (`ttlClass === 'news/current'`)
   - Limitations:
     - Fallback only (not primary)
     - Reactive (not proactive)
     - Limited to news topics

### Current Update Mechanisms

**NONE** - The system has no auto-update mechanism:

- ❌ No RSS feed parsers
- ❌ No sitemap crawlers
- ❌ No scheduled background jobs for information ingestion
- ❌ No knowledge base updates
- ❌ No model context enhancement
- ❌ No persistent fact storage

**Existing Scheduled Jobs:**
- `scheduleRetentionJob()` - Runs daily for memory retention/decay
- `cadence.cleanup()` - Runs hourly for thread cleanup
- **No information ingestion jobs**

### Caching Infrastructure

- **Redis Cache**: Used for research capsules (TTL-based)
  - Location: `apps/memory-service/src/research/cache.ts`
  - Purpose: Cache search results by topic/query
  - TTL: Based on `ttlClass` (news=1hr, pricing=24hr, releases=72hr, docs=7d, general=30d)
  - **Note**: This caches query results, not a knowledge base

## Proposed Auto-Update Architecture

### Option 1: Background Knowledge Ingestion Pipeline (Recommended)

**Architecture:**
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Data Sources   │────▶│  Ingestion Queue  │────▶│  Processing     │
│  - RSS Feeds    │     │  - Scheduled Jobs │     │  - Content      │
│  - Sitemaps     │     │  - Event Triggers │     │    Extraction   │
│  - News APIs    │     │  - Rate Limiting  │     │  - Deduplication│
│  - Web Hooks    │     └──────────────────┘     │  - Scoring      │
└─────────────────┘                              └─────────────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │  Knowledge Base  │
                                                │  - Vector Store  │
                                                │  - SQLite Cache  │
                                                │  - Redis Index   │
                                                └─────────────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │  Context Inject  │
                                                │  - Per-Request   │
                                                │  - Context Window│
                                                │  - Retrieval     │
                                                └─────────────────┘
```

### Option 2: On-Demand Enhancement (Simpler)

Enhance existing real-time calls with pre-fetched context from scheduled ingestion.

### Option 3: Hybrid Approach (Optimal)

Combine scheduled ingestion (for known high-value sources) with on-demand fetching (for ad-hoc queries).

## Detailed Source Analysis

### 1. RSS Feed Integration

**Implementation Points:**
- **Location**: New module `apps/memory-service/src/ingestion/rss.ts`
- **Trigger**: Scheduled job (hourly or configurable interval)
- **Sources**: Configurable RSS feed list
- **Processing**:
  - Parse RSS XML/Atom feeds
  - Extract: title, description, link, pubDate, categories
  - Deduplicate by URL + hash
  - Score for relevance/importance
  - Store in knowledge base

**Technical Considerations:**
- Feed parsing: Use `rss-parser` or `fast-xml-parser`
- Rate limiting: Respect feed update frequencies
- Error handling: Graceful degradation for failed feeds
- Etag/Last-Modified: Optimize polling with conditional requests

**Storage Strategy:**
- SQLite table: `ingested_content` (url, title, content, source, ingested_at, expires_at)
- Redis index: Topic/category → content IDs
- Vector embeddings: For semantic search (optional, future enhancement)

**Configuration:**
```typescript
interface RSSFeedConfig {
  url: string;
  category: string; // 'tech', 'news', 'science', etc.
  updateInterval: number; // minutes
  enabled: boolean;
  priority: number; // 1-10
}
```

### 2. Sitemap Integration

**Implementation Points:**
- **Location**: New module `apps/memory-service/src/ingestion/sitemap.ts`
- **Trigger**: Scheduled job (daily or weekly per domain)
- **Processing**:
  - Fetch sitemap.xml or sitemap index
  - Extract URLs and lastmod dates
  - Filter by recency (e.g., updated in last 7 days)
  - Crawl selected URLs (with rate limiting)
  - Extract content (title, main text, metadata)
  - Store in knowledge base

**Technical Considerations:**
- Sitemap parsing: Use `sitemap-parser` or custom XML parser
- Crawling: Use `cheerio` or `jsdom` for content extraction
- Rate limiting: Respect robots.txt and domain-specific limits
- Incremental updates: Only crawl changed URLs (use lastmod)
- Memory limits: Stream processing for large sitemaps

**Storage Strategy:**
- Track crawled URLs in `crawled_urls` table (url, last_crawled, hash, domain)
- Store extracted content in `ingested_content` table
- Hash-based deduplication to avoid re-processing

**Configuration:**
```typescript
interface SitemapConfig {
  domain: string;
  sitemapUrl: string;
  crawlInterval: number; // days
  maxUrlsPerCrawl: number;
  enabled: boolean;
}
```

### 3. News API Integration (Enhanced)

**Current State:**
- NewsData.io API exists but is fallback only
- No proactive news ingestion

**Enhancement:**
- **Location**: Enhance `apps/memory-service/src/research/fetchers/newsdata.ts`
- **New Features**:
  - Scheduled background ingestion from NewsData.io
  - Category-specific updates (tech, science, business, etc.)
  - Store headlines/articles in knowledge base
  - Subscribe to breaking news alerts (if API supports)

**Additional News APIs to Consider:**
- **NewsAPI.org**: Comprehensive news aggregation
- **Guardian API**: Free tier for news articles
- **NYTimes API**: Rich metadata and categorization
- **Google News RSS**: Free, but needs parsing

**Storage Strategy:**
- Store articles in `ingested_content` with metadata:
  - source, category, published_date, headline, summary, url
- Index by category and date for fast retrieval
- TTL based on news recency (older than 7 days = lower priority)

### 4. Specialized Data Sources

**GitHub Releases:**
- **Source**: GitHub API or RSS feeds for releases
- **Use Case**: Tech/product updates, version releases
- **Frequency**: Daily checks for watched repos
- **Storage**: Track releases by repo + version tag

**Hacker News / Tech Aggregators:**
- **Source**: Hacker News API, Product Hunt API
- **Use Case**: Tech trends, product launches
- **Frequency**: Hourly for top stories
- **Storage**: Store top stories with metadata

**Documentation Sites:**
- **Source**: Sitemaps from docs sites (docs.python.org, docs.react.dev, etc.)
- **Use Case**: Reference information, API changes
- **Frequency**: Weekly crawls (docs change less frequently)
- **Storage**: Store in separate "docs" category

**Reddit/Twitter (Future):**
- **Source**: Reddit API, Twitter API (paid tier)
- **Use Case**: Trending topics, community discussions
- **Challenges**: Rate limits, content moderation
- **Priority**: Lower (requires significant API costs)

### 5. Web Hooks & Event-Driven Updates

**Implementation:**
- **Webhook endpoint**: `POST /v1/ingestion/webhook`
- **Use Cases**:
  - GitHub webhooks for repo updates
  - Custom integrations with partner services
  - User-submitted content sources
- **Processing**: Validate → Parse → Ingest → Notify

**Storage**: Store webhook payloads for audit trail

## Integration with Haiku 3 Model

### Context Injection Strategy

**Current Limitation:**
Haiku 3 is called without any pre-loaded context from ingested data. All information is fetched on-demand per request.

**Proposed Enhancement:**

1. **Pre-Request Context Retrieval**
   - When a query arrives, retrieve relevant ingested content from knowledge base
   - Use keyword matching + semantic similarity (if vector embeddings available)
   - Limit context size (e.g., top 5-10 most relevant items)
   - Inject as system prompt or few-shot examples

2. **System Prompt Enhancement**
   - Dynamic system prompt that includes recent relevant facts
   - Format: "Based on recent information: [fact1], [fact2], ..."
   - Update prompt with time-sensitive information

3. **Hybrid Context**
   - Combine: Ingested knowledge + Real-time search results
   - Priority: Ingested knowledge for historical/stable facts, real-time search for breaking news

### Implementation Points

**Location 1: LLM Gateway** (`apps/llm-gateway/src/routes.ts`)
- **Current**: Direct Haiku 3 API call
- **Enhancement**: 
  - Query knowledge base before calling Haiku
  - Inject retrieved context into system prompt
  - Add metadata: `{"context_source": "ingested", "freshness": "2 hours ago"}`

**Location 2: Source Reranking** (`apps/memory-service/src/research/pipeline/fetchAndRerank.ts`)
- **Current**: `haikuRerankSources()` uses only search results
- **Enhancement**:
  - Include ingested knowledge about source authority
  - Prefer sources with recent ingested updates
  - Add context: "Based on our knowledge base, [source] has been reliable for [topic]"

**Location 3: Search Response Composition** (`apps/memory-service/src/composeSearchResponse.ts`)
- **Current**: Composes from real-time search results only
- **Enhancement**:
  - Augment with ingested knowledge for background context
  - Verify facts against knowledge base
  - Add temporal context: "As of [date], [fact]. Latest update: [time]"

## Storage Architecture

### Database Schema

**New Tables:**

```sql
-- Ingested content from all sources
CREATE TABLE ingested_content (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL, -- 'rss', 'sitemap', 'news_api', 'webhook'
  source_url TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  content TEXT,
  summary TEXT,
  published_date INTEGER, -- timestamp
  ingested_at INTEGER NOT NULL,
  expires_at INTEGER, -- TTL-based
  category TEXT,
  metadata TEXT, -- JSON
  content_hash TEXT, -- for deduplication
  priority INTEGER DEFAULT 5
);

-- Track ingestion jobs
CREATE TABLE ingestion_jobs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_identifier TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  started_at INTEGER,
  completed_at INTEGER,
  items_ingested INTEGER DEFAULT 0,
  error TEXT,
  next_run_at INTEGER
);

-- Track crawled URLs (for sitemaps)
CREATE TABLE crawled_urls (
  url TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  last_crawled INTEGER,
  content_hash TEXT,
  crawl_count INTEGER DEFAULT 1
);

-- Index for fast retrieval
CREATE INDEX idx_ingested_category_date ON ingested_content(category, published_date DESC);
CREATE INDEX idx_ingested_expires ON ingested_content(expires_at) WHERE expires_at IS NOT NULL;
```

### Redis Structure

**Key Patterns:**
- `ingested:topic:{category}:*` - Content IDs by category
- `ingested:url:{hash}` - Content metadata by URL hash
- `ingestion:lock:{source}` - Distributed lock for ingestion jobs
- `ingestion:stats:{source}:{date}` - Daily ingestion statistics

## Scheduling & Orchestration

### Job Scheduling

**Implementation:**
- Use existing `JobQueue` system (`apps/memory-service/src/queue.ts`)
- Add new job types: `'ingestion:rss'`, `'ingestion:sitemap'`, `'ingestion:news'`
- Schedule via `setInterval` or cron-like scheduler

**Recommended Intervals:**
- **RSS Feeds**: 15-60 minutes (depends on feed update frequency)
- **Sitemaps**: Daily (for most domains), weekly (for low-change domains)
- **News APIs**: Hourly (for breaking news), 6-hourly (for general news)
- **GitHub Releases**: Daily
- **Documentation**: Weekly

**Job Priority:**
- High: Breaking news sources, user-requested updates
- Medium: RSS feeds, news APIs
- Low: Sitemaps, documentation

### Error Handling & Retry

- Exponential backoff for failed sources
- Mark sources as disabled after repeated failures
- Alert on persistent failures
- Graceful degradation: Continue operating with available sources

## Performance Considerations

### Scalability

**Current Limitations:**
- No background processing infrastructure
- All processing is request-driven

**Requirements:**
- Async job queue (already exists: `JobQueue`)
- Rate limiting per source/domain
- Batch processing for efficiency
- Distributed locks (Redis) to prevent duplicate ingestion

### Cost Optimization

**API Costs:**
- RSS feeds: **FREE** (public feeds)
- Sitemaps: **FREE** (public XML files)
- News APIs: **PAID** (NewsData.io, NewsAPI.org, etc.)
- GitHub API: **FREE** (with rate limits)

**Storage Costs:**
- SQLite: Negligible for moderate volumes
- Redis: Moderate (caching + indexing)
- Vector DB (future): Higher cost if using cloud service

**Recommendation:**
- Prioritize free sources (RSS, sitemaps, GitHub)
- Use paid APIs selectively (breaking news, high-value domains)
- Implement smart caching to minimize redundant API calls

### Memory & Storage Limits

**Estimated Storage:**
- RSS feed item: ~2-5 KB (title + summary)
- Full article (sitemap crawl): ~10-50 KB
- 1000 items/day × 30 days = ~300-600 MB

**Mitigation:**
- TTL-based expiration (older content = lower priority → can be archived)
- Compression for stored content
- Selective storage (only high-priority content)

## Security & Privacy

### Data Sources

- Validate RSS feed sources (prevent SSRF attacks)
- Rate limit per domain/IP
- Sanitize ingested content (remove scripts, malicious links)
- Respect robots.txt for sitemap crawling

### Content Validation

- Verify content authenticity (where possible)
- Mark sources by trust level
- Flag suspicious content for review

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Create ingestion infrastructure
   - Database schema
   - Job queue integration
   - Basic RSS parser
2. Implement RSS feed ingestion
   - Single feed test
   - Scheduled job
   - Storage and retrieval
3. Integrate with Haiku context
   - Query knowledge base before Haiku calls
   - Inject context in system prompt

### Phase 2: Expansion (Week 3-4)
1. Add sitemap crawler
   - Parse sitemaps
   - Incremental crawling
   - Content extraction
2. Enhance news API integration
   - Scheduled NewsData.io ingestion
   - Category-based updates
3. Add more RSS sources
   - Tech news, science, business feeds

### Phase 3: Optimization (Week 5-6)
1. Performance tuning
   - Batch processing
   - Caching optimization
   - Rate limiting refinement
2. Add specialized sources
   - GitHub releases
   - Documentation sites
3. Monitoring & alerting
   - Ingestion metrics
   - Failure tracking
   - Performance dashboards

### Phase 4: Advanced Features (Future)
1. Vector embeddings for semantic search
2. Automated source quality scoring
3. User-configurable feeds
4. Real-time webhooks

## Recommendations

### Immediate Actions (High Priority)

1. **Implement RSS Feed Ingestion**
   - Start with 10-20 high-quality tech/news feeds
   - Hourly updates
   - Integrate context into Haiku calls

2. **Enhance News API Usage**
   - Schedule background NewsData.io ingestion
   - Store articles in knowledge base
   - Use for context augmentation

3. **Add Sitemap Support**
   - Focus on high-value domains (documentation sites, news sites)
   - Weekly crawls
   - Incremental updates only

### Medium Priority

4. **GitHub Releases Integration**
   - Track major tech releases
   - Daily updates
   - Store in "releases" category

5. **Performance Optimization**
   - Batch processing
   - Smart caching
   - Rate limiting refinement

### Low Priority (Future)

6. **Vector Embeddings**
   - Semantic search over ingested content
   - Better relevance matching

7. **User-Configurable Sources**
   - Allow users to add custom RSS feeds
   - Personal knowledge bases

## Risks & Mitigations

### Risk 1: Information Staleness
- **Risk**: Ingested content becomes outdated
- **Mitigation**: TTL-based expiration, prioritize recent content, combine with real-time search

### Risk 2: Source Reliability
- **Risk**: RSS feeds/sitemaps become unavailable or unreliable
- **Mitigation**: Multiple sources per category, graceful degradation, source health monitoring

### Risk 3: Storage Growth
- **Risk**: Database grows unbounded
- **Mitigation**: TTL expiration, archiving old content, selective storage

### Risk 4: API Costs
- **Risk**: Paid APIs become expensive at scale
- **Mitigation**: Prioritize free sources, implement smart caching, rate limiting

### Risk 5: Content Quality
- **Risk**: Low-quality content pollutes knowledge base
- **Mitigation**: Source scoring, content validation, manual curation for critical sources

## Metrics & Monitoring

### Key Metrics

1. **Ingestion Metrics**
   - Items ingested per day/hour
   - Sources active/failed
   - Storage size growth
   - Job execution time

2. **Usage Metrics**
   - Context hits (how often ingested content is used)
   - Query performance improvement
   - User satisfaction (if measurable)

3. **Quality Metrics**
   - Source reliability rate
   - Content freshness
   - Deduplication effectiveness

### Monitoring Dashboard

- Real-time ingestion status
- Source health
- Storage usage
- Context injection rates

## Conclusion

The current system uses Haiku 3 reactively without any background knowledge ingestion. Implementing an auto-update mechanism via RSS feeds, sitemaps, and enhanced news API integration would significantly improve the model's access to real-world information.

**Recommended Approach:**
1. Start with RSS feed ingestion (lowest cost, high value)
2. Enhance existing NewsData.io integration with scheduled ingestion
3. Add sitemap support for high-value documentation sites
4. Integrate ingested context into Haiku 3 calls via enhanced system prompts

**Expected Benefits:**
- More up-to-date responses
- Better context for time-sensitive queries
- Reduced reliance on real-time API calls
- Improved user experience with factual, current information

**Estimated Effort:**
- Phase 1 (Foundation): 2 weeks
- Phase 2 (Expansion): 2 weeks
- Phase 3 (Optimization): 2 weeks
- **Total: ~6 weeks for full implementation**

