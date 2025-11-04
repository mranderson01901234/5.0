/**
 * Unlimited Recall Database Layer
 * Manages the 3-part conversation storage system
 */

import type Database from 'better-sqlite3';
import { logger } from './log.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize unlimited recall schema
 */
export function initUnlimitedRecallSchema(db: Database.Database): void {
  try {
    const schemaSQL = readFileSync(
      join(__dirname, 'unlimited-recall-schema.sql'),
      'utf-8'
    );

    db.exec(schemaSQL);

    logger.info('Unlimited recall schema initialized successfully');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initialize unlimited recall schema');
    throw error;
  }
}

/**
 * Types
 */
export interface ConversationMessage {
  id: string;
  user_id: string;
  thread_id: string;
  msg_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_input: number;
  tokens_output: number;
  created_at: number;
  is_code_heavy: boolean;
  is_question: boolean;
  has_decision: boolean;
}

export interface ConversationPackage {
  thread_id: string;
  user_id: string;
  label: string;
  label_tokens: number;
  label_generated_at: number | null;
  summary: string | null;
  summary_tokens: number;
  summary_updated_at: number | null;
  message_count: number;
  total_tokens: number;
  user_msg_count: number;
  assistant_msg_count: number;
  primary_topic: string | null;
  importance_score: number;
  has_code: boolean;
  has_decisions: boolean;
  first_message_at: number | null;
  last_message_at: number | null;
  last_accessed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ConversationEmbedding {
  thread_id: string;
  user_id: string;
  label_embedding: Buffer | null;
  summary_embedding: Buffer | null;
  combined_embedding: Buffer | null;
  embedding_model: string;
  embedding_dimensions: number;
  created_at: number;
  updated_at: number;
}

export interface RecallEvent {
  id: string;
  user_id: string;
  current_thread_id: string;
  recalled_thread_id: string | null;
  trigger_type: 'resume' | 'historical' | 'semantic' | 'manual';
  trigger_query: string | null;
  strategy_used: 'full' | 'hierarchical' | 'compressed' | 'snippet' | null;
  tokens_injected: number;
  relevance_score: number | null;
  success: boolean;
  error: string | null;
  latency_ms: number | null;
  timestamp: number;
}

export interface RecallJob {
  id: string;
  job_type: 'label' | 'summary' | 'embedding' | 'cleanup';
  thread_id: string;
  user_id: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  max_retries: number;
  error: string | null;
  result: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

/**
 * Database operations
 */
export class UnlimitedRecallDB {
  constructor(private db: Database.Database) {}

  /**
   * Store a message in the conversation history
   */
  storeMessage(message: Omit<ConversationMessage, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO conversation_messages (
        id, user_id, thread_id, msg_id, role, content,
        tokens_input, tokens_output, is_code_heavy, is_question, has_decision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.user_id,
      message.thread_id,
      message.msg_id,
      message.role,
      message.content,
      message.tokens_input,
      message.tokens_output,
      message.is_code_heavy ? 1 : 0,
      message.is_question ? 1 : 0,
      message.has_decision ? 1 : 0
    );
  }

  /**
   * Get all messages for a conversation
   */
  getConversationMessages(threadId: string, userId: string): ConversationMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_messages
      WHERE thread_id = ? AND user_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC
    `);

    return stmt.all(threadId, userId) as ConversationMessage[];
  }

  /**
   * Get last N messages from conversation
   */
  getRecentMessages(threadId: string, userId: string, limit: number): ConversationMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_messages
      WHERE thread_id = ? AND user_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const messages = stmt.all(threadId, userId, limit) as ConversationMessage[];
    return messages.reverse(); // Return in chronological order
  }

  /**
   * Update or create conversation package
   */
  upsertConversationPackage(pkg: Partial<ConversationPackage> & { thread_id: string; user_id: string }): void {
    const existing = this.db.prepare(`
      SELECT thread_id FROM conversation_packages WHERE thread_id = ?
    `).get(pkg.thread_id);

    if (existing) {
      // Update existing
      const updates: string[] = [];
      const values: any[] = [];

      Object.entries(pkg).forEach(([key, value]) => {
        if (key !== 'thread_id' && key !== 'user_id' && key !== 'created_at' && value !== undefined) {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (updates.length > 0) {
        updates.push('updated_at = ?');
        values.push(Math.floor(Date.now() / 1000));
        values.push(pkg.thread_id);

        const stmt = this.db.prepare(`
          UPDATE conversation_packages
          SET ${updates.join(', ')}
          WHERE thread_id = ?
        `);

        stmt.run(...values);
      }
    } else {
      // Insert new
      const now = Math.floor(Date.now() / 1000);
      const stmt = this.db.prepare(`
        INSERT INTO conversation_packages (
          thread_id, user_id, label, label_tokens, message_count, total_tokens,
          user_msg_count, assistant_msg_count, importance_score, first_message_at,
          last_message_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        pkg.thread_id,
        pkg.user_id,
        pkg.label || 'Untitled conversation',
        pkg.label_tokens || 0,
        pkg.message_count || 0,
        pkg.total_tokens || 0,
        pkg.user_msg_count || 0,
        pkg.assistant_msg_count || 0,
        pkg.importance_score || 0.5,
        pkg.first_message_at || now,
        pkg.last_message_at || now,
        now,
        now
      );
    }
  }

