const databaseName = 'arena-duel-storage';
const storeName = 'folder-handles';

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(indexedDB, mode, operation) {
  const database = await openDatabase(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      let result = null;
      request.onsuccess = () => { result = request.result ?? null; };
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve(result);
    });
  } finally { database.close(); }
}

export function createFolderHandleStore(indexedDB = globalThis.indexedDB) {
  return {
    async get() { if (!indexedDB) return null; return transaction(indexedDB, 'readonly', store => store.get('active')); },
    async put(value) { if (!indexedDB) throw new Error('IndexedDB unavailable');
      return transaction(indexedDB, 'readwrite', store => store.put(value, 'active')); }
  };
}
