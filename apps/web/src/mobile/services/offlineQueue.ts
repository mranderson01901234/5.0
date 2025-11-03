import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface QueuedMessage {
  id: string;
  threadId: string;
  content: string;
  timestamp: number;
  retryCount: number;
}

interface OfflineQueueDB extends DBSchema {
  messages: {
    key: string;
    value: QueuedMessage;
    indexes: { 'by-timestamp': number };
  };
}

const DB_NAME = 'mobile-chat-queue';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineQueueDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OfflineQueueDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineQueueDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

export async function queueMessage(
  content: string,
  threadId: string = 'mobile'
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const message: QueuedMessage = {
    id,
    threadId,
    content,
    timestamp: Date.now(),
    retryCount: 0,
  };

  await db.add('messages', message);
  return id;
}

export async function getQueuedMessages(): Promise<QueuedMessage[]> {
  const db = await getDB();
  return db.getAllFromIndex('messages', 'by-timestamp');
}

export async function removeQueuedMessage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('messages', id);
}

export async function incrementRetryCount(id: string): Promise<void> {
  const db = await getDB();
  const message = await db.get('messages', id);
  if (message) {
    message.retryCount += 1;
    await db.put('messages', message);
  }
}

export async function clearQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('messages');
}

export async function getQueueSize(): Promise<number> {
  const db = await getDB();
  return db.count('messages');
}
