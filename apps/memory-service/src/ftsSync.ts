/**
 * FTS5 Synchronization Helper
 *
 * Handles synchronization between memories table and memories_fts virtual table.
 * Uses manual sync instead of triggers to avoid datatype mismatch issues with TEXT IDs.
 *
 * FTS5 with content_rowid=id expects TEXT primary keys, which causes issues
 * with traditional rowid-based triggers. This module provides explicit sync methods.
 */

import type { DatabaseConnection } from './db.js';

export class FTSSync {
  constructor(private db: DatabaseConnection) {}

  /**
   * Insert or update a memory in FTS index
   * Called after memory creation or content update
   */
  syncMemory(id: string, content: string, userId: string, threadId: string): void {
    try {
      // First, check if this memory already exists in FTS
      const existing = this.db
        .prepare('SELECT memory_id FROM memory_embeddings WHERE memory_id = ?')
        .get(id);

      if (existing) {
        // Update existing FTS entry
        this.db
          .prepare(`
            UPDATE memories_fts
            SET content = ?, userId = ?, threadId = ?
            WHERE id = ?
          `)
          .run(content, userId, threadId, id);
      } else {
        // Insert new FTS entry
        this.db
          .prepare(`
            INSERT OR IGNORE INTO memories_fts(id, content, userId, threadId)
            VALUES (?, ?, ?, ?)
          `)
          .run(id, content, userId, threadId);
      }
    } catch (error: any) {
      // Log but don't throw - FTS sync failures shouldn't block memory operations
      const logger = (this.db as any).logger || console;
      if (!error.message?.includes('no such table')) {
        logger.warn({
          error: error.message,
          memoryId: id
        }, 'Failed to sync memory to FTS index');
      }
    }
  }

  /**
   * Remove a memory from FTS index
   * Called on soft delete (memory.deletedAt set)
   */
  removeMemory(id: string): void {
    try {
      this.db
        .prepare('DELETE FROM memories_fts WHERE id = ?')
        .run(id);
    } catch (error: any) {
      const logger = (this.db as any).logger || console;
      if (!error.message?.includes('no such table')) {
        logger.warn({
          error: error.message,
          memoryId: id
        }, 'Failed to remove memory from FTS index');
      }
    }
  }

  /**
   * Rebuild FTS index from memories table
   * Use for maintenance or recovery
   */
  rebuildIndex(): { synced: number; errors: number } {
    let synced = 0;
    let errors = 0;

    try {
      const logger = (this.db as any).logger || console;

      // Clear existing FTS entries
      this.db.prepare('DELETE FROM memories_fts').run();

      // Get all non-deleted memories
      const memories = this.db
        .prepare(`
          SELECT id, content, userId, threadId
          FROM memories
          WHERE deletedAt IS NULL
        `)
        .all() as Array<{
          id: string;
          content: string;
          userId: string;
          threadId: string;
        }>;

      // Rebuild FTS index
      const insertStmt = this.db.prepare(`
        INSERT INTO memories_fts(id, content, userId, threadId)
        VALUES (?, ?, ?, ?)
      `);

      const txn = this.db.transaction(() => {
        for (const memory of memories) {
          try {
            insertStmt.run(memory.id, memory.content, memory.userId, memory.threadId);
            synced++;
          } catch (err) {
            errors++;
            logger.error({
              error: err,
              memoryId: memory.id
            }, 'Failed to rebuild FTS entry for memory');
          }
        }
      });

      txn();
      logger.info({ synced, errors }, 'FTS index rebuild completed');
    } catch (error: any) {
      const logger = (this.db as any).logger || console;
      logger.error({ error }, 'FTS rebuild failed');
    }

    return { synced, errors };
  }

  /**
   * Search memories using FTS
   * Returns memory IDs matching the search query
   */
  search(
    query: string,
    userId: string,
    limit: number = 10
  ): Array<{ id: string; rank: number }> {
    try {
      const results = this.db
        .prepare(`
          SELECT id, rank
          FROM memories_fts
          WHERE content MATCH ? AND userId = ?
          ORDER BY rank DESC
          LIMIT ?
        `)
        .all(query, userId, limit) as Array<{ id: string; rank: number }>;

      return results;
    } catch (error: any) {
      const logger = (this.db as any).logger || console;
      if (!error.message?.includes('no such table')) {
        logger.warn({
          error: error.message,
          query
        }, 'FTS search failed');
      }
      return [];
    }
  }

  /**
   * Check FTS index health
   * Returns statistics about the FTS index
   */
  getIndexHealth(): {
    ftsCount: number;
    memoriesCount: number;
    outOfSync: number;
    isHealthy: boolean;
  } {
    try {
      const ftsCount = (
        this.db.prepare('SELECT COUNT(*) as count FROM memories_fts').get() as {
          count: number;
        }
      ).count;

      const memoriesCount = (
        this.db
          .prepare('SELECT COUNT(*) as count FROM memories WHERE deletedAt IS NULL')
          .get() as { count: number }
      ).count;

      const outOfSync = Math.abs(ftsCount - memoriesCount);
      const isHealthy = outOfSync === 0;

      return {
        ftsCount,
        memoriesCount,
        outOfSync,
        isHealthy,
      };
    } catch (error) {
      return {
        ftsCount: 0,
        memoriesCount: 0,
        outOfSync: -1,
        isHealthy: false,
      };
    }
  }
}
