# Complete Architecture Documentation

This document contains all relevant code files for understanding the memory, system prompting, and complete chat functionality.

---

## 1. Main Chat API Route

**File:** `apps/llm-gateway/src/routes.ts`
**Purpose:** Main entry point for chat requests handling SSE streaming

### Key Components:
- Authentication and authorization
- Rate limiting and concurrency control
- Web search integration
- Memory recall (ingested context)
- Query analysis and correction
- Smart model routing
- Context trimming
- Prompt building
- Streaming response handling

### Main Flow:
1. User sends POST to `/v1/chat/stream`
2. Authenticate and check rate limits
3. Retrieve ingested context if query needs recent info
4. Trigger web search if query needs up-to-date information
5. Trim context and gather memories
6. Build prompts using PromptBuilder
7. Route to optimal model
8. Stream response back to user
9. Save messages and emit memory events

### Critical Sections:

```typescript:100-808:apps/llm-gateway/src/routes.ts
// Main chat streaming route handler
// Lines 100-808 contain the complete chat flow including:
// - Web search detection and streaming
// - Ingested context retrieval
// - Query analysis
// - Memory recall
// - Smart model selection
// - Prompt building
// - Streaming execution
```

---

## 2. Router

**File:** `apps/llm-gateway/src/Router.ts`
**Purpose:** Intelligent model routing based on query characteristics

### Key Features:
- Smart model selection (cost-optimized, context-heavy, reasoning-heavy)
- Fast response (FR) routing
- Model-specific timeouts and limits
- Context-based routing decisions

```typescript:6-142:apps/llm-gateway/src/Router.ts
export class Router {
  // Model router configuration
  private modelRouter = {
    'cost-optimized': { provider: 'openai', model: 'gpt-4o-mini' },
    'context-heavy': { provider: 'google', model: 'gemini-2.0-flash-exp' },
    'reasoning-heavy': { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    'multimodal': { provider: 'google', model: 'gemini-2.0-flash-exp' },
    'fallback': { provider: 'anthropic', model: 'claude-3-haiku-20240307' }
  };
  
  // Smart model selection based on query characteristics
  selectOptimalModel(query: string, queryAnalysis?: { complexity: string; intent?: string }, contextSize?: number)
  shouldUseFR(threadId: string | undefined, userId?: string)
  routeFR(provider, messages, model, options)
  routePrimary(provider, messages, model, options)
}
```

---

## 3. Context Trimmer

**File:** `apps/llm-gateway/src/ContextTrimmer.ts`
**Purpose:** Manages conversation context, memory recall, and context trimming

### Key Features:
- Memory recall from memory service
- Hybrid RAG integration
- Conversation history management
- Context preprocessing
- Token limit management

```typescript:7-387:apps/llm-gateway/src/ContextTrimmer.ts
export class ContextTrimmer {
  // Main trim method that orchestrates all context gathering
  async trim(threadId: string, messages: Array<{ role, content }>, userId?: string)
  
  // Memory recall (direct and hybrid RAG)
  // Lines 45-289: Memory recall logic
  // - Direct memory recall
  // - Hybrid RAG (if enabled)
  // - Deduplication and prioritization
  // - Preprocessing into natural narrative
  
  // Conversation history
  // Lines 291-343: Fetch and add last 2 conversation histories
  
  // Context token estimation
  private estimateTokens(text: string)
}
```

---

## 4. Prompt Builder

**File:** `apps/llm-gateway/src/PromptBuilder.ts`
**Purpose:** Modular prompt architecture for building system prompts

### Key Features:
- Base conversational prompt
- Priority-based instructions
- Context blocks (memory, ingestion, RAG, conversation, summary)
- Automatic preprocessing
- Layered architecture

```typescript:28-276:apps/llm-gateway/src/PromptBuilder.ts
export class PromptBuilder {
  private basePrompt: string | null = null;
  private instructions: Instruction[] = [];
  private contextBlocks: ContextBlock[] = [];
  
  setBasePrompt(prompt: string)
  addInstruction(instruction: string, priority: InstructionPriority)
  addContext(rawContext: string, type: ContextBlock['type'], preprocess: boolean)
  build(): Array<{ role: 'system'; content: string }>
  
  // Default base prompt defines tone, ethics, and behavior
  static getDefaultBasePrompt(): string
}
```

---

## 5. Context Preprocessor

**File:** `apps/llm-gateway/src/ContextPreprocessor.ts`
**Purpose:** Transforms structured context blocks into natural narrative

### Key Features:
- Converts structured data to natural language
- Type-specific preprocessing (memory, ingestion, RAG, conversation, summary)
- Removes metadata noise
- Improves LLM comprehension

