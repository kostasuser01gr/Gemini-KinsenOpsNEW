import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'ops-copilot-v10';
const VERSION = 2;

export interface OfflineOp {
  id: string;
  type: 'kb_draft' | 'thread_note' | 'thread_status';
  payload: any;
  timestamp: number;
}

export async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('threads', { keyPath: 'id' });
        db.createObjectStore('kb_cache', { keyPath: 'id' });
        db.createObjectStore('preferences', { keyPath: 'user_id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('offline_queue', { keyPath: 'id' });
      }
    }
  });
}

export async function queueOfflineOp(op: Omit<OfflineOp, 'id' | 'timestamp'>) {
  const db = await getDB();
  const id = 'op_' + Date.now() + Math.random().toString(36).substring(2, 5);
  await db.put('offline_queue', { ...op, id, timestamp: Date.now() });
}

export async function getOfflineQueue(): Promise<OfflineOp[]> {
  const db = await getDB();
  return db.getAll('offline_queue');
}

export async function clearOfflineOp(id: string) {
  const db = await getDB();
  await db.delete('offline_queue', id);
}

export async function saveThreadsOffline(threads: any[]) {
  const db = await getDB();
  const tx = db.transaction('threads', 'readwrite');
  await tx.store.clear();
  for (const thread of threads) {
    await tx.store.put(thread);
  }
  await tx.done;
}

export async function getThreadsOffline() {
  const db = await getDB();
  return db.getAll('threads');
}
