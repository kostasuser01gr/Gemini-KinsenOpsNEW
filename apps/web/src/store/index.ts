import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'ops-db';
const DB_VERSION = 2;

export interface ThreadRecord {
  id: string;
  title: string;
  status: string;
  last_sync: string;
}

export interface MessageRecord {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  model_id?: string;
}

export interface OfflineQueueRecord {
  id: string;
  scope: 'chat_message' | 'fleet_upload' | 'thread_status' | 'kb_draft';
  payload: Record<string, unknown>;
  status: 'queued' | 'replaying' | 'failed';
  retry_count: number;
  next_retry_at: number;
  created_at: number;
}

interface OpsSchema extends DBSchema {
  threads: {
    key: string;
    value: ThreadRecord;
    indexes: {
      'by-sync': string;
    };
  };
  messages: {
    key: string;
    value: MessageRecord;
    indexes: {
      'by-thread': string;
      'by-thread-created': [string, string];
      'by-created': string;
    };
  };
  kb: {
    key: string;
    value: {
      id: string;
      title: string;
      body_text: string;
      last_sync: string;
    };
    indexes: {
      'by-sync': string;
    };
  };
  offline_queue: {
    key: string;
    value: OfflineQueueRecord;
    indexes: {
      'by-status': string;
      'by-next-retry': number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<OpsSchema>> | null = null;

export async function initDB(): Promise<IDBPDatabase<OpsSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OpsSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains('threads')) {
          const threadStore = db.createObjectStore('threads', { keyPath: 'id' });
          threadStore.createIndex('by-sync', 'last_sync');
        }

        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('by-thread', 'thread_id');
          messageStore.createIndex('by-thread-created', ['thread_id', 'created_at']);
          messageStore.createIndex('by-created', 'created_at');
        } else if (oldVersion < 2) {
          const messageStore = transaction.objectStore('messages');
          if (!messageStore.indexNames.contains('by-thread-created')) {
            messageStore.createIndex('by-thread-created', ['thread_id', 'created_at']);
          }
          if (!messageStore.indexNames.contains('by-created')) {
            messageStore.createIndex('by-created', 'created_at');
          }
        }

        if (!db.objectStoreNames.contains('kb')) {
          const kbStore = db.createObjectStore('kb', { keyPath: 'id' });
          kbStore.createIndex('by-sync', 'last_sync');
        }

        if (!db.objectStoreNames.contains('offline_queue')) {
          const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
          queueStore.createIndex('by-status', 'status');
          queueStore.createIndex('by-next-retry', 'next_retry_at');
        }
      },
    });
  }

  return dbPromise;
}

export async function saveThreads(threads: ThreadRecord[]) {
  const db = await initDB();
  const tx = db.transaction('threads', 'readwrite');
  for (const thread of threads) {
    await tx.store.put({ ...thread, last_sync: thread.last_sync || new Date().toISOString() });
  }
  await tx.done;
}

export async function getThreads() {
  const db = await initDB();
  return db.getAll('threads');
}

export async function saveMessages(messages: MessageRecord[]) {
  const db = await initDB();
  const tx = db.transaction('messages', 'readwrite');
  for (const msg of messages) {
    await tx.store.put(msg);
  }
  await tx.done;
}

export async function getMessagesByThread(threadId: string) {
  const db = await initDB();
  return db.getAllFromIndex('messages', 'by-thread', threadId);
}

export async function getMessagesPageByThread(threadId: string, limit = 50, beforeCreatedAt?: string) {
  const db = await initDB();
  const tx = db.transaction('messages');
  const index = tx.store.index('by-thread-created');
  const range = beforeCreatedAt
    ? IDBKeyRange.bound([threadId, ''], [threadId, beforeCreatedAt], false, true)
    : IDBKeyRange.bound([threadId, ''], [threadId, '\uffff']);

  const rows = await index.getAll(range, limit);
  return rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export async function queueOfflineOp(
  scope: OfflineQueueRecord['scope'],
  payload: Record<string, unknown>,
): Promise<OfflineQueueRecord> {
  const db = await initDB();
  const op: OfflineQueueRecord = {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scope,
    payload,
    status: 'queued',
    retry_count: 0,
    next_retry_at: Date.now(),
    created_at: Date.now(),
  };
  await db.put('offline_queue', op);
  return op;
}

export async function getOfflineQueue(now = Date.now()): Promise<OfflineQueueRecord[]> {
  const db = await initDB();
  const all = await db.getAll('offline_queue');
  return all.filter((item) => item.next_retry_at <= now).sort((a, b) => a.next_retry_at - b.next_retry_at);
}

export async function updateOfflineOp(op: OfflineQueueRecord) {
  const db = await initDB();
  await db.put('offline_queue', op);
}

export async function clearOfflineOp(id: string) {
  const db = await initDB();
  await db.delete('offline_queue', id);
}