```typescript:1-390:apps/llm-gateway/src/ContextPreprocessor.ts
// Main preprocessing function
export function preprocessContext(rawContext: string, contextType: 'memory' | 'ingestion' | 'rag' | 'conversation' | 'summary')

// Type-specific transformers
preprocessMemoryContext(text: string)
preprocessIngestionContext(text: string)
preprocessRAGContext(text: string)
preprocessConversationContext(text: string)
preprocessSummaryContext(text: string)

// Formatters
formatAsNarrative(content: string, type: 'memory' | 'web' | 'vector')
formatIngestionItem(content: string, domain?: string)
formatConversationHistory(summary: string, convNum?: number)
```

---

## 6. Query Analyzer

**File:** `apps/llm-gateway/src/QueryAnalyzer.ts`
**Purpose:** Detects query complexity and intent for dynamic verbosity scaling

### Key Features:
- Query complexity detection (simple, moderate, complex)
- Intent classification (factual, explanatory, discussion, action, memory_list, memory_save, conversational_followup, needs_web_search)
- Verbosity instruction generation
- Follow-up guidance

```typescript:1-148:apps/llm-gateway/src/QueryAnalyzer.ts
export type QueryComplexity = 'simple' | 'moderate' | 'complex';
export type QueryIntent = 'factual' | 'explanatory' | 'discussion' | 'action' | 'memory_list' | 'memory_save' | 'conversational_followup' | 'needs_web_search';

export interface QueryAnalysis {
  complexity: QueryComplexity;
  intent: QueryIntent;
  wordCount: number;
  requiresDetail: boolean;
  suggestsFollowUp: boolean;
}

analyzeQuery(query: string): QueryAnalysis
getVerbosityInstruction(analysis: QueryAnalysis): string | null
getFollowUpGuidance(analysis: QueryAnalysis): string | null
```

---

## 7. Query Corrector

**File:** `apps/llm-gateway/src/QueryCorrector.ts`
**Purpose:** Auto-corrects typos in user queries using LLM

### Key Features:
- LLM-based typo correction
- Haiku 3 model for fast corrections
- 2-second timeout
- Heuristic pre-filtering

```typescript:1-136:apps/llm-gateway/src/QueryCorrector.ts
export async function correctQuery(query: string): Promise<string | null>
export function likelyHasTypos(query: string): boolean
```

---

## 8. Model Providers

### Base Provider
**File:** `apps/llm-gateway/src/providers/base.ts`
```typescript:1-25:apps/llm-gateway/src/providers/base.ts
export abstract class BaseProvider implements IProvider {
  protected pool: Pool;
  
  abstract prepare(): Promise<void>;
  abstract stream(messages, model, options): ProviderStreamResult;
  abstract estimate(messages, model): number;
  
  protected estimateTokens(text: string)
}
```

### OpenAI Provider
**File:** `apps/llm-gateway/src/providers/openai.ts`
```typescript:1-92:apps/llm-gateway/src/providers/openai.ts
export class OpenAIProvider extends BaseProvider {
  async prepare()
  stream(messages, model, options): ProviderStreamResult
  estimate(messages, model): number
}
```

### Anthropic Provider
**File:** `apps/llm-gateway/src/providers/anthropic.ts`
```typescript:1-103:apps/llm-gateway/src/providers/anthropic.ts
export class AnthropicProvider extends BaseProvider {
  async prepare()
  stream(messages, model, options): ProviderStreamResult
  estimate(messages, model): number
}
```

### Google Provider
**File:** `apps/llm-gateway/src/providers/google.ts`
```typescript:1-162:apps/llm-gateway/src/providers/google.ts
export class GoogleProvider extends BaseProvider {
  async prepare()
  stream(messages, model, options): ProviderStreamResult
  estimate(messages, model): number
}
```

### Provider Pool
**File:** `apps/llm-gateway/src/ProviderPool.ts`
```typescript:9-55:apps/llm-gateway/src/ProviderPool.ts
class ProviderPool {
  private pools: Map<string, Pool> = new Map();
  private providers: Map<string, IProvider> = new Map();
  
  getProvider(name: string): IProvider | undefined
  async prepare()
}
```

---

## 9. Memory Service Routes

**File:** `apps/memory-service/src/routes.ts`
**Purpose:** Memory management, recall, audit, and research integration

### Key Endpoints:
- `POST /v1/events/message` - Fire-and-forget message event
- `POST /v1/memories` - Create explicit memory
- `GET /v1/memories` - List memories
- `PATCH /v1/memories/:id` - Update memory
- `GET /v1/recall` - Async recall with deadline
- `GET /v1/conversations` - Get conversation history
- `GET /v1/profile` - Get user profile

### Job Handlers:
- `audit` - Memory quality scoring and extraction
- `research` - Background research pipeline

