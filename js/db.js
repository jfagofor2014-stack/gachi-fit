const DB_NAME = 'gachi-fit';
const DB_VERSION = 3;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs', 'photos', 'goals', 'bodyWeights', 'setPatterns', 'places'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode) {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function put(store, value) {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = os.put(value);
    r.onsuccess = () => resolve(value);
    r.onerror = () => reject(r.error);
  });
}

export async function getAll(store) {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = os.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function get(store, id) {
  const os = await tx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = os.get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function remove(store, id) {
  const os = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = os.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

const EXPORT_VERSION = 1;

export async function exportAll() {
  const data = {};
  for (const name of STORES) data[name] = await getAll(name);
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data };
}

export async function importAll(obj) {
  if (!obj || obj.version !== EXPORT_VERSION || !obj.data) {
    throw new Error('インポート形式が不正です');
  }
  for (const name of STORES) {
    const rows = obj.data[name];
    if (!Array.isArray(rows)) throw new Error(`データが不足: ${name}`);
    for (const row of rows) {
      if (!row || typeof row.id === 'undefined') throw new Error(`id欠損: ${name}`);
      await put(name, row);
    }
  }
}
