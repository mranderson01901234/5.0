/**
 * Intelligent Cache - Response-level caching with sophisticated hit/miss logic
 * 
 * Features:
 * - Message normalization for better cache hits
 * - Context-aware cache keys
 * - Dynamic TTL based on query type
 * - Cache analytics (hit/miss tracking)
 * - Automatic cache cleanup
 */

import { createHash } from 'crypto';
import { logger } from './log.js';
import { loadConfig } from './config.js';

export interface CacheEntry {
  data: any;
  created: number;
  expires: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  memoryUsage: number;
}

export interface CachedResponse {
  content: string;
  fromCache: boolean;
  cacheAge: number;
}

export class IntelligentCache {
  private responseCache = new Map<string, CacheEntry>();
  private analytics = new Map<string, { hits: number; misses: number }>();
  
  private config = {
    maxSize: 1000,
    defaultTtl: 30 * 60 * 1000, // 30 minutes
    knowledgeTtl: 60 * 60 * 1000, // 1 hour
    generalTtl: 15 * 60 * 1000, // 15 minutes
  };

  /**
   * Generate cache key from request and context
   */
  generateCacheKey(request: {
    userId: string;
    message: string;
    model?: string;
  }, context?: any): string {
    const normalizedMessage = this.normalizeMessage(request.message);
    const contextHash = context ? this.hashContext(context) : '';
    
    const keyData = {
      message: normalizedMessage,
      model: request.model || 'default',
      contextHash,
      userId: request.userId, // Include userId for personalized caching
    };
    
    return this.hashObject(keyData);
  }

