/**
 * Memory service routes
 */

import type { FastifyInstance } from 'fastify';
import type { Memory } from '@llm-gateway/shared';
import { MessageEventSchema, ListMemoriesQuerySchema, PatchMemorySchema } from '@llm-gateway/shared';
import { MemoryModel, AuditModel, UserProfileModel } from './models.js';
import { CadenceTracker } from './cadence.js';
import { JobQueue } from './queue.js';
import { calculateQualityScore, detectTier } from './scorer.js';
import { redactPII, isAllRedacted } from './redaction.js';
import type { DatabaseConnection } from './db.js';
import { extractTopic } from './topicExtractor.js';
import { TopicTracker } from './topicTracker.js';
import { randomUUID } from 'crypto';
import { getResearchConfig } from './config.js';
import { runResearchPipeline } from './research/pipeline/index.js';
import type { ResearchJob } from './research/types.js';
import type Database from 'better-sqlite3';
import { generateSummary } from './summarizer.js';
import { invalidateUserProfile } from './userProfile.js';
import { generateEmbedding, getOrGenerateEmbedding, addToEmbeddingQueue } from './embedding-service.js';
import { hybridSearch, keywordOnlySearch } from './vector-search.js';
import { deduplicateMemoriesByTopic, deduplicateBySemanticSimilarity } from './memory-prioritizer.js';

const QUALITY_THRESHOLD = 0.65;