```typescript:29-966:apps/memory-service/src/routes.ts
export function registerRoutes(app: FastifyInstance, db: DatabaseConnection, cadence: CadenceTracker, queue: JobQueue, gatewayDb: Database.Database | null)

// Message event handler
app.post('/v1/events/message', async (req, reply) => {
  // Record message in cadence tracker
  // Trigger audit if threshold met
  // Trigger research if enabled
})

// Memory recall
app.get('/v1/recall', async (req, reply) => {
  // Hybrid search or keyword-only
  // Post-processing deduplication
  // Deadline-constrained execution
})

// Audit job handler
queue.registerHandler('audit', async (job) => {
  // Fetch messages from gateway DB
  // Score messages for quality
  // Save high-quality memories
  // Generate summaries
  // Trigger research if needed
})

// Research job handler
queue.registerHandler('research', async (job) => {
  // Run research pipeline
  // Publish capsule to Redis
})
```

---

## 10. Database Schemas

### Gateway Database
**File:** `apps/llm-gateway/src/database.ts`
```typescript:36-98:apps/llm-gateway/src/database.ts
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  meta JSON,
  important INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS thread_summaries (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_msg_id TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  deleted_at INTEGER,
  embedding_id TEXT,
  summary_embedding BLOB,
  embedding_updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS cost_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  input_cost REAL NOT NULL,
  output_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch('now'))
);
```

### Memory Service Database
**File:** `apps/memory-service/src/db.ts`
```typescript:29-108:apps/memory-service/src/db.ts
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  content TEXT NOT NULL CHECK(length(content) <= 1024),
  entities TEXT,
  priority REAL NOT NULL DEFAULT 0.5 CHECK(priority >= 0 AND priority <= 1),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  redactionMap TEXT,
  tier TEXT CHECK(tier IN('TIER1','TIER2','TIER3')) DEFAULT 'TIER3',
  sourceThreadId TEXT,
  repeats INTEGER DEFAULT 1,
  threadSet TEXT,
  lastSeenTs INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);

CREATE TABLE IF NOT EXISTS memory_audits (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  threadId TEXT NOT NULL,
  startMsgId TEXT,
  endMsgId TEXT,
  tokenCount INTEGER NOT NULL CHECK(tokenCount >= 0),
  score REAL NOT NULL,
  saved INTEGER NOT NULL CHECK(saved >= 0),
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_summaries (
  threadId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  summary TEXT NOT NULL,
  lastMsgId TEXT,
  tokenCount INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);

CREATE TABLE IF NOT EXISTS user_profiles (
  userId TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  lastUpdated INTEGER NOT NULL,
  deletedAt INTEGER
);
```

---

## 11. Configuration

### Gateway Config
**File:** `apps/llm-gateway/config/llm-gateway.json`
```json:1-32:apps/llm-gateway/config/llm-gateway.json
{
  "flags": {
    "fr": true,
    "rag": false,
    "hybridRAG": true,
    "editor": false,
    "search": true,
    "memoryEvents": true
  },
  "timeouts": {
    "softMs": 8000,
    "hardMs": 15000,
    "ttfbSoftMs": 800
  },
  "models": {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-haiku-20240307",
    "google": "gemini-2.0-flash-exp"
  },
  "router": {
    "frMaxTokens": 120,
    "frTimeoutMs": 400,
    "keepLastTurns": 10,
    "maxInputTokens": 16000,
    "maxOutputTokens": 16384,
    "maxOutputTokensPerProvider": {
      "openai": 16384,
      "anthropic": 4096,
      "google": 8192
    }
  }
}
```

### Memory Config
**File:** `apps/memory-service/config/memory.json`
```json:1-83:apps/memory-service/config/memory.json
{
  "cadence": {
    "msgs": 6,
    "tokens": 1500,
    "minutes": 3,
    "debounceSec": 30
  },
  "thresholds": {
    "save": 0.65,
    "high": 0.80,
    "maxPerAudit": 3
  },
  "limits": {
    "maxEntryChars": 1024,
    "maxPerUser": 1000
  },
  "privacy": {
    "redact": true
  },
  "tiers": {
    "TIER1": { "name": "cross_recent", "scoreWeights": {...}, "saveThreshold": 0.62, "ttlDays": 120 },
    "TIER2": { "name": "prefs_goals", "scoreWeights": {...}, "saveThreshold": 0.70, "ttlDays": 365 },
    "TIER3": { "name": "general", "scoreWeights": {...}, "saveThreshold": 0.70, "ttlDays": 90 }
  },
  "asyncRecall": {
    "deadlineMs": 30,
    "maxItems": 5
  }
}
```

---

## 12. Research Pipeline

**File:** `apps/memory-service/src/research/pipeline/index.ts`
**Purpose:** Research pipeline entry point

