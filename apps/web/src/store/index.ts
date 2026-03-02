import { openDB, IDBPDatabase } from 'idb';

interface OpsSchema {
  threads: {
    key: string;
    value: {
      id: string;
      title: string;
      status: string;
      last_sync: string;
    };
    indexes: { 'by-sync': string };
  };
  messages: {
    key: string;
    value: {
      id: string;
      thread_id: string;
      role: string;
      content: string;
      created_at: string;
    };
    indexes: { 'by-thread': string };
  };
  kb: {
    key: string;
    value: {
      id: string;
      title: string;
      body_text: string;
      last_sync: string;
    };
    indexes: { 'by-sync': string };
  };
}

let db: IDBPDatabase<OpsSchema>;

export const initDB = async () => {
  db = await openDB<OpsSchema>('ops-db', 1, {
    upgrade(db) {
      const threadStore = db.createObjectStore('threads', { keyPath: 'id' });
      threadStore.createIndex('by-sync', 'last_sync');

      const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
      messageStore.createIndex('by-thread', 'thread_id');

      const kbStore = db.createObjectStore('kb', { keyPath: 'id' });
      kbStore.createIndex('by-sync', 'last_sync');
    },
  });
};

export const saveThreads = async (threads: any[]) => {
  const tx = db.transaction('threads', 'readwrite');
  for (const thread of threads) {
    await tx.store.put({ ...thread, last_sync: new Date().toISOString() });
  }
  await tx.done;
};

export const getThreads = async () => {
  return db.getAll('threads');
};

export const saveMessages = async (messages: any[]) => {
  const tx = db.transaction('messages', 'readwrite');
  for (const msg of messages) {
    await tx.store.put(msg);
  }
  await tx.done;
};

export const getMessagesByThread = async (threadId: string) => {
  return db.getAllFromIndex('messages', 'by-thread', threadId);
};
