const DB_NAME = 'sidecar-console';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/**
 * Minimal IndexedDB key-value store for values too large or non-stringifiable
 * for localStorage (Files, Blobs, big results). All operations degrade to
 * no-ops when IndexedDB is unavailable (tests, private browsing).
 */
export async function idbGet<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  try {
    return await withStore('readonly', (store) => store.get(key) as IDBRequest<T>);
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withStore('readwrite', (store) => store.put(value, key));
  } catch {
    // quota exceeded or storage unavailable — state still works in memory
  }
}
