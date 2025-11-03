/**
 * Vector similarity search for semantic memory retrieval
 * Implements cosine similarity search using embeddings stored in SQLite
 */

import type { DatabaseConnection } from './db.js';
import type { Memory } from '@llm-gateway/shared';
import { pino } from 'pino';

const logger = pino({ name: 'vector-search' });

const DEFAULT_SIMILARITY_THRESHOLD = parseFloat(process.env.SEMANTIC_SEARCH_THRESHOLD || '0.7');
const MAX_SEARCH_RESULTS = 100; // Limit for performance

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    logger.warn({ len1: vec1.length, len2: vec2.length }, 'Vector dimension mismatch');
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Find similar memories using vector similarity search
 * Returns memories sorted by similarity score (descending)
 */
export function findSimilarMemories(
  db: DatabaseConnection,
  userId: string,
  queryEmbedding: number[],
  limit: number = 10,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Array<{ memory: Memory; similarity: number }> {
  try {
    // Get all memories with embeddings for this user
    const memories = db.prepare(`
      SELECT id, userId, threadId, content, entities, priority, confidence,
             redactionMap, tier, sourceThreadId, repeats, threadSet,
             lastSeenTs, createdAt, updatedAt, deletedAt, embedding
      FROM memories
      WHERE userId = ? 
        AND deletedAt IS NULL 
        AND embedding IS NOT NULL
        AND LENGTH(embedding) > 0
      LIMIT ?
    `).all(userId, MAX_SEARCH_RESULTS) as Array<Memory & { embedding: Buffer }>;

    if (memories.length === 0) {
      return [];
    }

    // Calculate similarities
    const results: Array<{ memory: Memory; similarity: number }> = [];

    for (const mem of memories) {
      try {
        const memoryEmbedding = JSON.parse(mem.embedding.toString()) as number[];
        const similarity = cosineSimilarity(queryEmbedding, memoryEmbedding);

        if (similarity >= threshold) {
          // Remove embedding from memory object before returning
          const { embedding, ...memoryWithoutEmbedding } = mem;
          results.push({
            memory: memoryWithoutEmbedding as Memory,
            similarity,
          });
        }
      } catch (e) {
        logger.warn({ memoryId: mem.id, error: (e as Error).message }, 'Failed to parse memory embedding');
      }
    }

    // Sort by similarity (descending) and limit
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);

  } catch (error: any) {
    logger.error({ error: error.message, userId }, 'Vector similarity search failed');
    return [];
  }
}

/**
 * Hybrid search: combine semantic and keyword search results
 * Returns weighted, deduplicated results
 */
