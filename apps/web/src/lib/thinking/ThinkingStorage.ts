/**
 * ThinkingStorage - IndexedDB layer for caching thinking patterns
 * Enables offline-first functionality and fast pattern retrieval
 */

interface StoredPattern {
  id: string;
  category: string;
  patterns: string[][];
  timestamp: number;
  version: number;
}

interface StoredQueryCache {
  queryHash: string;
  category: string;
  keywords: string[];
  timestamp: number;
}

export class ThinkingStorage {
  private dbName = 'thinking-engine-db';
  private version = 1;
  private db: IDBDatabase | null = null;

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Failed to open thinking database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains('patterns')) {
          const patternStore = db.createObjectStore('patterns', { keyPath: 'id' });
          patternStore.createIndex('category', 'category', { unique: false });
          patternStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('queryCache')) {
          const cacheStore = db.createObjectStore('queryCache', { keyPath: 'queryHash' });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store thinking patterns
   */
  async storePattern(pattern: StoredPattern): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['patterns'], 'readwrite');
      const store = transaction.objectStore('patterns');
      const request = store.put(pattern);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieve patterns by category
   */
  async getPatternsByCategory(category: string): Promise<StoredPattern[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['patterns'], 'readonly');
      const store = transaction.objectStore('patterns');
      const index = store.index('category');
      const request = index.getAll(category);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cache query classification results
   */
  async cacheQuery(cache: StoredQueryCache): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queryCache'], 'readwrite');
      const store = transaction.objectStore('queryCache');
      const request = store.put(cache);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cached query classification
   */
  async getCachedQuery(queryHash: string): Promise<StoredQueryCache | null> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queryCache'], 'readonly');
      const store = transaction.objectStore('queryCache');
      const request = store.get(queryHash);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clean old cache entries (older than 7 days)
   */
  async cleanOldCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.db) await this.initialize();

    const cutoffTime = Date.now() - maxAge;
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['queryCache'], 'readwrite');
      const store = transaction.objectStore('queryCache');
      const index = store.index('timestamp');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    patternCount: number;
    cacheSize: number;
    storageEstimate?: StorageEstimate;
  }> {
    if (!this.db) await this.initialize();

    const patternCount = await this.countRecords('patterns');
    const cacheSize = await this.countRecords('queryCache');

    let storageEstimate: StorageEstimate | undefined;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      storageEstimate = await navigator.storage.estimate();
    }

    return {
      patternCount,
      cacheSize,
      storageEstimate
    };
  }

  /**
   * Count records in a store
   */
  private async countRecords(storeName: string): Promise<number> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['patterns', 'queryCache', 'metadata'], 'readwrite');

      transaction.objectStore('patterns').clear();
      transaction.objectStore('queryCache').clear();
      transaction.objectStore('metadata').clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Export data for backup
   */
  async exportData(): Promise<{
    patterns: StoredPattern[];
    queryCache: StoredQueryCache[];
  }> {
    if (!this.db) await this.initialize();

    const patterns = await this.getAllFromStore<StoredPattern>('patterns');
    const queryCache = await this.getAllFromStore<StoredQueryCache>('queryCache');

    return { patterns, queryCache };
  }

  /**
   * Import data from backup
   */
  async importData(data: {
    patterns: StoredPattern[];
    queryCache: StoredQueryCache[];
  }): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['patterns', 'queryCache'], 'readwrite');

      const patternStore = transaction.objectStore('patterns');
      const cacheStore = transaction.objectStore('queryCache');

      // Import patterns
      for (const pattern of data.patterns) {
        patternStore.put(pattern);
      }

      // Import cache
      for (const cache of data.queryCache) {
        cacheStore.put(cache);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get all records from a store
   */
  private async getAllFromStore<T>(storeName: string): Promise<T[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
let storageInstance: ThinkingStorage | null = null;

export function getThinkingStorage(): ThinkingStorage {
  if (!storageInstance) {
    storageInstance = new ThinkingStorage();
  }
  return storageInstance;
}

/**
 * Simple hash function for query caching
 */
export function hashQuery(query: string): string {
  let hash = 0;
  const normalized = query.toLowerCase().trim();

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return hash.toString(36);
}
