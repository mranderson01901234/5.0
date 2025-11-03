# Research Algorithms & Auto Website Suggestions Audit Report

**Date:** 2025-01-27  
**Scope:** `/Desktop/opera` codebase  
**Goal:** Document research algorithms and auto-website suggestion functionality during user typing

---

## Executive Summary

The Opera codebase contains sophisticated **multi-layered research and autosuggestion systems** with the following key components:

1. **Auto-Web Search** - Automatically triggers web searches based on query analysis
2. **Domain Suggestions** - Provides intelligent website suggestions as users type
3. **Vertical Classification** - Routes queries to appropriate content types
4. **Query Analysis** - Smart detection of search intents and needs

---

## 1. Auto-Web Search System

### Overview
The auto-search feature automatically performs web searches when users ask questions that require real-time or factual information, without explicit search commands.

### Components

#### A. Orchestrator (`apps/web/lib/autoSearch/orchestrator.ts`)

**Main Function:** `maybeSearchAndBuildMessage(userText, mode)`

**Flow:**
1. Fast rule-based detection (keyword matching)
2. Optional LLM validation for ambiguous queries
3. Vertical selection (web, news, videos, etc.)
4. Brave search execution
5. Result formatting and message building

**Key Logic:**
```typescript
// 1. Fast rules check
const rules = fastRules(userText);
const contextBoost = mode !== 'chat'; // search/research modes more likely

// 2. Fallback to LLM validator if rules don't trigger
if (!rules.needs) {
  const v = await validateSearchNeed(userText);
  ok = v.needsSearch && v.confidence >= 0.6;
}

// 3. Determine verticals (web, news, videos, images, discussions)
let verticals = rules.verticals.length 
  ? rules.verticals 
  : suggestVerticals(userText).verticals;

// 4. Execute search
const payload = await searchWebBrave(userText, { verticals });

// 5. Format results
const answer = buildAnswer(userText, items);
const msg = buildSearchAssistantMessage(answer);
```

#### B. Fast Rules (`apps/web/lib/autoSearch/rules.ts`)

**Trigger Keywords by Category:**

- **URLs:** Contains http:// or https:// → web vertical
- **News:** "today", "this week", "breaking", "latest", "headline", "announced", "released", "earnings", "layoff", "acquired"
- **Time-sensitive:** "now", "current", "as of", "this year", "this month"
- **Price/Availability:** "price", "cost", "buy", "availability", "stock", "deal"
- **Factual:** "who is", "when did", "where is", "what happened", "vs", "compared to", "difference"
- **Technical:** Version numbers (v1.2.3), CVEs (CVE-2024-1234)

**Vertical Selection:**
- URL → web
- News/time keywords → news + web
- Price/availability → web
- Factual → web
- Version/CVE → web

#### C. LLM Validator (`apps/web/lib/autoSearch/validator.ts`)

**Endpoint:** `/api/llm/validate-auto-search`

**Purpose:** Validates ambiguous queries that don't match fast rules

**Prompt:**
```
Classify if this user message requires a live web search for recency or factual lookup.
Return strict JSON: {"needsSearch": boolean, "verticals": ["web"|"news"|"videos"|"images"|"discussions"...], "confidence": number(0..1)}
```

**LLM Model:** `gpt-4o-mini` with temperature=0 for deterministic results

**Threshold:** Confidence >= 0.6 required

#### D. Vertical Suggestion (`apps/web/lib/searchQueryAnalyzer.ts`)

**Function:** `suggestVerticals(query)`

**Purpose:** Optimize vertical selection to minimize API calls

**Strategy:**
- Always include "web" vertical (includes videos, discussions automatically)
- Only add "news" if news intent detected
- Result: Most queries = 1 API call, news queries = 2 calls max

**Keywords by Type:**
- **Video:** "video", "tutorial", "watch", "how to", "guide", "lesson", "course", "demo"
- **News:** "news", "latest", "breaking", "update", "today", "recent", "headline"
- **Discussion:** "discussion", "discuss", "opinion", "reddit", "forum", "stackoverflow", "ask"
- **Image:** "image", "picture", "photo", "show me", "visual", "diagram"

#### E. Integration in Chat Flow

**Location:** `apps/web/app/page.tsx` (lines 340-368)

**Trigger:** After user sends message, before LLM streaming starts

**Conditions:**
1. Feature flag enabled: `isAutoSearchEnabled()`
2. Cooldown: At least 8 seconds since last manual search
3. Parallel execution: Fire-and-forget, doesn't block streaming

**Result:** Search results appended as separate assistant message

---

## 2. Domain Suggestion System

### Overview
Provides intelligent domain/website suggestions as users type in the Research artifact, ranked by relevance, authority, and user preference.

### Components

#### A. Query Classifier (`packages/search/src/queryClassifier.ts`)

**Function:** `inferVerticals(q)`