export async function hybridSearch(
  db: DatabaseConnection,
  userId: string,
  query: string,
  queryEmbedding: number[] | null,
  options: {
    maxItems?: number;
    semanticWeight?: number;
    keywordWeight?: number;
    deadlineMs?: number;
    threadId?: string;
  } = {}
): Promise<Memory[]> {
  const {
    maxItems = 5,
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    deadlineMs = 200,
    threadId,
  } = options;

  const startTime = Date.now();
  const results = new Map<string, { memory: Memory; semanticScore: number; keywordScore: number; combinedScore: number }>();

  // Semantic search (if embedding available)
  if (queryEmbedding) {
    try {
      const semanticResults = findSimilarMemories(db, userId, queryEmbedding, maxItems * 2, 0.5); // Lower threshold for more candidates

      for (const { memory, similarity } of semanticResults) {
        const existing = results.get(memory.id);
        if (!existing || existing.semanticScore < similarity) {
          results.set(memory.id, {
            memory,
            semanticScore: similarity,
            keywordScore: existing?.keywordScore || 0,
            combinedScore: 0, // Will calculate after keyword search
          });
        }
      }

      logger.debug({ count: semanticResults.length }, 'Semantic search completed');
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Semantic search failed, continuing with keyword only');
    }
  }

  // Keyword search (existing implementation)
  if (query && query.trim()) {
    try {
      const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'what', 'when', 'where', 'why', 'how', 'who', 'which', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
      const words = query.toLowerCase().match(/\b\w{2,}\b/g) || [];
      const queryKeywords = words.filter(w => !commonWords.has(w));

      if (queryKeywords.length > 0) {
        // Build keyword relevance query
        const keywordConditions = queryKeywords.map(() => `(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`);
        const relevanceScore = keywordConditions.join(' + ');
        
        let sqlQuery = `
          SELECT *, (${relevanceScore}) as relevance_score
          FROM memories
          WHERE userId = ? AND deletedAt IS NULL
        `;

        const params: any[] = [];
        
        // Add LIKE params for relevance calculation
        queryKeywords.forEach(keyword => params.push(`%${keyword}%`));
        params.push(userId);

        // Add threadId filter if provided
        if (threadId) {
          sqlQuery += ' AND threadId = ?';
          params.push(threadId);
        }

        sqlQuery += ` ORDER BY relevance_score DESC, updatedAt DESC LIMIT ?`;
        params.push(maxItems * 2);

        const keywordMemories = db.prepare(sqlQuery).all(...params) as Array<Memory & { relevance_score: number }>;

        // Normalize keyword scores (0-1)
        const maxKeywordScore = keywordMemories.length > 0 ? Math.max(...keywordMemories.map(m => m.relevance_score || 0)) : 1;
        
        for (const mem of keywordMemories) {
          const normalizedKeywordScore = maxKeywordScore > 0 ? (mem.relevance_score || 0) / maxKeywordScore : 0;
          
          const existing = results.get(mem.id);
          if (!existing) {
            results.set(mem.id, {
              memory: mem as Memory,
              semanticScore: 0,
              keywordScore: normalizedKeywordScore,
              combinedScore: 0,
            });
          } else {
            existing.keywordScore = normalizedKeywordScore;
          }
        }

        logger.debug({ count: keywordMemories.length }, 'Keyword search completed');
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Keyword search failed');
    }
  }

  // Calculate combined scores
  for (const entry of results.values()) {
    entry.combinedScore = 
      (entry.semanticScore * semanticWeight) + 
      (entry.keywordScore * keywordWeight);
  }

  // Sort by combined score and apply tier/recency prioritization
  const sortedResults = Array.from(results.values())
    .sort((a, b) => {
      // Primary: combined score
      if (Math.abs(a.combinedScore - b.combinedScore) > 0.01) {
        return b.combinedScore - a.combinedScore;
      }

      // Secondary: recency boost (last 24h)
      const recencyBoostA = a.memory.updatedAt > (Date.now() - 86400000) ? 1 : 0;
      const recencyBoostB = b.memory.updatedAt > (Date.now() - 86400000) ? 1 : 0;
      if (recencyBoostA !== recencyBoostB) {
        return recencyBoostB - recencyBoostA;
      }

      // Tertiary: timestamp
      if (a.memory.updatedAt !== b.memory.updatedAt) {
        return b.memory.updatedAt - a.memory.updatedAt;
      }

      // Quaternary: tier
      const tierOrder: Record<string, number> = { TIER1: 1, TIER2: 2, TIER3: 3 };
      const tierA = tierOrder[a.memory.tier || 'TIER3'] || 4;
      const tierB = tierOrder[b.memory.tier || 'TIER3'] || 4;
      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Quinary: priority
      return b.memory.priority - a.memory.priority;
    })
    .slice(0, maxItems)
    .map(entry => entry.memory);

  const elapsedMs = Date.now() - startTime;
  logger.debug({ 
    userId, 
    queryLength: query?.length || 0,
    resultCount: sortedResults.length,
    elapsedMs,
    hasSemantic: !!queryEmbedding 
  }, 'Hybrid search completed');

  return sortedResults;
}

/**
 * Keyword-only search (fallback when embeddings unavailable)
 */
export function keywordOnlySearch(
  db: DatabaseConnection,
  userId: string,
  query: string,
  maxItems: number = 5,
  threadId?: string
): Memory[] {
  if (!query || !query.trim()) {
    // No query - return recent memories
    let sqlQuery = `
      SELECT * FROM memories
      WHERE userId = ? AND deletedAt IS NULL
    `;
    const params: any[] = [userId];

    if (threadId) {
      sqlQuery += ' AND threadId = ?';
      params.push(threadId);
    }

    sqlQuery += ` ORDER BY updatedAt DESC LIMIT ?`;
    params.push(maxItems);

    return db.prepare(sqlQuery).all(...params) as Memory[];
  }

  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'what', 'when', 'where', 'why', 'how', 'who', 'which', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them']);
  const words = query.toLowerCase().match(/\b\w{2,}\b/g) || [];
  const queryKeywords = words.filter(w => !commonWords.has(w));

  if (queryKeywords.length === 0) {
    // No keywords - return recent memories
    let sqlQuery = `
      SELECT * FROM memories
      WHERE userId = ? AND deletedAt IS NULL
    `;
    const params: any[] = [userId];

    if (threadId) {
      sqlQuery += ' AND threadId = ?';
      params.push(threadId);
    }

    sqlQuery += ` ORDER BY updatedAt DESC LIMIT ?`;
    params.push(maxItems);

    return db.prepare(sqlQuery).all(...params) as Memory[];
  }

  // Build keyword relevance query
  const keywordConditions = queryKeywords.map(() => `(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`);
  const relevanceScore = keywordConditions.join(' + ');
  
  let sqlQuery = `
    SELECT *, (${relevanceScore}) as relevance_score
    FROM memories
    WHERE userId = ? AND deletedAt IS NULL
  `;

  const params: any[] = [];
  
  // Add LIKE params for relevance calculation
  queryKeywords.forEach(keyword => params.push(`%${keyword}%`));
  params.push(userId);

  if (threadId) {
    sqlQuery += ' AND threadId = ?';
    params.push(threadId);
  }

  const recencyBoost = `CASE WHEN (updatedAt > (strftime('%s', 'now') * 1000 - 86400000)) THEN 0 ELSE 1 END`;
  
  sqlQuery += ` ORDER BY ${threadId ? 'CASE WHEN threadId = ? THEN 0 ELSE 1 END, ' : ''}${recencyBoost}, updatedAt DESC, relevance_score DESC, 
    CASE tier
      WHEN 'TIER1' THEN 1
      WHEN 'TIER2' THEN 2
      WHEN 'TIER3' THEN 3
      ELSE 4
    END, priority DESC LIMIT ?`;

  if (threadId) {
    params.push(threadId);
  }
  params.push(maxItems);

  return db.prepare(sqlQuery).all(...params) as Memory[];
}