  /**
   * Normalize message for better cache hits
   */
  private normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:"]$/, ''); // Remove trailing punctuation
  }

  /**
   * Hash context object
   */
  private hashContext(context: any): string {
    try {
      const serialized = JSON.stringify(context);
      return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
    } catch {
      return '';
    }
  }

  /**
   * Hash object to string
   */
  private hashObject(obj: any): string {
    try {
      const serialized = JSON.stringify(obj);
      return createHash('sha256').update(serialized).digest('hex').substring(0, 32);
    } catch {
      return '';
    }
  }

  /**
   * Get cached response
   */
  async get(key: string): Promise<CachedResponse | null> {
    const cached = this.responseCache.get(key);
    
    if (cached && !this.isExpired(cached)) {
      // Update access stats
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      
      // Update cache analytics
      this.updateCacheAnalytics(key, 'hit');
      
      // Refresh TTL for popular items
      if (cached.accessCount > 5) {
        cached.expires = Date.now() + this.config.knowledgeTtl;
        logger.debug({ key, accessCount: cached.accessCount }, 'Refreshing TTL for popular cache entry');
      }
      
      return {
        content: cached.data,
        fromCache: true,
        cacheAge: Date.now() - cached.created,
      };
    }
    
    // Cache miss
    if (cached && this.isExpired(cached)) {
      this.responseCache.delete(key);
    }
    
    this.updateCacheAnalytics(key, 'miss');
    return null;
  }

  /**
   * Set cache entry
   */
  async set(key: string, response: any, request?: { message: string }): Promise<void> {
    // Don't cache if response contains errors
    if (this.isErrorResponse(response)) {
      return;
    }
    
    // Don't cache if request shouldn't be cached
    if (request && !this.shouldCache(request.message, response)) {
      return;
    }

    const ttl = this.determineTTL(request?.message || '');
    
    const entry: CacheEntry = {
      data: response,
      created: Date.now(),
      expires: Date.now() + ttl,
      accessCount: 0,
      lastAccessed: Date.now(),
    };
    
    this.responseCache.set(key, entry);
    this.cleanupExpired();
    
    logger.debug({ key, ttl: ttl / 1000 / 60 }, 'Cache entry created');
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expires;
  }

  /**
   * Determine if request should be cached
   */
  private shouldCache(message: string, response: any): boolean {
    // Don't cache if response contains personal data patterns
    if (this.containsPersonalData(response)) {
      return false;
    }
    
    // Don't cache real-time data requests
    if (this.isRealTimeQuery(message)) {
      return false;
    }
    
    // Cache knowledge queries, general responses
    return this.isKnowledgeQuery(message) || this.isGeneralQuery(message);
  }

  /**
   * Check if message is a knowledge query
   */
  private isKnowledgeQuery(message: string): boolean {
    const knowledgeIndicators = [
      'what is', 'how does', 'explain', 'define',
      'tell me about', 'describe', 'what are',
      'what was', 'who is', 'who are',
    ];
    
    const lowerMessage = message.toLowerCase();
    return knowledgeIndicators.some(indicator => 
      lowerMessage.includes(indicator)
    );
  }

  /**
   * Check if message is a general query
   */
  private isGeneralQuery(message: string): boolean {
    const generalIndicators = [
      'can you', 'help me', 'how to', 'how do i',
      'what should', 'which', 'where can',
    ];
    
    const lowerMessage = message.toLowerCase();
    return generalIndicators.some(indicator => 
      lowerMessage.includes(indicator)
    );
  }

  /**
   * Check if message is a real-time query
   */
  private isRealTimeQuery(message: string): boolean {
    const realTimeIndicators = [
      'now', 'current', 'today', 'this week',
      'latest', 'recent', 'just happened',
      'right now', 'happening now',
    ];
    
    const lowerMessage = message.toLowerCase();
    return realTimeIndicators.some(indicator => 
      lowerMessage.includes(indicator)
    );
  }

  /**
   * Check if response contains personal data
   */
  private containsPersonalData(response: any): boolean {
    if (typeof response !== 'string') return false;
    
    // Patterns that suggest personal data
    const personalPatterns = [
      /my (name|email|phone|address|password|secret)/i,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
      /\d{3}-\d{3}-\d{4}/, // Phone
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
    ];
    
    return personalPatterns.some(pattern => pattern.test(response));
  }

  /**
   * Check if response is an error
   */
  private isErrorResponse(response: any): boolean {
    if (typeof response === 'string') {
      return response.toLowerCase().includes('error') ||
             response.toLowerCase().includes('failed') ||
             response.toLowerCase().includes('unable');
    }
    return false;
  }

  /**
   * Determine TTL based on query type
   */
  private determineTTL(message: string): number {
    if (this.isKnowledgeQuery(message)) {
      return this.config.knowledgeTtl;
    }
    if (this.isGeneralQuery(message)) {
      return this.config.generalTtl;
    }
    return this.config.defaultTtl;
  }

  /**
   * Update cache analytics
   */
  private updateCacheAnalytics(key: string, event: 'hit' | 'miss'): void {
    const stats = this.analytics.get(key) || { hits: 0, misses: 0 };
    if (event === 'hit') {
      stats.hits++;
    } else {
      stats.misses++;
    }
    this.analytics.set(key, stats);
  }

  /**
   * Cleanup expired entries and enforce max size
   */
  private cleanupExpired(): void {
    // Remove expired entries
    const now = Date.now();
    for (const [key, entry] of this.responseCache.entries()) {
      if (entry.expires <= now) {
        this.responseCache.delete(key);
      }
    }
    
    // If still over max size, remove least recently accessed
    if (this.responseCache.size > this.config.maxSize) {
      const entries = Array.from(this.responseCache.entries());
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      const toRemove = entries.slice(0, entries.length - this.config.maxSize);
      toRemove.forEach(([key]) => this.responseCache.delete(key));
      
      logger.debug({ 
        removed: toRemove.length, 
        remaining: this.responseCache.size 
      }, 'Cache cleanup performed');
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalHits = 0;
    let totalMisses = 0;
    
    for (const stats of this.analytics.values()) {
      totalHits += stats.hits;
      totalMisses += stats.misses;
    }
    
    const hitRate = totalHits + totalMisses > 0 
      ? totalHits / (totalHits + totalMisses)
      : 0;
    
    return {
      hits: totalHits,
      misses: totalMisses,
      hitRate,
      totalEntries: this.responseCache.size,
      memoryUsage: this.responseCache.size * 1024, // Rough estimate
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.responseCache.clear();
    this.analytics.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get entry by key (for debugging)
   */
  getEntry(key: string): CacheEntry | undefined {
    return this.responseCache.get(key);
  }
}
