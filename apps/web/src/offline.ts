import { openDB } from 'idb';

const DB_NAME = 'ops-copilot-offline';
const VERSION = 1;

export async function getDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      db.createObjectStore('threads', { keyPath: 'id' });
      db.createObjectStore('kb_cache', { keyPath: 'id' });
      db.createObjectStore('preferences', { keyPath: 'user_id' });
    }
  });
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
