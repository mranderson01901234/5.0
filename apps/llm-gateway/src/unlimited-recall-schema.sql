-- ============================================================================
-- Unlimited Recall System - 3-Part Conversation Storage
-- ============================================================================

-- ============================================================================
-- TABLE 1: Full Message History (100% capture)
-- Stores every single message for perfect recall
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  msg_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),

  -- Metadata for smart filtering
  is_code_heavy INTEGER DEFAULT 0,
  is_question INTEGER DEFAULT 0,
  has_decision INTEGER DEFAULT 0,

  -- Soft delete
  deleted_at INTEGER
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_conv_messages_thread_time
  ON conversation_messages(thread_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_messages_user_thread
  ON conversation_messages(user_id, thread_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_messages_user_time
  ON conversation_messages(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLE 2: Conversation Metadata (3-part structure)
-- Stores label, summary, and metadata for each conversation
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_packages (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- PART 1: Label (smart topic name)
  label TEXT NOT NULL,
  label_tokens INTEGER DEFAULT 0,
  label_generated_at INTEGER,

  -- PART 2: Summary (condensed version)
  summary TEXT,
  summary_tokens INTEGER DEFAULT 0,
  summary_updated_at INTEGER,

  -- PART 3: Full transcript metadata
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  user_msg_count INTEGER DEFAULT 0,
  assistant_msg_count INTEGER DEFAULT 0,

  -- Smart categorization
  primary_topic TEXT,
  importance_score REAL DEFAULT 0.5,
  has_code INTEGER DEFAULT 0,
  has_decisions INTEGER DEFAULT 0,

  -- Activity tracking
  first_message_at INTEGER,
  last_message_at INTEGER,
  last_accessed_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  deleted_at INTEGER
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_conv_packages_user_recent
  ON conversation_packages(user_id, last_message_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_packages_topic
  ON conversation_packages(user_id, primary_topic, importance_score DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_packages_user_updated
  ON conversation_packages(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLE 3: Conversation Embeddings (for semantic search)
-- Stores embeddings for label + summary (not full transcript)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_embeddings (
  thread_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Embeddings for semantic search
  label_embedding BLOB,
  summary_embedding BLOB,
  combined_embedding BLOB,

  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  embedding_dimensions INTEGER DEFAULT 512,

  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now')),

  FOREIGN KEY (thread_id) REFERENCES conversation_packages(thread_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_embeddings_user
  ON conversation_embeddings(user_id)
  WHERE combined_embedding IS NOT NULL;

-- ============================================================================
-- TABLE 4: Recall Events (for tracking and optimization)
-- Tracks when and how memories are recalled
-- ============================================================================
CREATE TABLE IF NOT EXISTS recall_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_thread_id TEXT NOT NULL,
  recalled_thread_id TEXT,

  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('resume', 'historical', 'semantic', 'manual')),
  trigger_query TEXT,

  strategy_used TEXT CHECK(strategy_used IN ('full', 'hierarchical', 'compressed', 'snippet')),
  tokens_injected INTEGER DEFAULT 0,
  relevance_score REAL,

  success INTEGER DEFAULT 1,
  error TEXT,

  latency_ms INTEGER,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch('now'))
);

CREATE INDEX IF NOT EXISTS idx_recall_events_user_time
  ON recall_events(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_recall_events_trigger
  ON recall_events(trigger_type, timestamp DESC);

-- ============================================================================
-- TABLE 5: Pending Jobs Queue
-- Background jobs for label/summary generation
-- ============================================================================
CREATE TABLE IF NOT EXISTS recall_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK(job_type IN ('label', 'summary', 'embedding', 'cleanup')),
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  priority INTEGER DEFAULT 5,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',

  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  error TEXT,
  result TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch('now')),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_recall_jobs_status
  ON recall_jobs(status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_recall_jobs_thread
  ON recall_jobs(thread_id, job_type);