**Classifications:**
1. **News** - "news", "latest", "2025", "breaking", "today", "recent"
2. **Docs** - "docs", "documentation", "guide", "tutorial", "how to", "api reference"
3. **Academic** - "paper", "research", "arxiv", "publication", "journal", "benchmark", "study"
4. **Forums** - "reddit", "forum", "discussion", "stackoverflow", "stack exchange"
5. **Code** - "github", "git", "code", "repository", "repo", "programming"
6. **Gov** - "government", "gov", ".gov", "official", "regulation", "policy"
7. **Generic** - Default fallback

**Additional Features:**
- Time sensitivity detection
- Keyword extraction (stop word filtering)
- Site-specific detection via `site:` operator

#### B. Domain Reranker (`packages/search/src/reranker.ts`)

**Function:** `scoreDomain(q, qVec, domain, userAffinity, priors)`

**Scoring Formula:**
```
score = 0.35 * textMatch(q, blurb) +           // BM25 text matching
        0.30 * cosine(qVec, d.vec) +            // Vector similarity
        0.15 * verticalMatch +                   // Vertical alignment
        0.10 * affinity(ua) +                    // User behavior
        0.05 * authority(d) +                    // Domain authority (1=high, 3=low)
        0.05 * recency(q, d) -                   // Time sensitivity
        0.10 * spamRisk                           // Spam penalty
```

**Authority Tiers:**
- Tier 1: 1.0 score (high authority)
- Tier 2: 0.7 score (medium authority)  
- Tier 3: 0.4 score (low authority)

**User Affinity:**
- Pinned domains: +0.1 bonus
- Blocked domains: -Infinity (excluded)
- CTR: Laplace smoothing `(clicks + 1) / (shows + 2)`

#### C. Suggestion API Endpoint (`apps/web/app/api/suggest/domains/route.ts`)

**Endpoint:** POST `/api/suggest/domains`

**Input:**
```typescript
{
  q: string;           // User query
  userId?: string;     // Optional user ID for personalization
  limit?: number;      // Default: 10
}
```

**Output:**
```typescript
{
  suggestions: Array<{
    host: string;
    reason: string[];
    vertical: Vertical;
    score: number;
    badges: string[];
  }>;
  groupedByVertical: Record<Vertical, Suggestion[]>;
  cacheKey: string;
  cached: boolean;
}
```

**Candidate Sources (Combined):**
1. **Brave Search Hosts** - Top 100 hosts from web search results
2. **Topical Neighbors** - Vector similarity search (384d embeddings, threshold 0.7)
3. **Vertical Priors** - Hand-curated domains per vertical:
   - **Docs:** docs.github.com, developer.mozilla.org, docs.python.org, react.dev
   - **Academic:** arxiv.org, scholar.google.com, ieee.org, acm.org, pubmed
   - **News:** bbc.com, reuters.com, apnews.com, theguardian.com
   - **Forums:** reddit.com, stackoverflow.com, stackexchange.com
   - **Code:** github.com, gitlab.com, bitbucket.org
   - **Gov:** usa.gov, gov.uk
4. **User History** - Recently clicked or pinned domains

**Scoring Process:**
1. Generate query embedding (384d via OpenAI `text-embedding-3-small`)
2. Load domain info + vectors from database
3. Load user affinity for candidate domains
4. Score each domain using weighted formula
5. Sort by score (descending)
6. Group by vertical
7. Cache results (5 min TTL, Redis)

#### D. Client Integration (`packages/ui/src/components/artifacts/research/FiltersRail.tsx`)

**Features:**
- Debounced fetching (1.5 second delay)
- Minimum query length: 2 characters
- Real-time suggestions as user types
- Badge display (authority, relevance, time-sensitive)
- Pin/block actions (saved to user affinity)

**Flow:**
```typescript
// Debounce query
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedQuery(query);
  }, DEBOUNCE_DELAY);
  return () => clearTimeout(timer);
}, [query]);

// Fetch suggestions
useEffect(() => {
  fetch('/api/suggest/domains', {
    method: 'POST',
    body: JSON.stringify({ q: debouncedQuery, limit: 10 })
  });
}, [debouncedQuery]);
```

#### E. Supporting Infrastructure

**Database Schema:**
- `domains` - Metadata (host, name, blurb, verticals, authority, spam_risk)
- `domain_vectors` - 384d embeddings for semantic search
- `user_affinity` - User interaction history (shows, clicks, pinned, blocked)
- `suggest_cache` - Cached suggestion results

**Rate Limiting:**
- 10 requests/second per IP/user
- Redis-based sliding window

**Caching Strategy:**
- Brave hosts: 10-60 minutes
- Suggestions: 5 minutes
- Cache keys: SHA-256 hash of query + user ID

---

## 3. Search Formatting

### Search Answer Builder (`apps/web/lib/searchFormat.ts`)

**Purpose:** Convert raw search results into structured, displayable format

**Output Structure:**
```typescript
{
  kind: 'web_search';
  query: string;
  fetchedAt: ISO string;
  summary: string;
  highlights: Array<{ text: string; cites: number[] }>;
  sources: Array<{ n, title, host, date, url, favicon, type }>;
  thumbnails: Array<{ url, title, thumbnail, host, type }>;
  groupedResults: {
    videos?: SearchItem[];
    podcasts?: SearchItem[];
    news?: SearchItem[];
    articles?: SearchItem[];
    images?: SearchItem[];
    discussions?: SearchItem[];
    locations?: SearchItem[];
  };
  faqs?: FAQItem[];
  infobox?: InfoboxData;
}
```

