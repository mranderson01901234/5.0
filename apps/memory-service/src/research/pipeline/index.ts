/**
 * Research pipeline entry point
 * Main orchestrator: fetch → rerank → build capsule → publish to Redis
 */

import { pino } from 'pino';
import type { ResearchJob, ResearchCapsule } from '../types.js';
import { fetchAndRerank } from './fetchAndRerank.js';
import { buildCapsule } from './buildCapsule.js';
import { cacheCapsule, getCachedCapsule } from '../cache.js';
import { publish } from '../../redis.js';
import { isResearchEnabled } from '../../config.js';

const logger = pino({ name: 'research-pipeline' });

/**
 * Run research pipeline for a job
 */
export async function runResearchPipeline(job: ResearchJob): Promise<ResearchCapsule | null> {
  // Guard: check if research is enabled
  if (!isResearchEnabled()) {
    logger.debug({ threadId: job.threadId, batchId: job.batchId }, 'Research disabled, skipping');
    return null;
  }

  logger.info({ threadId: job.threadId, batchId: job.batchId, topic: job.topic }, 'Starting research pipeline');

  // Publish research started indicator (for thinking process UI)
  // Do this IMMEDIATELY so gateway can show thinking indicator right away
  const { set } = await import('../../redis.js');
  const startChannel = `researchStarted:${job.threadId}:${job.batchId}`;
  await set(startChannel, JSON.stringify({ threadId: job.threadId, batchId: job.batchId, startedAt: Date.now() }), 120); // Longer TTL (2 min) for immediate triggers

  try {
    // Check cache first
    const cached = await getCachedCapsule(
      job.topic,
      job.ttlClass,
      job.recencyHint,
      job.normQuery
    );

    if (cached) {
      logger.debug({ threadId: job.threadId, batchId: job.batchId }, 'Using cached capsule');
      
      // Still publish for injection window (may be needed for current turn)
      await publishCapsule(cached, job);
      return cached;
    }

    // Fetch and rerank
    const items = await fetchAndRerank(job);

    if (items.length === 0) {
      logger.warn({ threadId: job.threadId, batchId: job.batchId }, 'No items returned from fetch');
      return null;
    }

    // Build capsule
    const capsule = buildCapsule(job, items);

    // Cache capsule (with correct recencyHint and normQuery to match retrieval)
    await cacheCapsule(capsule, job.ttlClass, job.recencyHint, job.normQuery);

    // Publish to Redis
    await publishCapsule(capsule, job);

    logger.info({ 
      threadId: job.threadId, 
      batchId: job.batchId,
      claimsCount: capsule.claims.length,
      sourcesCount: capsule.sources.length 
    }, 'Research pipeline complete');

    return capsule;
  } catch (error: any) {
    logger.error({ error, threadId: job.threadId, batchId: job.batchId }, 'Research pipeline failed');
    return null;
  }
}

/**
 * Publish capsule to Redis channel
 * Also stores it as a key for retrieval (TTL: 60 seconds, just for early window polling)
 */
async function publishCapsule(capsule: ResearchCapsule, job: ResearchJob): Promise<void> {
  const channel = `factPack:${job.threadId}:${job.batchId}`;
  const message = JSON.stringify(capsule);

  // Publish to channel (for subscribers)
  const published = await publish(channel, message);
  
  // Also store as key for early-window polling (short TTL, just for current turn)
  const { set } = await import('../../redis.js');
  await set(channel, message, 60); // 60 second TTL for early-window polling
  
  if (published) {
    logger.debug({ channel, threadId: job.threadId, batchId: job.batchId }, 'Capsule published to Redis');
  } else {
    logger.warn({ channel, threadId: job.threadId, batchId: job.batchId }, 'Failed to publish capsule to Redis');
  }
}

