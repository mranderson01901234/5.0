/**
 * Database models and SQL helpers
 */

import type { DatabaseConnection } from './db.js';
import type { Memory, MemoryAudit, PatchMemory, ListMemoriesQuery } from '@llm-gateway/shared';
import { randomBytes } from 'crypto';
import { FTSSync } from './ftsSync.js';
import { generateEmbedding } from './embedding-service.js';
import { findSimilarMemories } from './vector-search.js';
import { filterStopWords } from './stopwords.js';

/**
 * Generate unique ID
 */
function generateId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Extract keywords from content (removes stop words, keeps meaningful terms)
 */
function extractKeywords(content: string): Set<string> {
  const words = content.toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  // Filter stop words (statements, not questions, preserve phrases)
  const keywords = filterStopWords(words, {
    isQuestion: false,
    preservePhrases: true,
    preserveImportantPrepositions: true,
  });
  
  return new Set(keywords);
}

/**
 * Calculate Jaccard similarity (intersection over union) between two keyword sets
 */
function calculateKeywordOverlap(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate content similarity using multiple heuristics
 * Returns similarity score 0-1 (1 = identical, 0 = completely different)
 */
function calculateContentSimilarity(content1: string, content2: string): number {
  const lower1 = content1.toLowerCase().trim();
  const lower2 = content2.toLowerCase().trim();
  
  // Exact match (after normalization)
  if (lower1 === lower2) return 1.0;
  
  // One contains the other (substring match)
  if (lower1.length > 10 && lower2.length > 10) {
    if (lower1.includes(lower2) || lower2.includes(lower1)) {
      return 0.9;
    }
  }
  
  // Keyword overlap
  const keywords1 = extractKeywords(content1);
  const keywords2 = extractKeywords(content2);
  const keywordOverlap = calculateKeywordOverlap(keywords1, keywords2);
  
  // Length similarity (penalize very different lengths)
  const lengthRatio = Math.min(lower1.length, lower2.length) / Math.max(lower1.length, lower2.length);
  
  // Weighted combination: 70% keyword overlap, 30% length similarity
  const similarity = 0.7 * keywordOverlap + 0.3 * lengthRatio;
  
  return similarity;
}

/**
 * Detect if content matches common patterns that indicate same topic
 * e.g., "my favorite color is X" and "my favorite color is Y" are duplicates
 */
function detectTopic(content: string): string | null {
  const lower = content.toLowerCase().trim();
  
  // Pattern: "my [attribute] is [value]"
  const attributeMatch = lower.match(/my\s+(favorite\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+(.+)/);
  if (attributeMatch) {
    return attributeMatch[2].trim(); // e.g., "favorite color", "name", "job"
  }
  
  // Pattern: "I prefer/like/want X"
  const preferenceMatch = lower.match(/I\s+(prefer|like|want|need|always|never)\s+(.+)/);
  if (preferenceMatch) {
    const verb = preferenceMatch[1];
    const object = preferenceMatch[2].split(/\s+(over|instead of|rather than)/)[0].trim();
    return `${verb} ${object.substring(0, 50)}`;
  }
  
  // Pattern: "my X" or "I am X"
  const simpleMatch = lower.match(/^(my|I am|I'm)\s+(.+?)(?:\s+[-–—]|\s+for\s+me|$)/);
  if (simpleMatch && simpleMatch[2].length < 100) {
    return simpleMatch[2].trim().substring(0, 50);
  }
  
  return null;
}

/**
 * Memory CRUD operations
 */
export class MemoryModel {
  private ftsSync: FTSSync;

  constructor(private db: DatabaseConnection) {
    this.ftsSync = new FTSSync(db);
  }

  /**
   * Create a new memory
   */
  create(data: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>): Memory {
    const now = Date.now();
    const memory: Memory = {
      id: generateId(),
      ...data,
      tier: data.tier || 'TIER3',
      sourceThreadId: data.sourceThreadId || data.threadId,
      repeats: data.repeats || 1,
      threadSet: data.threadSet || JSON.stringify([data.threadId]),
      lastSeenTs: data.lastSeenTs || now,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO memories (
        id, userId, threadId, content, entities, priority, confidence, redactionMap,
        tier, sourceThreadId, repeats, threadSet, lastSeenTs,
        createdAt, updatedAt, deletedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      // Convert all values with explicit types for SQLite
      // IMPORTANT: Order must match INSERT statement exactly
      const id = String(memory.id);
      const userId = String(memory.userId);
      const threadId = String(memory.threadId);
      const content = String(memory.content);
      const entities = memory.entities ? String(memory.entities) : null;
      const priority = Number(memory.priority);
      const confidence = Number(memory.confidence);
      const redactionMap = memory.redactionMap ? String(memory.redactionMap) : null;
      const tier = String(memory.tier);
      const sourceThreadId = memory.sourceThreadId ? String(memory.sourceThreadId) : null;
      const repeats = Math.floor(Number(memory.repeats) || 1);
      const threadSet = memory.threadSet ? String(memory.threadSet) : null;
      const lastSeenTs = memory.lastSeenTs && !isNaN(Number(memory.lastSeenTs)) ? Math.floor(Number(memory.lastSeenTs)) : null;
      const createdAt = Math.floor(Number(memory.createdAt));
      const updatedAt = Math.floor(Number(memory.updatedAt));
      const deletedAt = memory.deletedAt && !isNaN(Number(memory.deletedAt)) ? Math.floor(Number(memory.deletedAt)) : null;
      
      // Validate no NaN values
      if (isNaN(createdAt) || isNaN(updatedAt) || isNaN(repeats)) {
        throw new Error(`Invalid numeric values: createdAt=${createdAt}, updatedAt=${updatedAt}, repeats=${repeats}`);
      }
      
      // Log values for debugging
      const logger = (this.db as any).logger || console;
      logger.debug({
        values: {
          id, userId, threadId, contentLength: content.length,
          priority, confidence, tier, repeats,
          lastSeenTs, createdAt, updatedAt,
          threadSetType: typeof threadSet, threadSetValue: threadSet?.substring(0, 50),
        }
      }, 'About to insert memory');
      
      stmt.run(
        id, userId, threadId, content, entities,
        priority, confidence, redactionMap,
        tier, sourceThreadId, repeats, threadSet, lastSeenTs,
        createdAt, updatedAt, deletedAt
      );

      // Sync to FTS index after successful insertion
      this.ftsSync.syncMemory(id, content, userId, threadId);
    } catch (error: any) {
      const logger = (this.db as any).logger || console;
      logger.error({
        error: error.message,
        code: error.code,
        memory: {
          id: memory.id,
          userId: memory.userId,
          threadId: memory.threadId,
          contentLength: memory.content.length,
          priority: memory.priority,
          tier: memory.tier,
          repeats: memory.repeats,
          lastSeenTs: memory.lastSeenTs,
          createdAt: memory.createdAt,
          updatedAt: memory.updatedAt,
        },
        valueTypes: {
          repeats: typeof memory.repeats,
          lastSeenTs: typeof memory.lastSeenTs,
          createdAt: typeof memory.createdAt,
          updatedAt: typeof memory.updatedAt,
        }
      }, 'SQL insert failed');
      throw error;
    }

    return memory;
  }

  /**
   * List memories with filters
   */
  list(query: ListMemoriesQuery): { memories: Memory[]; total: number } {
    let sql = 'SELECT * FROM memories WHERE userId = ?';
    const params: unknown[] = [query.userId];

    if (query.threadId) {
      sql += ' AND threadId = ?';
      params.push(query.threadId);
    }

    if (!query.includeDeleted) {
      sql += ' AND deletedAt IS NULL';
    }

    if (query.minPriority !== undefined) {
      sql += ' AND priority >= ?';
      params.push(query.minPriority);
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = this.db.prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results
    sql += ' ORDER BY priority DESC, createdAt DESC LIMIT ? OFFSET ?';
    params.push(query.limit, query.offset);

    const memories = this.db.prepare(sql).all(...params) as Memory[];

    return { memories, total };
  }

  /**
   * Get memory by ID
   */
  getById(id: string): Memory | undefined {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    return stmt.get(id) as Memory | undefined;
  }

  /**
   * Update memory
   */
  patch(id: string, data: PatchMemory): Memory | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const updates: string[] = [];
    const params: unknown[] = [];
    let contentUpdated = false;
    let newContent = existing.content;

    if (data.content !== undefined) {
      updates.push('content = ?');
      params.push(data.content);
      contentUpdated = true;
      newContent = data.content;
    }

    if (data.priority !== undefined) {
      updates.push('priority = ?');
      params.push(data.priority);
    }

    if (data.deleted !== undefined) {
      updates.push('deletedAt = ?');
      params.push(data.deleted ? Date.now() : null);
    }

    if (updates.length === 0) return existing;

    updates.push('updatedAt = ?');
    params.push(Date.now());
    params.push(id);

    const sql = `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...params);

    // Sync FTS changes
    if (data.deleted) {
      // Remove from FTS index if deleted
      this.ftsSync.removeMemory(id);
    } else if (contentUpdated) {
      // Update FTS index if content changed
      this.ftsSync.syncMemory(id, newContent, existing.userId, existing.threadId);
    }

    return this.getById(id);
  }

  /**
   * Delete memory (soft delete)
   */
  delete(id: string): boolean {
    const result = this.db.prepare('UPDATE memories SET deletedAt = ? WHERE id = ?').run(Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Get memory count by user
   */
  getCountByUser(userId: string): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE userId = ? AND deletedAt IS NULL').get(userId) as { count: number };
    return result.count;
  }

  /**
   * Get average priority
   */
  getAvgPriority(): number {
    const result = this.db.prepare('SELECT AVG(priority) as avg FROM memories WHERE deletedAt IS NULL').get() as { avg: number | null };
    return result.avg || 0;
  }

  /**
   * Get memories saved in last hour
   */
  getSavedLastHour(): number {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const result = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE createdAt >= ? AND deletedAt IS NULL').get(hourAgo) as { count: number };
    return result.count;
  }

  /**
   * Get deleted count
   */
  getDeletedCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE deletedAt IS NOT NULL').get() as { count: number };
    return result.count;
  }

  /**
   * Update cross-thread tracking (increment repeats, update threadSet, lastSeenTs)
   */
  updateCrossThread(id: string, newThreadId: string): void {
    const memory = this.getById(id);
    if (!memory) return;

    // Parse existing threadSet
    let threadSet: string[] = [];
    try {
      threadSet = memory.threadSet ? JSON.parse(memory.threadSet) : [];
    } catch {
      threadSet = [];
    }

    // Add new thread if not already present
    if (!threadSet.includes(newThreadId)) {
      threadSet.push(newThreadId);
    }

    const now = Date.now();

    this.db.prepare(`
      UPDATE memories
      SET repeats = repeats + 1,
          threadSet = ?,
          lastSeenTs = ?,
          updatedAt = ?
      WHERE id = ?
    `).run(JSON.stringify(threadSet), now, now, id);
  }

  /**
   * Get memories by tier
   */
  getByTier(userId: string, tier: string, limit: number = 10): Memory[] {
    return this.db.prepare(`
      SELECT * FROM memories
      WHERE userId = ?
        AND tier = ?
        AND deletedAt IS NULL
      ORDER BY priority DESC, updatedAt DESC
      LIMIT ?
    `).all(userId, tier, limit) as Memory[];
  }

  /**
   * Find similar existing memory (for duplicate detection)
   * Uses semantic embeddings first, then falls back to topic/keyword similarity
   * Returns existing memory if similarity >= threshold, null otherwise
   */
  async findSimilarMemory(
    userId: string,
    content: string,
    similarityThreshold: number = 0.75
  ): Promise<Memory | null> {
    // First check: semantic similarity (most accurate) if embeddings available
    if (process.env.OPENAI_API_KEY) {
      try {
        const contentEmbedding = await generateEmbedding(content);
        if (contentEmbedding) {
          // Use higher threshold for duplicates (0.85 vs 0.7 for search)
          const semanticMatches = findSimilarMemories(
            this.db,
            userId,
            contentEmbedding,
            5,
            0.85 // Higher threshold for duplicate detection
          );

          if (semanticMatches.length > 0 && semanticMatches[0].similarity >= similarityThreshold) {
            return semanticMatches[0].memory;
          }
        }
      } catch (error: any) {
        // Fall through to topic/keyword detection if semantic fails
      }
    }

    // Second check: topic-based duplicates (fast path for common patterns)
    const newTopic = detectTopic(content);
    if (newTopic) {
      const candidates = this.db.prepare(`
        SELECT * FROM memories
        WHERE userId = ? AND deletedAt IS NULL
        ORDER BY updatedAt DESC
        LIMIT 50
      `).all(userId) as Memory[];

      for (const candidate of candidates) {
        const candidateTopic = detectTopic(candidate.content);
        if (candidateTopic && candidateTopic.toLowerCase() === newTopic.toLowerCase()) {
          // Same topic detected - check if values are different (update) or same (exact duplicate)
          const similarity = calculateContentSimilarity(content, candidate.content);
          if (similarity >= similarityThreshold) {
            return candidate;
          }
        }
      }
    }

    // Final fallback: keyword-based similarity check
    const candidates = this.db.prepare(`
      SELECT * FROM memories
      WHERE userId = ? AND deletedAt IS NULL
      ORDER BY updatedAt DESC
      LIMIT 50
    `).all(userId) as Memory[];

    for (const candidate of candidates) {
      const similarity = calculateContentSimilarity(content, candidate.content);
      if (similarity >= similarityThreshold) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Supercede (update) existing memory with new content
   * Updates the existing memory instead of creating a new one
   * Updates: content, updatedAt, lastSeenTs, repeats, threadSet
   */
  supercedeMemory(existingId: string, newContent: string, newThreadId: string, newPriority?: number, newTier?: string): Memory | null {
    const existing = this.getById(existingId);
    if (!existing) return null;

    // Parse existing threadSet
    let threadSet: string[] = [];
    try {
      threadSet = existing.threadSet ? JSON.parse(existing.threadSet) : [];
    } catch {
      threadSet = [];
    }

    // Add new thread if not already present
    if (!threadSet.includes(newThreadId)) {
      threadSet.push(newThreadId);
    }

    const now = Date.now();

    // Update memory with new content and metadata
    const updates: string[] = ['content = ?', 'updatedAt = ?', 'lastSeenTs = ?', 'threadSet = ?', 'repeats = repeats + 1'];
    const params: unknown[] = [newContent, now, now, JSON.stringify(threadSet)];

    if (newPriority !== undefined) {
      updates.push('priority = ?');
      params.push(newPriority);
    }

    if (newTier !== undefined) {
      updates.push('tier = ?');
      params.push(newTier);
    }

    params.push(existingId);

    this.db.prepare(`
      UPDATE memories
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);

    // Sync FTS changes
    this.ftsSync.syncMemory(existingId, newContent, existing.userId, newThreadId);

    const updated = this.getById(existingId);
    return updated || null;
  }
}

/**
 * MemoryAudit operations
 */
export class AuditModel {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create audit record
   */
  create(data: Omit<MemoryAudit, 'id' | 'createdAt'>): MemoryAudit {
    const audit: MemoryAudit = {
      id: generateId(),
      ...data,
      createdAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO memory_audits (id, userId, threadId, startMsgId, endMsgId, tokenCount, score, saved, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      audit.id,
      audit.userId,
      audit.threadId,
      audit.startMsgId || null,
      audit.endMsgId || null,
      audit.tokenCount,
      audit.score,
      audit.saved,
      audit.createdAt
    );

    return audit;
  }

  /**
   * Get total audit count
   */
  getTotalCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM memory_audits').get() as { count: number };
    return result.count;
  }

  /**
   * Get average score
   */
  getAvgScore(): number {
    const result = this.db.prepare('SELECT AVG(score) as avg FROM memory_audits').get() as { avg: number | null };
    return result.avg || 0;
  }

  /**
   * Get saves per audit
   */
  getSavesPerAudit(): number {
    const result = this.db.prepare('SELECT AVG(saved) as avg FROM memory_audits').get() as { avg: number | null };
    return result.avg || 0;
  }

  /**
   * Get last audit time
   */
  getLastAuditTime(): number | null {
    const result = this.db.prepare('SELECT MAX(createdAt) as lastAudit FROM memory_audits').get() as { lastAudit: number | null };
    return result.lastAudit;
  }
}

/**
 * UserProfile operations
 */
export class UserProfileModel {
  constructor(public db: DatabaseConnection) {}

  /**
   * Save or update user profile
   */
  save(userId: string, profile: any): void {
    const now = Date.now();
    const profileJson = JSON.stringify(profile);
    
    this.db.prepare(`
      INSERT INTO user_profiles (userId, profile_json, lastUpdated, deletedAt)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(userId) DO UPDATE SET
        profile_json = ?,
        lastUpdated = ?
    `).run(userId, profileJson, now, profileJson, now);
  }

  /**
   * Get user profile
   */
  get(userId: string): any | null {
    const result = this.db.prepare(`
      SELECT profile_json FROM user_profiles
      WHERE userId = ? AND deletedAt IS NULL
    `).get(userId) as { profile_json: string } | undefined;
    
    if (!result) {
      return null;
    }
    
    try {
      return JSON.parse(result.profile_json);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all active profiles
   */
  getAll(): any[] {
    const results = this.db.prepare(`
      SELECT profile_json FROM user_profiles
      WHERE deletedAt IS NULL
      ORDER BY lastUpdated DESC
    `).all() as Array<{ profile_json: string }>;
    
    return results.map(r => {
      try {
        return JSON.parse(r.profile_json);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
}