export function registerRoutes(
  app: FastifyInstance,
  db: DatabaseConnection,
  cadence: CadenceTracker,
  queue: JobQueue,
  gatewayDb: Database.Database | null = null
) {
  const memoryModel = new MemoryModel(db);
  const auditModel = new AuditModel(db);
  const profileModel = new UserProfileModel(db);
  const topicTracker = new TopicTracker();

  /**
   * POST /v1/events/message
   * Fire-and-forget message event from gateway
   */
  app.post('/v1/events/message', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    // Check if reply was sent (auth failed)
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    try {
      const event = MessageEventSchema.parse(req.body);
      
      // Ensure userId matches authenticated user
      if (event.userId !== userId) {
        return reply.code(403).send({ error: 'Forbidden: userId mismatch' });
      }

      // Record in cadence tracker
      cadence.recordMessage(
        event.userId,
        event.threadId,
        event.tokens,
        event.timestamp || Date.now()
      );

      // Check if audit should trigger
      if (cadence.shouldTriggerAudit(event.userId, event.threadId)) {
        // Enqueue audit job (high priority)
        queue.enqueue({
          id: `audit-${event.userId}-${event.threadId}-${Date.now()}`,
          type: 'audit',
          priority: 10,
          payload: {
            userId: event.userId,
            threadId: event.threadId,
            msgId: event.msgId,
          },
        });
      }

      // AGGRESSIVE MODE: Trigger research immediately on any user message
      // This runs in background and doesn't block the response
      const researchConfig = getResearchConfig();
      if (researchConfig.enabled && event.role === 'user') {
        // Check if message seems research-worthy (non-trivial content)
        const contentLower = event.content.toLowerCase().trim();
        const isResearchWorthy = contentLower.length > 10 && 
          !contentLower.match(/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)$/i);
        
        if (isResearchWorthy) {
          // Extract topic from single message (will be refined in full batch)
          const topicExtraction = extractTopic([{ content: event.content, role: event.role }]);
          
          // Always trigger research for any substantial user message
          const batchId = randomUUID();
          const normQuery = topicExtraction.topic.substring(0, 200);
          
          const researchJob: ResearchJob = {
            threadId: event.threadId,
            batchId,
            topic: topicExtraction.topic,
            entities: topicExtraction.entities,
            ttlClass: topicExtraction.ttlClass,
            normQuery,
            recencyHint: topicExtraction.recencyHint,
          };

          // Enqueue research job (runs in background)
          queue.enqueue({
            id: `research-immediate-${event.userId}-${event.threadId}-${batchId}`,
            type: 'research',
            priority: 5,
            payload: researchJob,
          });

          app.log.info({ threadId: event.threadId, topic: topicExtraction.topic.substring(0, 60) }, 'Research triggered immediately on user message');
        }
      }

      return reply.code(202).send({ received: true });
    } catch (error) {
      app.log.error({ error }, 'Failed to process message event');
      return reply.code(400).send({ error: 'Invalid message event' });
    }
  });

  /**
   * POST /v1/jobs/audit
   * Trigger manual audit (for testing)
   */
  app.post('/v1/jobs/audit', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const authenticatedUserId = req.user.id;
    
    try {
      const { userId, threadId } = req.body as { userId: string; threadId: string };
      
      // Ensure userId matches authenticated user
      if (userId !== authenticatedUserId) {
        return reply.code(403).send({ error: 'Forbidden: userId mismatch' });
      }

      queue.enqueue({
        id: `audit-manual-${userId}-${threadId}-${Date.now()}`,
        type: 'audit',
        priority: 5,
        payload: { userId, threadId },
      });

      return reply.code(202).send({ enqueued: true });
    } catch (error) {
      app.log.error({ error }, 'Failed to enqueue audit');
      return reply.code(400).send({ error: 'Invalid audit request' });
    }
  });

  /**
   * GET /v1/memories
   * List memories with filters
   */
  app.get('/v1/memories', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    try {
      const query = ListMemoriesQuerySchema.parse(req.query);
      
      // Ensure query filters by authenticated user
      if (!query.userId || query.userId !== userId) {
        query.userId = userId;
      }
      
      const result = memoryModel.list(query);

      return reply.send({
        memories: result.memories,
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to list memories');
      return reply.code(400).send({ error: 'Invalid query parameters' });
    }
  });

  /**
   * POST /v1/memories
   * Create a new memory (for explicit saves)
   */
  app.post('/v1/memories', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    try {
      const { threadId, content, priority, tier } = req.body as {
        threadId: string;
        content: string;
        priority?: number;
        tier?: 'TIER1' | 'TIER2' | 'TIER3';
      };

      if (!threadId || !content) {
        return reply.code(400).send({ error: 'threadId and content are required' });
      }

      // Redact PII
      const { redacted, map, hadPII } = redactPII(content);

      // Skip if entirely redacted
      if (isAllRedacted(redacted)) {
        return reply.code(400).send({ error: 'Content cannot be all PII' });
      }

      // Check for similar existing memory (superceding logic)
      // This prevents duplicate memories and updates existing ones instead
      const similarMemory = await memoryModel.findSimilarMemory(userId, redacted, 0.75);
      
      let memory: Memory;
      
      if (similarMemory) {
        // Supercede (update) existing memory instead of creating new one
        const finalPriority = priority !== undefined ? priority : Math.max(similarMemory.priority, 0.9);
        const finalTier = tier || similarMemory.tier || 'TIER1';
        
        memory = memoryModel.supercedeMemory(
          similarMemory.id,
          redacted,
          threadId,
          finalPriority,
          finalTier
        ) || similarMemory; // Fallback to existing if update fails
        
        app.log.info({ 
          userId, 
          threadId, 
          memoryId: memory.id, 
          tier: memory.tier,
          wasSuperceded: true,
          originalMemoryId: similarMemory.id 
        }, 'Memory superceded (duplicate detected and updated)');
      } else {
        // No similar memory found - create new one
        memory = memoryModel.create({
          userId,
          threadId,
          content: redacted,
          entities: null,
          priority: priority || 0.9, // Default high for explicit saves
          confidence: 0.8,
          redactionMap: map ? JSON.stringify(map) : null,
          tier: tier || 'TIER1', // Default TIER1 for explicit saves
          repeats: 1,
          deletedAt: null,
        });

        app.log.info({ userId, threadId, memoryId: memory.id, tier: memory.tier }, 'New explicit memory created');
      }

      // Queue embedding generation for new or updated memory (async, non-blocking)
      try {
        const embedding = await getOrGenerateEmbedding(db, memory.id, redacted);
        if (!embedding) {
          // Will be processed by background worker
          app.log.debug({ memoryId: memory.id }, 'Embedding queued for background processing');
        }
      } catch (error: any) {
        app.log.debug({ error: error.message, memoryId: memory.id }, 'Failed to generate embedding (will retry via queue)');
        // Add to queue for background processing
        await addToEmbeddingQueue(db, memory.id, redacted);
      }

      // Invalidate user profile cache
      try {
        await invalidateUserProfile(userId);
      } catch (error) {
        app.log.debug({ error, userId }, 'Failed to invalidate profile cache');
      }

      return reply.send(memory);
    } catch (error: any) {
      app.log.error({ 
        error: error.message, 
        code: error.code,
        stack: error.stack?.substring(0, 200),
        body: req.body,
        userId 
      }, 'Failed to create memory');
      return reply.code(400).send({ error: 'Invalid memory data', details: error.message });
    }
  });

  /**
   * PATCH /v1/memories/:id
   * Update a memory
   */
  app.patch('/v1/memories/:id', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const userId = req.user.id;
    
    try {
      const { id } = req.params as { id: string };
      const patch = PatchMemorySchema.parse(req.body);

      // Check ownership before updating
      const existing = memoryModel.getById(id);
      if (existing && existing.userId !== userId) {
        return reply.code(403).send({ error: 'Forbidden: memory belongs to another user' });
      }

      const updated = memoryModel.patch(id, patch);
      if (!updated) {
        return reply.code(404).send({ error: 'Memory not found' });
      }
      
      // Ensure ownership after update
      if (updated.userId !== userId) {
        return reply.code(403).send({ error: 'Forbidden: memory belongs to another user' });
      }

      return reply.send(updated);
    } catch (error) {
      app.log.error({ error }, 'Failed to patch memory');
      return reply.code(400).send({ error: 'Invalid patch data' });
    }
  });

  /**
   * GET /v1/recall
   * Async recall - fetch top memories with deadline constraint
   * Query params:
   *   - userId: string
   *   - threadId?: string (optional, for thread-specific recall)
   *   - query?: string (optional, for keyword-based filtering)
   *   - maxItems?: number (default: 5, max: 20)
   *   - deadlineMs?: number (default: 200ms, max: 500ms)
   */
  app.get('/v1/recall', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const authenticatedUserId = req.user.id;
    
    try {
      const { userId, threadId, query, maxItems = 5, deadlineMs = 200 } = req.query as {
        userId: string;
        threadId?: string;
        query?: string;
        maxItems?: number;
        deadlineMs?: number;
      };

      if (!userId) {
        return reply.code(400).send({ error: 'userId is required' });
      }
      
      // CRITICAL: Ensure userId matches authenticated user to prevent cross-user data leakage
      if (userId !== authenticatedUserId) {
        return reply.code(403).send({ error: 'Forbidden: userId mismatch' });
      }

      const deadline = Math.min(Number(deadlineMs) || 200, 500);
      const limit = Math.min(Number(maxItems) || 5, 20);

      // Start timer for deadline
      const startTime = Date.now();

      // Race between query and deadline
      const queryPromise = new Promise<{ memories: Memory[]; searchType: 'hybrid' | 'keyword' }>((resolve) => {
        (async () => {
          try {
            let memories: Memory[] = [];
            let searchType: 'hybrid' | 'keyword' = 'keyword';

            // Generate query embedding if query provided and OpenAI key available
            let queryEmbedding: number[] | null = null;
            if (query && query.trim() && process.env.OPENAI_API_KEY) {
              try {
                queryEmbedding = await generateEmbedding(query) || null;
                if (queryEmbedding) {
                  app.log.debug({ userId, queryLength: query.length }, 'Query embedding generated');
                }
              } catch (error: any) {
                app.log.warn({ error: error.message, userId }, 'Failed to generate query embedding, falling back to keyword search');
              }
            }

            // Use hybrid search if embedding available, otherwise keyword-only
            if (queryEmbedding) {
              try {
                memories = await hybridSearch(db, userId, query || '', queryEmbedding, {
                  maxItems: limit * 2, // Get more candidates for post-processing
                  semanticWeight: parseFloat(process.env.HYBRID_SEARCH_SEMANTIC_WEIGHT || '0.7'),
                  keywordWeight: parseFloat(process.env.HYBRID_SEARCH_KEYWORD_WEIGHT || '0.3'),
                  deadlineMs: deadline - 50, // Leave buffer for processing
                  threadId,
                });
                searchType = 'hybrid';
              } catch (error: any) {
                app.log.warn({ error: error.message, userId }, 'Hybrid search failed, falling back to keyword search');
                memories = keywordOnlySearch(db, userId, query || '', limit, threadId);
                searchType = 'keyword';
              }
            } else {
              // Fallback to keyword-only search
              memories = keywordOnlySearch(db, userId, query || '', limit, threadId);
              searchType = 'keyword';
            }

            // Post-processing: smart deduplication using intelligent prioritization
            if (query && query.trim() && memories.length > 0) {
              // First, filter out incomplete memories
              const completeMemories = memories.filter(mem => {
                const content = mem.content.toLowerCase();
                const attributeMatch = content.match(/my\s+(favorite\s+)?(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+(.+)/);
                if (attributeMatch) {
                  const value = attributeMatch[3]?.trim();
                  if (!value || value.length < 2) {
                    app.log.debug({ userId, content: mem.content, reason: 'incomplete_value' }, 'Skipping incomplete memory');
                    return false;
                  }
                } else {
                  const incompleteMatch = content.match(/^my\s+(favorite\s+)?(\w+(?:\s+\w+)?)$/);
                  if (incompleteMatch) {
                    app.log.debug({ userId, content: mem.content, reason: 'no_value_provided' }, 'Skipping incomplete memory');
                    return false;
                  }
                }
                return true;
              });

              // Use smart deduplication for topic-based memories
              const deduplicated = deduplicateMemoriesByTopic(completeMemories, {
                minSimilarity: 0.7,
                preferRecent: true,
              });

              // For remaining memories, use semantic similarity deduplication
              const finalMemories = deduplicateBySemanticSimilarity(deduplicated, 0.85);

              memories = finalMemories.slice(0, limit);
              
              app.log.debug({ 
                userId, 
                originalCount: memories.length, 
                deduplicatedCount: finalMemories.length,
                finalCount: memories.length 
              }, 'Smart deduplication completed');
            } else {
              // No query - just limit results
              memories = memories.slice(0, limit);
            }

            app.log.debug({
              userId,
              query,
              memoryCount: memories.length,
              searchType,
              hasEmbedding: !!queryEmbedding,
            }, 'Memory recall completed');

            resolve({ memories, searchType });
          } catch (error: any) {
            app.log.error({ error: error?.message || error, stack: error?.stack, userId, query }, 'Recall query failed');
            resolve({ memories: [], searchType: 'keyword' });
          }
        })();
      });

      const timeoutPromise = new Promise<{ memories: Memory[]; searchType: 'keyword' }>((resolve) => {
        setTimeout(() => resolve({ memories: [], searchType: 'keyword' }), deadline);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      const elapsedMs = Date.now() - startTime;

      return reply.send({
        memories: result.memories,
        count: result.memories.length,
        elapsedMs,
        timedOut: elapsedMs >= deadline,
        searchType: result.searchType,
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to recall memories');
      return reply.code(500).send({ error: 'Recall failed' });
    }
  });

  /**
   * GET /v1/conversations
   * Get last N conversations for a user
   */
  app.get('/v1/conversations', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const authenticatedUserId = req.user.id;
    
    try {
      const { userId, excludeThreadId, limit = 10 } = req.query as {
        userId: string;
        excludeThreadId?: string;
        limit?: number;
      };

      if (!userId) {
        return reply.code(400).send({ error: 'userId is required' });
      }
      
      // CRITICAL: Ensure userId matches authenticated user to prevent cross-user data leakage
      if (userId !== authenticatedUserId) {
        return reply.code(403).send({ error: 'Forbidden: userId mismatch' });
      }

      // Get distinct thread IDs with most recent audit timestamp for each
      const maxLimit = 20;
      const queryLimit = Math.min(Number(limit) || 10, maxLimit);

      let query = `
        SELECT threadId, MAX(createdAt) as lastActivity
        FROM memory_audits
        WHERE userId = ?
      `;
      const params: any[] = [userId];

      if (excludeThreadId) {
        query += ' AND threadId != ?';
        params.push(excludeThreadId);
      }

      query += `
        GROUP BY threadId
        ORDER BY lastActivity DESC
        LIMIT ?
      `;
      params.push(queryLimit);

      const conversations = db.prepare(query).all(...params) as Array<{
        threadId: string;
        lastActivity: number;
      }>;

      return reply.send({
        conversations,
        count: conversations.length,
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to get conversations');
      return reply.code(500).send({ error: 'Failed to get conversations' });
    }
  });

  /**
   * GET /v1/profile
   * Get user profile (extracted from memories)
   */
  app.get('/v1/profile', async (req, reply) => {
    await app.requireAuth(req, reply);
    
    if (reply.sent) {
      return;
    }
    
    if (!req.user?.id) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    const authenticatedUserId = req.user.id;
    
    try {
      const { userId } = req.query as { userId: string };

      if (!userId) {
        return reply.code(400).send({ error: 'userId is required' });
      }
      
      // CRITICAL: Ensure userId matches authenticated user to prevent cross-user data leakage
      if (userId !== authenticatedUserId) {
        return reply.code(403).send({ error: 'Forbidden: userId mismatch' });
      }

      const { getUserProfile } = await import('./userProfile.js');
      const profile = await getUserProfile(userId, profileModel);

      return reply.send({
        profile,
        found: profile !== null,
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to get user profile');
      return reply.code(500).send({ error: 'Failed to get user profile' });
    }
  });

  /**
   * Register audit job handler
   */
  queue.registerHandler('audit', async (job) => {
    const { userId, threadId } = job.payload as { userId: string; threadId: string };
    const state = cadence.getState(userId, threadId);

    if (!state) {
      app.log.warn({ userId, threadId }, 'No state for audit');
      return;
    }

    app.log.info({ userId, threadId, msgCount: state.msgCount, tokenCount: state.tokenCount }, 'Processing audit');

    // Fetch recent messages from gateway DB
    // CRITICAL: Filter by userId to prevent cross-user data leakage
    let messages: Array<{ content: string; role: 'user' | 'assistant'; timestamp: number }> = [];
    
    if (gatewayDb) {
      try {
        const rawMessages = gatewayDb.prepare(
          `SELECT content, role, created_at FROM messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50`
        ).all(threadId, userId) as Array<{ content: string; role: string; created_at: number }>;
        
        messages = rawMessages.map(msg => ({
          content: msg.content,
          role: msg.role as 'user' | 'assistant',
          timestamp: msg.created_at * 1000, // Convert Unix timestamp to ms
        })).reverse(); // Reverse to get chronological order
        
        app.log.debug({ threadId, userId, messageCount: messages.length }, 'Fetched messages from gateway DB');
      } catch (error: any) {
        app.log.error({ error: error.message, threadId, userId }, 'Failed to fetch messages from gateway DB');
      }
    }
    
    // No fallback - if no messages found, log error and continue
    if (messages.length === 0) {
      app.log.error({ threadId, userId, gatewayDb: !!gatewayDb }, 'No messages found in gateway DB for audit');
      // Continue with empty messages - audit will record 0 saved memories
    }

    let saved = 0;
    let hasRelevantMemories = false; // Track if any TIER1/TIER2 memories were saved
    const scores: number[] = [];

    for (const msg of messages) {
      const score = calculateQualityScore({
        content: msg.content,
        role: msg.role,
        timestamp: msg.timestamp,
        threadStartTime: state.firstMsgTime,
      });

      scores.push(score);

      if (score >= QUALITY_THRESHOLD) {
        // Redact PII
        const { redacted, map, hadPII } = redactPII(msg.content);

        // Skip if entirely redacted
        if (isAllRedacted(redacted)) {
          app.log.debug({ userId, threadId }, 'Skipping entirely redacted message');
          continue;
        }

        // Detect tier based on content
        const tier = detectTier({
          content: msg.content,
          role: msg.role,
          timestamp: msg.timestamp,
          threadStartTime: state.firstMsgTime,
          userId,
          threadId,
        });

        // Check for similar existing memory (superceding logic)
        // This prevents duplicate memories from automatic saves too
        const similarMemory = await memoryModel.findSimilarMemory(userId, redacted, 0.75);
        
        let memory: Memory;
        
        if (similarMemory) {
          // Supercede (update) existing memory instead of creating new one
          // Use higher of existing or new priority, keep existing tier
          const finalPriority = Math.max(similarMemory.priority, score);
          const finalTier = similarMemory.tier; // Keep existing tier for automatic saves
          
          memory = memoryModel.supercedeMemory(
            similarMemory.id,
            redacted,
            threadId,
            finalPriority,
            finalTier
          ) || similarMemory;
          
          app.log.debug({ 
            id: memory.id, 
            score, 
            hadPII, 
            tier: memory.tier,
            wasSuperceded: true,
            originalMemoryId: similarMemory.id 
          }, 'Memory superceded during audit (duplicate detected)');
          
          // Queue embedding generation for updated memory
          try {
            const embedding = await getOrGenerateEmbedding(db, memory.id, redacted);
            if (!embedding) {
              await addToEmbeddingQueue(db, memory.id, redacted);
            }
          } catch (error: any) {
            app.log.debug({ error: error.message, memoryId: memory.id }, 'Failed to generate embedding (will retry via queue)');
            await addToEmbeddingQueue(db, memory.id, redacted);
          }
        } else {
          // No similar memory found - create new one
          memory = memoryModel.create({
            userId,
            threadId,
            content: redacted,
            entities: null,
            priority: score,
            confidence: 0.8,
            redactionMap: map ? JSON.stringify(map) : null,
            tier,
            repeats: 1,
            deletedAt: null,
          });

          app.log.debug({ id: memory.id, score, hadPII, tier }, 'Memory saved during audit');
          
          // Queue embedding generation for new memory
          try {
            const embedding = await getOrGenerateEmbedding(db, memory.id, redacted);
            if (!embedding) {
              await addToEmbeddingQueue(db, memory.id, redacted);
            }
          } catch (error: any) {
            app.log.debug({ error: error.message, memoryId: memory.id }, 'Failed to generate embedding (will retry via queue)');
            await addToEmbeddingQueue(db, memory.id, redacted);
          }
        }

        saved++;
        if (memory.tier === 'TIER1' || memory.tier === 'TIER2') {
          hasRelevantMemories = true;
        }
      }
    }

    // Create audit record
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    auditModel.create({
      userId,
      threadId,
      startMsgId: null,
      endMsgId: null,
      tokenCount: state.tokenCount,
      score: avgScore,
      saved,
    });

    // Mark audit complete
    cadence.markAuditComplete(userId, threadId);
    
    // Invalidate user profile cache if relevant memories were saved
    if (hasRelevantMemories) {
      try {
        await invalidateUserProfile(userId);
        app.log.debug({ userId }, 'User profile invalidated after TIER1/TIER2 memory save');
      } catch (error) {
        app.log.debug({ error, userId }, 'Failed to invalidate user profile');
      }
    }

    app.log.info({ userId, threadId, saved, avgScore }, 'Audit complete');

    // Generate and cache conversation summary (background, non-blocking)
    if (gatewayDb && messages.length > 0) {
      try {
        // Check if summary already exists and is recent (< 1 hour old)
        // CRITICAL: Filter by userId to prevent cross-user data leakage
        const existing = gatewayDb.prepare(
          'SELECT summary, updated_at FROM thread_summaries WHERE thread_id = ? AND user_id = ?'
        ).get(threadId, userId) as { summary: string; updated_at: number } | undefined;

        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
        const needsUpdate = !existing || existing.updated_at < oneHourAgo;

        if (needsUpdate) {
          // Generate summary in background (don't await)
          (async () => {
            try {
              const summary = await generateSummary(messages);
              const now = Math.floor(Date.now() / 1000);
              
              // Upsert summary in gateway DB (using unified schema with user_id)
              gatewayDb.prepare(
                `INSERT INTO thread_summaries (thread_id, user_id, summary, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(thread_id) DO UPDATE SET summary = ?, updated_at = ?`
              ).run(threadId, userId, summary, now, summary, now);
              
              app.log.debug({ threadId, summaryLength: summary.length }, 'Conversation summary cached');
            } catch (error: any) {
              app.log.warn({ error: error.message, threadId }, 'Failed to cache summary');
            }
          })();
        }
      } catch (error: any) {
        app.log.warn({ error: error.message, threadId }, 'Summary cache check failed');
      }
    }

    // Research integration: Extract topic and enqueue research job if needed
    const researchConfig = getResearchConfig();
    if (researchConfig.enabled && researchConfig.memoryReviewTrigger) {
      try {
        // Extract topic from messages
        const topicMessages = messages.map(m => ({ content: m.content, role: m.role }));
        const topicExtraction = extractTopic(topicMessages);

        // Record topic in tracker
        topicTracker.recordTopic(threadId, topicExtraction.topic, topicExtraction.ttlClass, topicExtraction.entities);

        // Check if research should trigger: Topic stable AND (stale per TTL OR low-confidence memories)
        const isStable = topicTracker.isTopicStable(threadId, topicExtraction.topic);
        const isStale = topicTracker.isTopicStale(threadId, topicExtraction.topic);
        const lowConfidence = avgScore < 0.7; // Low confidence if average score < 0.7
        
        // Get topic history for debugging
        const topicHistory = topicTracker.getTopicHistory(threadId, topicExtraction.topic);
        const batchCount = topicHistory?.batchCount || 0;
        
        app.log.info({ 
          threadId, 
          topic: topicExtraction.topic.substring(0, 60),
          ttlClass: topicExtraction.ttlClass,
          isStable,
          isStale,
          lowConfidence,
          batchCount,
          avgScore,
          willTrigger: false // calculated below
        }, 'Research trigger check');

        // For news/current topics: Always trigger on first batch (they need fresh information)
        // For other topics: Trigger if stable AND (stale OR low confidence), OR first batch with low confidence
        const isNewsTopic = topicExtraction.ttlClass === 'news/current';
        const shouldTrigger = isNewsTopic 
          ? batchCount === 1 // Always research news topics on first batch
          : (isStable && (isStale || lowConfidence)) || (batchCount === 1 && lowConfidence);
        
        if (shouldTrigger) {
          const batchId = randomUUID();
          
          // Normalize query: use topic as search query (can be enhanced with LLM)
          const normQuery = topicExtraction.topic.substring(0, 200);

          const researchJob: ResearchJob = {
            threadId,
            batchId,
            topic: topicExtraction.topic,
            entities: topicExtraction.entities,
            ttlClass: topicExtraction.ttlClass,
            normQuery,
            recencyHint: topicExtraction.recencyHint,
          };

          // Enqueue research job (priority 5, lower than audit)
          queue.enqueue({
            id: `research-${userId}-${threadId}-${batchId}`,
            type: 'research',
            priority: 5,
            payload: researchJob,
          });

          app.log.info({ threadId, batchId, topic: topicExtraction.topic }, 'Research job enqueued');
        } else {
          app.log.debug({ threadId, isStable, isStale, lowConfidence }, 'Research not triggered');
        }
      } catch (error) {
        app.log.warn({ error, threadId }, 'Failed to enqueue research job');
      }
    }
  });

  /**
   * Register research job handler
   */
  queue.registerHandler('research', async (job) => {
    const researchJob = job.payload as ResearchJob;

    app.log.info({ threadId: researchJob.threadId, batchId: researchJob.batchId }, 'Processing research job');

    try {
      const capsule = await runResearchPipeline(researchJob);

      if (capsule) {
        // Mark topic as verified
        topicTracker.markTopicVerified(researchJob.threadId, researchJob.topic);
        app.log.info({ threadId: researchJob.threadId, batchId: researchJob.batchId }, 'Research job complete');
      } else {
        app.log.warn({ threadId: researchJob.threadId, batchId: researchJob.batchId }, 'Research job returned no capsule');
      }
    } catch (error) {
      app.log.error({ error, threadId: researchJob.threadId, batchId: researchJob.batchId }, 'Research job failed');
      // Don't throw - allow job to be marked as failed after retries
    }
  });
}