```typescript:1-80:apps/memory-service/src/research/pipeline/index.ts
export async function runResearchPipeline(job: ResearchJob): Promise<ResearchCapsule | null> {
  // Publish research started indicator
  // Check cache
  // Fetch and rerank
  // Build capsule
  // Cache and publish capsule
}
```

---

## 13. Schemas and Types

### Shared Schemas
**File:** `packages/shared/src/schemas.ts`
```typescript:1-30:packages/shared/src/schemas.ts
export const ChatStreamRequestSchema = z.object({
  thread_id: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })),
  model: z.string().optional(),
  provider: z.enum(['openai', 'anthropic', 'google']).optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
});

export const ChatStreamEventSchema = z.object(...);
```

### Shared Types
**File:** `packages/shared/src/types.ts`
```typescript:1-21:packages/shared/src/types.ts
export type Provider = 'openai' | 'anthropic' | 'google';

export interface ProviderRequest {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ProviderStreamEvent {
  type: 'token' | 'done' | 'error';
  data: any;
}
```

---

## Complete Flow Diagram

```
User Message
    ↓
[Authentication & Rate Limiting]
    ↓
[Query Analysis] → QueryAnalyzer
    ↓
[Query Correction] → QueryCorrector (if needed)
    ↓
[Web Search Decision] → needsWebSearch()
    ↓
[Parallel Context Gathering]
    ├─→ [Ingested Context] (1s timeout)
    ├─→ [Web Search] (5s timeout) 
    └─→ [Memory Recall] (200ms deadline)
    ├─→ Direct Memory Recall
    └─→ Hybrid RAG (if enabled)
    ↓
[Context Trimming] → ContextTrimmer
    ├─→ Fetch memories
    ├─→ Add conversation history
    ├─→ Add thread summary
    └─→ Trim to token limits
    ↓
[Prompt Building] → PromptBuilder
    ├─→ Base prompt
    ├─→ Instructions (priority-based)
    └─→ Context blocks (preprocessed)
    ↓
[Model Routing] → Router
    ├─→ Query complexity
    ├─→ Context size
    └─→ Select optimal model
    ↓
[Streaming Response] → Provider (OpenAI/Anthropic/Google)
    ↓
[Save Messages]
[Emit Memory Events] (fire-and-forget)
[Update Metrics]
    ↓
Response to User

Background:
- Memory Audit (cadence-based)
  └─→ Research Pipeline (if needed)
```

---

## Key Concepts

### 1. Memory Tiers
- **TIER1 (cross_recent)**: Cross-thread memories, most important
- **TIER2 (prefs_goals)**: Preferences and goals
- **TIER3 (general)**: General memories

### 2. Context Preprocessing
All structured context is preprocessed into natural narrative:
- `[Memory] user studied dopamine` → "You mentioned studying dopamine earlier."
- `React Hooks: Learn about useState (from react.dev)` → "Learn about React Hooks, specifically useState."

### 3. Smart Model Routing
- **Cost-optimized**: OpenAI gpt-4o-mini (default)
- **Context-heavy**: Google gemini-2.0-flash-exp (50k+ tokens)
- **Reasoning-heavy**: Anthropic claude-3-5-sonnet (complex queries)

### 4. Memory Recall Strategy
1. Direct recall (always performed)
2. Hybrid RAG (if enabled, supplements direct recall)
3. Deduplication (topic-based + semantic similarity)
4. Deadline-constrained (200ms max)

### 5. Web Search Flow
1. Query analysis detects `needs_web_search` intent
2. Streaming web search initiated
3. If completed and streamed, skip main LLM
4. Otherwise, fallback to main LLM

---

## Additional Resources

### Documentation Files
- `docs/MEMORY_BLUEPRINT.md` - Memory system architecture
- `docs/MEMORY_AUDIT.md` - Memory audit details
- `RESEARCH_IMPLEMENTATION_SUMMARY.md` - Research system overview
- `RESEARCH_AUTO_SUGGEST_AUDIT.md` - Research algorithms

### Configuration
- `.env.example` - Environment variables
- `apps/llm-gateway/src/config.ts` - Config loader
- `apps/memory-service/src/config.ts` - Memory config

### Tests
- `apps/llm-gateway/src/PromptBuilder.test.ts` - PromptBuilder tests
- `apps/web/src/pages/PromptTester.tsx` - Frontend prompt testing

---

## Summary

This architecture implements a sophisticated chat system with:
- **Smart memory recall** with cross-thread support
- **Modular prompt building** with preprocessing
- **Intelligent model routing** based on query characteristics
- **Real-time web search** with streaming
- **Background research** triggered by conversation quality
- **Quality-scored memories** with automatic redaction
- **Multi-tier memory system** with different retention policies
- **Context preprocessing** for better LLM comprehension

All components are designed for **non-blocking, deadline-constrained** execution to maintain low latency while providing rich context.

