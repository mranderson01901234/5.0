/**
 * Embedding Engine for Ingestion Service
 * Generates embeddings for ingested content using OpenAI
 */

import OpenAI from 'openai';
import { pino } from 'pino';

const logger = pino({ name: 'embedding-engine' });

export interface EmbeddingResult {
  id: string;
  embedding: number[];
  model: string;
  tokens: number;
}

export class EmbeddingEngine {
  private openai: OpenAI;
  private model: string;
  private batchSize: number;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for embeddings');
    }

    this.openai = new OpenAI({ apiKey });
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.batchSize = parseInt(process.env.EMBEDDING_BATCH_SIZE || '100', 10);

    logger.info({ model: this.model, batchSize: this.batchSize }, 'Embedding engine initialized');
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Automatically chunks large batches based on batchSize
   */
  async embedBatch(items: Array<{ id: string; text: string }>): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process in chunks
    for (let i = 0; i < items.length; i += this.batchSize) {
      const chunk = items.slice(i, i + this.batchSize);

      try {
        logger.debug({ chunk: i / this.batchSize + 1, total: Math.ceil(items.length / this.batchSize), count: chunk.length }, 'Processing embedding batch');

        const response = await this.openai.embeddings.create({
          model: this.model,
          input: chunk.map(item => item.text),
        });

        // Map results back to IDs
        chunk.forEach((item, index) => {
          results.push({
            id: item.id,
            embedding: response.data[index].embedding,
            model: this.model,
            tokens: response.usage?.total_tokens || 0,
          });
        });

        logger.debug({ processed: results.length, total: items.length }, 'Batch embeddings generated');
      } catch (error: any) {
        logger.error({ error: error.message, chunk: i / this.batchSize + 1 }, 'Failed to generate batch embeddings');
        throw error;
      }
    }

    return results;
  }

  /**
   * Prepare text for embedding (title + summary)
   * Max 8192 tokens for text-embedding-3-small
   */
  prepareText(title: string, summary: string, content?: string): string {
    const parts: string[] = [];

    if (title) {
      parts.push(`Title: ${title}`);
    }

    if (summary) {
      parts.push(`Summary: ${summary}`);
    }

    // Add content excerpt if available (truncate to ~2000 chars)
    if (content) {
      const excerpt = content.substring(0, 2000);
      parts.push(`Content: ${excerpt}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Get model info
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get dimensions for this model
   */
  getDimensions(): number {
    // text-embedding-3-small has 1536 dimensions
    return 1536;
  }
}
