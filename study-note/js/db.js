const DB_NAME = 'pe-study-note-db';
const DB_VERSION = 1;
const TOPIC_STORE = 'topics';
const META_STORE = 'meta';

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TOPIC_STORE)) {
        const store = db.createObjectStore(TOPIC_STORE, { keyPath: 'topicId' });
        store.createIndex('domainOrder', 'domainOrder', { unique: false });
        store.createIndex('domain', 'domain', { unique: false });
        store.createIndex('categoryCode', 'categoryCode', { unique: false });
        store.createIndex('studyTarget', 'studyTarget', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllTopics(db) {
  const tx = db.transaction(TOPIC_STORE, 'readonly');
  const rows = await requestToPromise(tx.objectStore(TOPIC_STORE).getAll());
  await transactionDone(tx);
  return rows;
}

export async function getTopic(db, topicId) {
  const tx = db.transaction(TOPIC_STORE, 'readonly');
  const row = await requestToPromise(tx.objectStore(TOPIC_STORE).get(topicId));
  await transactionDone(tx);
  return row || null;
}

export async function replaceAllTopics(db, topics, meta) {
  const tx = db.transaction([TOPIC_STORE, META_STORE], 'readwrite');
  const topicStore = tx.objectStore(TOPIC_STORE);
  const metaStore = tx.objectStore(META_STORE);

  topicStore.clear();
  for (const topic of topics) topicStore.put(topic);

  const metaEntries = {
    topicCount: topics.length,
    lastMasterSyncAt: meta.lastMasterSyncAt,
    serverGeneratedAt: meta.serverGeneratedAt || '',
    spreadsheetName: meta.spreadsheetName || '',
    sheetName: meta.sheetName || '',
    schemaVersion: meta.schemaVersion || 1,
  };

  for (const [key, value] of Object.entries(metaEntries)) {
    metaStore.put({ key, value });
  }

  await transactionDone(tx);
}

export async function getMeta(db, key, fallback = null) {
  const tx = db.transaction(META_STORE, 'readonly');
  const row = await requestToPromise(tx.objectStore(META_STORE).get(key));
  await transactionDone(tx);
  return row ? row.value : fallback;
}

export async function getAllMeta(db) {
  const tx = db.transaction(META_STORE, 'readonly');
  const rows = await requestToPromise(tx.objectStore(META_STORE).getAll());
  await transactionDone(tx);
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
}