**Source Types:**
- web
- video
- news
- article
- image
- discussion
- podcast
- location

**Badge Generation:**
- "Frequently cited" - textMatch > 0.7
- "Topically relevant" - cosine > 0.7
- "Recent" - time-sensitive + lastPostDays < 7
- Authority badges (High authority, Reputable)
- Vertical badges (Docs, Academic, News, Forum, Code, Personalized)

---

## 4. Feature Flags

### Auto-Search
```bash
isAutoSearchEnabled()  # Feature flag check
```

### Domain Suggestions
```bash
NEXT_PUBLIC_FEATURE_DOMAIN_SUGGEST=true  # Frontend
FEATURE_DOMAIN_SUGGEST=true               # Backend
```

### Domain Reranker
```bash
NEXT_PUBLIC_FEATURE_DOMAIN_RERANKER=true
```

---

## 5. Performance & Caching

### Cache TTLs
- Domain suggestions: 5 minutes (Redis)
- Brave hosts: 10-60 minutes (based on freshness)
- Search results: 12-24 hours (Brave API + Redis)

### Performance Targets
- Suggestion latency: < 150ms (excluding Brave)
- Cache hit rate: > 70% expected
- Diversity: ≥ 5 unique hosts in top-8

### Optimization Strategies
1. Debouncing (1.5s for suggestions)
2. Parallel execution (auto-search doesn't block streaming)
3. Vector similarity for fast topical matching
4. BM25 caching for text matching
5. Cooldown periods (8s for auto-search)

---

## 6. Key Algorithms Summary

### Auto-Search Decision Tree
```
User sends query
  ↓
Fast rules check (keyword matching)
  ↓ (if no match)
LLM validation (gpt-4o-mini, confidence >= 0.6)
  ↓ (if validated)
Determine verticals (optimize for <2 API calls)
  ↓
Execute Brave search
  ↓
Format results
  ↓
Append as assistant message
```

### Domain Suggestion Flow
```
User types query
  ↓ (debounce 1.5s)
Generate query embedding (384d)
  ↓
Gather candidates:
  - Brave hosts (100)
  - Vector neighbors (K=50, sim > 0.7)
  - Vertical priors (hand-curated)
  - User history (clicks/pins)
  ↓
Load domain info + vectors
  ↓
Score each domain (weighted formula)
  ↓
Sort by score, group by vertical
  ↓
Return top 10, cache for 5 min
```

---

## 7. Supported Verticals

### Auto-Search Verticals
- web (default, includes videos/discussions)
- news
- videos
- images
- discussions

### Domain Suggestion Verticals
- news
- docs
- academic
- forums
- code
- gov
- generic

---

## 8. User Personalization

### Features
- Click-through rate tracking
- Pin/unpin domains
- Block/unblock domains
- Personalized badges
- Laplace smoothing for CTR

### Storage
- Browser localStorage (client-side affinity)
- Database `user_affinity` table (server-side)
- Telemetry events (anonymized)

---

## 9. Files Reference

### Auto-Search
- `apps/web/lib/autoSearch/orchestrator.ts` - Main orchestrator
- `apps/web/lib/autoSearch/rules.ts` - Fast keyword rules
- `apps/web/lib/autoSearch/validator.ts` - LLM validator
- `apps/web/lib/searchQueryAnalyzer.ts` - Vertical suggestion
- `apps/web/app/page.tsx` (340-368) - Integration point
- `apps/web/app/api/llm/validate-auto-search/route.ts` - LLM endpoint

### Domain Suggestions
- `packages/search/src/queryClassifier.ts` - Vertical classification
- `packages/search/src/reranker.ts` - Scoring algorithm
- `packages/search/src/bm25.ts` - Text matching
- `apps/web/app/api/suggest/domains/route.ts` - Main API
- `packages/ui/src/components/artifacts/research/FiltersRail.tsx` - UI component
- `docs/DOMAIN_SUGGESTION_SERVICE.md` - Documentation

### Formatting
- `apps/web/lib/searchFormat.ts` - Result formatting
- `apps/web/lib/textClean.ts` - Text sanitization

---

## 10. Privacy & Security

### Privacy
- Query text hashed for telemetry (SHA-256)
- No PII logged
- User affinity optional (userId not required)

### Security
- Rate limiting (10 req/s per IP/user)
- Redis-based sliding window
- Feature flags for gradual rollout
- Input validation on all endpoints
- Authentication required (withAuth wrapper)

---

## Conclusion

The Opera codebase implements sophisticated, multi-layered research and suggestion systems that:

1. **Automatically detect** when users need web search results
2. **Classify queries** into content verticals efficiently
3. **Personalize suggestions** based on user behavior and preferences
4. **Optimize performance** through caching, debouncing, and vector search
5. **Maintain privacy** while providing intelligent recommendations

Both systems work together to enhance the user experience with minimal friction and intelligent, context-aware suggestions.

