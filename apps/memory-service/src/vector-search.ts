/**
 * Vector similarity search for semantic memory retrieval
 * Implements cosine similarity search using embeddings stored in SQLite
 */

import type { DatabaseConnection } from './db.js';
import type { Memory } from '@llm-gateway/shared';
import { pino } from 'pino';
import { preprocessQuery, getSearchTerms } from './query-preprocessor.js';
import { filterStopWords } from './stopwords.js';
import { FTSSync } from './ftsSync.js';
import { calculateRelevanceScore, sortByRelevance } from './relevance-scorer.js';
import type { ExpansionMode } from './synonyms.js';
import { getSemanticThreshold, getHybridWeights, shouldFilterMemory } from './synonyms.js';

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
    expansionMode?: ExpansionMode;
  } = {}
): Promise<Memory[]> {
  const {
    maxItems = 5,
    semanticWeight: providedSemanticWeight,
    keywordWeight: providedKeywordWeight,
    deadlineMs = 200,
    threadId,
    expansionMode = 'normal',
  } = options;

  // Get weights based on expansion mode (override if explicitly provided)
  const weights = getHybridWeights(expansionMode);
  const semanticWeight = providedSemanticWeight !== undefined ? providedSemanticWeight : weights.semanticWeight;
  const keywordWeight = providedKeywordWeight !== undefined ? providedKeywordWeight : weights.keywordWeight;

  const startTime = Date.now();
  const results = new Map<string, { memory: Memory; semanticScore: number; keywordScore: number; combinedScore: number }>();

  // Semantic search (if embedding available)
  if (queryEmbedding) {
    try {
      // Get semantic threshold based on expansion mode
      const semanticThreshold = getSemanticThreshold(expansionMode);
      const semanticResults = findSimilarMemories(db, userId, queryEmbedding, maxItems * 2, semanticThreshold);

      for (const { memory, similarity } of semanticResults) {
        // In strict mode, filter out memories without keyword matches
        // This prevents semantic-only matches from appearing in strict mode
        if (expansionMode === 'strict' && query && query.trim()) {
          const processed = preprocessQuery(query);
          const searchTerms = getSearchTerms(processed, 10);
          if (shouldFilterMemory(memory, searchTerms, expansionMode)) {
            logger.debug({ 
              memoryId: memory.id.substring(0, 8),
              query,
              reason: 'no_keyword_match'
            }, 'Filtering memory in strict mode (no keyword match)');
            continue; // Skip this memory
          }
        }
        
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

      logger.debug({ 
        count: semanticResults.length,
        expansionMode,
        semanticThreshold 
      }, 'Semantic search completed');
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Semantic search failed, continuing with keyword only');
    }
  }

  // Keyword search (with preprocessing and FTS5)
  if (query && query.trim()) {
    try {
      // Preprocess query to normalize and extract phrases/keywords
      const processed = preprocessQuery(query);
      const searchTerms = getSearchTerms(processed, 10); // Limit to top 10 terms
      
      if (searchTerms.length === 0) {
        logger.debug({ originalQuery: query }, 'No searchable terms after preprocessing');
        // Fallback to original query if preprocessing removed everything
        const words = query.toLowerCase().match(/\b\w{2,}\b/g) || [];
        const queryKeywords = filterStopWords(words, {
          isQuestion: false,
          preservePhrases: false,
        });
        
        if (queryKeywords.length > 0) {
          // Use original keyword extraction as fallback
          const keywordConditions = queryKeywords.map(() => `(CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`);
          const relevanceScore = keywordConditions.join(' + ');
          
          let sqlQuery = `
            SELECT *, (${relevanceScore}) as relevance_score
            FROM memories
            WHERE userId = ? AND deletedAt IS NULL
          `;

          const params: any[] = [];
          
          queryKeywords.forEach(keyword => params.push(`%${keyword}%`));
          params.push(userId);

          if (threadId) {
            sqlQuery += ' AND threadId = ?';
            params.push(threadId);
          }

          sqlQuery += ` ORDER BY relevance_score DESC, updatedAt DESC LIMIT ?`;
          params.push(maxItems * 2);

          const keywordMemories = db.prepare(sqlQuery).all(...params) as Array<Memory & { relevance_score: number }>;

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
          
          logger.debug({ count: keywordMemories.length }, 'Keyword search completed (fallback)');
        } else {
          logger.debug('No keywords available after fallback');
        }
      } else {
        // Try FTS5 search first (better phrase matching and relevance)
        const ftsSync = new FTSSync(db);
        const health = ftsSync.getIndexHealth();
        
        let keywordMemories: Array<Memory & { relevance_score?: number }> = [];
        let usedFTS5 = false;
        
        if (health.isHealthy && (processed.phrases.length > 0 || processed.keywords.length > 0)) {
          try {
            // Build FTS5 query
            const ftsQuery = ftsSync.buildFTSQuery(processed.phrases, processed.keywords);
            
            if (ftsQuery.trim()) {
              // Search using FTS5
              const ftsResults = ftsSync.search(ftsQuery, userId, maxItems * 3, threadId);
              
              if (ftsResults.length > 0) {
                usedFTS5 = true;
                
                // Get memory IDs from FTS results
                const memoryIds = ftsResults.map(r => r.id);
                
                // Fetch full memory records
                const placeholders = memoryIds.map(() => '?').join(',');
                let sqlQuery = `
                  SELECT * FROM memories
                  WHERE id IN (${placeholders}) AND deletedAt IS NULL
                `;
                
                const params: any[] = [...memoryIds];
                sqlQuery += ` ORDER BY updatedAt DESC LIMIT ?`;
                params.push(maxItems * 2);
                
                keywordMemories = db.prepare(sqlQuery).all(...params) as Array<Memory & { relevance_score?: number }>;
                
                // Add FTS scores to memories
                const scoreMap = new Map(ftsResults.map(r => [r.id, r.score]));
                keywordMemories.forEach(mem => {
                  mem.relevance_score = scoreMap.get(mem.id) || 0;
                });
                
                // Sort by FTS score (preserve FTS ranking)
                keywordMemories.sort((a, b) => {
                  const scoreA = a.relevance_score || 0;
                  const scoreB = b.relevance_score || 0;
                  return scoreB - scoreA; // Higher score = better
                });
                
                logger.debug({ 
                  count: keywordMemories.length,
                  ftsQuery,
                  phrases: processed.phrases.length,
                  keywords: processed.keywords.length
                }, 'FTS5 search completed');
              }
            }
          } catch (error: any) {
            logger.warn({ 
              error: error.message,
              query 
            }, 'FTS5 search failed, falling back to LIKE');
          }
        }
        
        // Fallback to LIKE-based search if FTS5 unavailable or returned no results
        if (!usedFTS5 || keywordMemories.length === 0) {
          logger.debug('Using LIKE-based search (FTS5 fallback)');
          
          // Build keyword relevance query with phrases and keywords
          // Phrases get higher weight (2x) than individual keywords
          const keywordConditions: string[] = [];
          const params: any[] = [];
          
          for (const term of searchTerms) {
            const isPhrase = processed.phrases.includes(term);
            const weight = isPhrase ? 2 : 1; // Phrases are worth 2x
            
            // For phrases, use exact phrase matching
            if (isPhrase) {
              keywordConditions.push(`(CASE WHEN LOWER(content) LIKE ? THEN ${weight} ELSE 0 END)`);
              params.push(`%${term}%`);
            } else {
              // For keywords, use word boundary matching
              keywordConditions.push(`(CASE WHEN LOWER(content) LIKE ? THEN ${weight} ELSE 0 END)`);
              params.push(`%${term}%`);
            }
          }
          
          const relevanceScore = keywordConditions.join(' + ');
          
          let sqlQuery = `
            SELECT *, (${relevanceScore}) as relevance_score
            FROM memories
            WHERE userId = ? AND deletedAt IS NULL
          `;

          params.push(userId);

          // Add threadId filter if provided
          if (threadId) {
            sqlQuery += ' AND threadId = ?';
            params.push(threadId);
          }

          sqlQuery += ` ORDER BY relevance_score DESC, updatedAt DESC LIMIT ?`;
          params.push(maxItems * 2);

          keywordMemories = db.prepare(sqlQuery).all(...params) as Array<Memory & { relevance_score?: number }>;
        }

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

        logger.debug({ 
          count: keywordMemories.length,
          originalQuery: query,
          processedTerms: searchTerms.length,
          phrases: processed.phrases.length,
          keywords: processed.keywords.length,
          usedFTS5
        }, 'Keyword search completed');
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

  // Get processed query for relevance scoring
  const processed = query ? preprocessQuery(query) : null;
  
  // Apply enhanced relevance scoring if query available
  if (processed && query && query.trim()) {
    const baseScores = new Map<string, number>();
    for (const entry of results.values()) {
      baseScores.set(entry.memory.id, entry.combinedScore);
    }
    
    // Apply enhanced relevance scoring
    for (const entry of results.values()) {
      const enhancedScore = calculateRelevanceScore(
        entry.memory,
        processed,
        entry.combinedScore,
        {
          boostPhrases: true,
          boostPosition: true,
          boostTier: true,
          boostPriority: true,
          boostRecency: true,
        }
      );
      entry.combinedScore = enhancedScore;
    }
  }

  // Sort by combined score (now includes enhanced relevance)
  const sortedResults = Array.from(results.values())
    .sort((a, b) => {
      // Primary: combined score (with enhanced relevance)
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
  threadId?: string,
  expansionMode: ExpansionMode = 'normal'
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

  // Preprocess query to normalize and extract phrases/keywords
  const processed = preprocessQuery(query);
  const searchTerms = getSearchTerms(processed, 10); // Limit to top 10 terms

  if (searchTerms.length === 0) {
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

  // Try FTS5 search first (better phrase matching and relevance)
  const ftsSync = new FTSSync(db);
  const health = ftsSync.getIndexHealth();
  
  // Rebuild index if out of sync (but only if significantly out of sync to avoid frequent rebuilds)
  if (!health.isHealthy && health.outOfSync > 5) {
    logger.warn({ outOfSync: health.outOfSync }, 'FTS5 index out of sync, rebuilding...');
    ftsSync.rebuildIndex();
  }
  
  if (health.isHealthy && (processed.phrases.length > 0 || processed.keywords.length > 0)) {
    try {
      // Build FTS5 query
      const ftsQuery = ftsSync.buildFTSQuery(processed.phrases, processed.keywords);
      
      if (ftsQuery.trim()) {
        // Search using FTS5
        const ftsResults = ftsSync.search(ftsQuery, userId, maxItems * 2, threadId);
        
        if (ftsResults.length > 0) {
          // Get memory IDs from FTS results
          const memoryIds = ftsResults.map(r => r.id);
          
          // Fetch full memory records
          const placeholders = memoryIds.map(() => '?').join(',');
          let sqlQuery = `
            SELECT * FROM memories
            WHERE id IN (${placeholders}) AND deletedAt IS NULL
          `;
          
          const params: any[] = [...memoryIds];
          
          // Add recency boost and tier ordering
          const recencyBoost = `CASE WHEN (updatedAt > (strftime('%s', 'now') * 1000 - 86400000)) THEN 0 ELSE 1 END`;
          sqlQuery += ` ORDER BY ${threadId ? 'CASE WHEN threadId = ? THEN 0 ELSE 1 END, ' : ''}${recencyBoost}, updatedAt DESC,
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
          
          const memories = db.prepare(sqlQuery).all(...params) as Memory[];
          
          // Apply enhanced relevance scoring
          const scoreMap = new Map(ftsResults.map(r => [r.id, r.score]));
          const baseScores = new Map<string, number>();
          memories.forEach(mem => {
            baseScores.set(mem.id, scoreMap.get(mem.id) || 0);
          });
          
          // Apply enhanced relevance scoring
          for (const memory of memories) {
            const baseScore = baseScores.get(memory.id) || 0;
            const enhancedScore = calculateRelevanceScore(
              memory,
              processed,
              baseScore,
              {
                boostPhrases: true,
                boostPosition: true,
                boostTier: true,
                boostPriority: true,
                boostRecency: true,
              }
            );
            baseScores.set(memory.id, enhancedScore);
          }
          
          // Sort by enhanced score
          memories.sort((a, b) => {
            const scoreA = baseScores.get(a.id) || 0;
            const scoreB = baseScores.get(b.id) || 0;
            return scoreB - scoreA; // Higher score = better
          });
          
          logger.debug({ 
            count: memories.length,
            ftsQuery,
            phrases: processed.phrases.length,
            keywords: processed.keywords.length
          }, 'FTS5 search completed with enhanced relevance');
          
          return memories.slice(0, maxItems);
        }
      }
    } catch (error: any) {
      logger.warn({ 
        error: error.message,
        query 
      }, 'FTS5 search failed, falling back to LIKE');
    }
  }
  
  // Fallback to LIKE-based search if FTS5 unavailable or fails
  logger.debug('Using LIKE-based search (FTS5 fallback)');
  
  // Build keyword relevance query with phrases and keywords
  // Phrases get higher weight (2x) than individual keywords
  const keywordConditions: string[] = [];
  const params: any[] = [];
  
  for (const term of searchTerms) {
    const isPhrase = processed.phrases.includes(term);
    const weight = isPhrase ? 2 : 1; // Phrases are worth 2x
    
    // For phrases, use exact phrase matching
    if (isPhrase) {
      keywordConditions.push(`(CASE WHEN LOWER(content) LIKE ? THEN ${weight} ELSE 0 END)`);
      params.push(`%${term}%`);
    } else {
      // For keywords, use word boundary matching
      keywordConditions.push(`(CASE WHEN LOWER(content) LIKE ? THEN ${weight} ELSE 0 END)`);
      params.push(`%${term}%`);
    }
  }
  
  const relevanceScore = keywordConditions.join(' + ');
  
  let sqlQuery = `
    SELECT *, (${relevanceScore}) as relevance_score
    FROM memories
    WHERE userId = ? AND deletedAt IS NULL
  `;

  params.push(userId);

  if (threadId) {
    sqlQuery += ' AND threadId = ?';
    params.push(threadId);
  }

  // Get results with basic relevance scoring
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
  params.push(maxItems * 2); // Get more for enhanced scoring

  let memories = db.prepare(sqlQuery).all(...params) as Array<Memory & { relevance_score?: number }>;
  
  // Apply enhanced relevance scoring
  const baseScores = new Map<string, number>();
  memories.forEach(mem => {
    baseScores.set(mem.id, (mem.relevance_score || 0) / 10); // Normalize base score
  });
  
  // Apply enhanced relevance scoring
  for (const memory of memories) {
    const baseScore = baseScores.get(memory.id) || 0;
    const enhancedScore = calculateRelevanceScore(
      memory,
      processed,
      baseScore,
      {
        boostPhrases: true,
        boostPosition: true,
        boostTier: true,
        boostPriority: true,
        boostRecency: true,
      }
    );
    baseScores.set(memory.id, enhancedScore);
  }
  
  // Sort by enhanced score
  memories = sortByRelevance(memories, processed, baseScores, {
    boostPhrases: true,
    boostPosition: true,
    boostTier: true,
    boostPriority: true,
    boostRecency: true,
  });
  
  logger.debug({ 
    count: memories.length,
    searchType: 'keyword-only',
    phrases: processed.phrases.length,
    keywords: processed.keywords.length
  }, 'Keyword-only search completed with enhanced relevance');
  
  return memories.slice(0, maxItems);
}