  /**
   * Get conversation package
   */
  getConversationPackage(threadId: string, userId: string): ConversationPackage | null {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_packages
      WHERE thread_id = ? AND user_id = ? AND deleted_at IS NULL
    `);

    return stmt.get(threadId, userId) as ConversationPackage | null;
  }

  /**
   * Get recent conversations for user (excluding current thread)
   */
  getRecentConversations(userId: string, excludeThreadId: string, limit: number = 20): ConversationPackage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_packages
      WHERE user_id = ? AND thread_id != ? AND deleted_at IS NULL
      ORDER BY last_message_at DESC
      LIMIT ?
    `);

    return stmt.all(userId, excludeThreadId, limit) as ConversationPackage[];
  }

  /**
   * Search conversations by timeframe
   */
  searchConversationsByTimeframe(
    userId: string,
    startTime: number,
    endTime: number
  ): ConversationPackage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_packages
      WHERE user_id = ?
        AND last_message_at >= ?
        AND last_message_at <= ?
        AND deleted_at IS NULL
      ORDER BY last_message_at DESC
      LIMIT 50
    `);

    return stmt.all(userId, startTime, endTime) as ConversationPackage[];
  }

  /**
   * Store conversation embedding
   */
  storeEmbedding(embedding: Omit<ConversationEmbedding, 'created_at' | 'updated_at'>): void {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.db.prepare(`
      SELECT thread_id FROM conversation_embeddings WHERE thread_id = ?
    `).get(embedding.thread_id);

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE conversation_embeddings
        SET label_embedding = ?,
            summary_embedding = ?,
            combined_embedding = ?,
            embedding_model = ?,
            embedding_dimensions = ?,
            updated_at = ?
        WHERE thread_id = ?
      `);

      stmt.run(
        embedding.label_embedding,
        embedding.summary_embedding,
        embedding.combined_embedding,
        embedding.embedding_model,
        embedding.embedding_dimensions,
        now,
        embedding.thread_id
      );
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO conversation_embeddings (
          thread_id, user_id, label_embedding, summary_embedding,
          combined_embedding, embedding_model, embedding_dimensions,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        embedding.thread_id,
        embedding.user_id,
        embedding.label_embedding,
        embedding.summary_embedding,
        embedding.combined_embedding,
        embedding.embedding_model,
        embedding.embedding_dimensions,
        now,
        now
      );
    }
  }

  /**
   * Get embedding for conversation
   */
  getEmbedding(threadId: string): ConversationEmbedding | null {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_embeddings WHERE thread_id = ?
    `);

    return stmt.get(threadId) as ConversationEmbedding | null;
  }

  /**
   * Log recall event
   */
  logRecallEvent(event: Omit<RecallEvent, 'timestamp'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO recall_events (
        id, user_id, current_thread_id, recalled_thread_id, trigger_type,
        trigger_query, strategy_used, tokens_injected, relevance_score,
        success, error, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.user_id,
      event.current_thread_id,
      event.recalled_thread_id,
      event.trigger_type,
      event.trigger_query,
      event.strategy_used,
      event.tokens_injected,
      event.relevance_score,
      event.success ? 1 : 0,
      event.error,
      event.latency_ms
    );
  }

  /**
   * Enqueue a background job
   */
  enqueueJob(job: Omit<RecallJob, 'created_at' | 'started_at' | 'completed_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO recall_jobs (
        id, job_type, thread_id, user_id, priority, status,
        retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      job.id,
      job.job_type,
      job.thread_id,
      job.user_id,
      job.priority,
      job.status,
      job.retry_count,
      job.max_retries
    );
  }

  /**
   * Get next pending job
   */
  getNextJob(): RecallJob | null {
    const stmt = this.db.prepare(`
      SELECT * FROM recall_jobs
      WHERE status = 'pending'
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);

    return stmt.get() as RecallJob | null;
  }

  /**
   * Update job status
   */
  updateJobStatus(
    jobId: string,
    status: RecallJob['status'],
    error?: string,
    result?: string
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['status = ?'];
    const values: any[] = [status];

    if (status === 'processing') {
      updates.push('started_at = ?');
      values.push(now);
    }

    if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = ?');
      values.push(now);
    }

    if (error !== undefined) {
      updates.push('error = ?');
      values.push(error);
    }

    if (result !== undefined) {
      updates.push('result = ?');
      values.push(result);
    }

    values.push(jobId);

    const stmt = this.db.prepare(`
      UPDATE recall_jobs
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Get conversation stats for user
   */
  getConversationStats(userId: string): {
    total: number;
    total_messages: number;
    total_tokens: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(message_count) as total_messages,
        SUM(total_tokens) as total_tokens
      FROM conversation_packages
      WHERE user_id = ? AND deleted_at IS NULL
    `);

    return stmt.get(userId) as any;
  }
}
