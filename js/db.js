const DB_NAME = 'gachi-fit';
const DB_VERSION = 1;
const STORES = ['exercises', 'workouts', 'sets', 'sensoryLogs'];

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
