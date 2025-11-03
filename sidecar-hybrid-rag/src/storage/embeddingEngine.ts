/**
 * Embedding Engine - OpenAI Integration
 */

import OpenAI from 'openai';
import { loadConfig } from '../config.js';
import { EmbeddingCache } from './embeddingCache.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

export class EmbeddingEngine {
  private openai: OpenAI;
  private cache: EmbeddingCache;

  constructor(cache?: EmbeddingCache) {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.cache = cache || new EmbeddingCache();
  }

  /**
   * Generate embedding for text (with caching)
   */
  async embed(text: string): Promise<number[]> {
    try {
      // Check cache first
      const cached = await this.cache.get(text);
      if (cached) {
        logger.debug('Using cached embedding');
        return cached;
      }

      logger.debug({ textLength: text.length }, 'Generating embedding');

      const response = await this.openai.embeddings.create({
        model: config.embeddingModel,
        input: text,
      });

      const embedding = response.data[0].embedding;
      logger.debug({ dimensions: embedding.length }, 'Embedding generated');

      // Cache it
      await this.cache.set(text, embedding);

      return embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Batch embedding generation (with caching)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      logger.debug({ count: texts.length }, 'Generating batch embeddings');

      // Check cache for each
      const results: number[][] = [];
      const toGenerate: { text: string; index: number }[] = [];
      
      for (let i = 0; i < texts.length; i++) {
        const cached = await this.cache.get(texts[i]);
        if (cached) {
          results[i] = cached;
        } else {
          toGenerate.push({ text: texts[i], index: i });
        }
      }

      // Generate missing embeddings
      if (toGenerate.length > 0) {
        const response = await this.openai.embeddings.create({
          model: config.embeddingModel,
          input: toGenerate.map(t => t.text),
        });

        // Store results
        for (let i = 0; i < response.data.length; i++) {
          const embedding = response.data[i].embedding;
          const originalIndex = toGenerate[i].index;
          results[originalIndex] = embedding;
          
          // Cache
          await this.cache.set(toGenerate[i].text, embedding);
        }
      }

      logger.debug({ count: results.length, generated: toGenerate.length }, 'Batch embeddings complete');

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to generate batch embeddings');
      throw error;
    }
  }

  /**
   * Get embedding dimensions for the model
   */
  getDimensions(): number {
    // text-embedding-3-small has 1536 dimensions
    return 1536;
  }
}

