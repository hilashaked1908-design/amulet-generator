/**
 * Temporary export-card PNG storage for QR share fallback (IndexedDB).
 */
const DB_NAME = 'pagmarExportShare';
const DB_VERSION = 1;
const STORE = 'png';

function openDb() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

export async function saveExportSharePng(id, blob) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = function () {
      db.close();
      resolve();
    };
    tx.onerror = function () {
      reject(tx.error);
    };
  });
}

export async function loadExportSharePng(id) {
  const db = await openDb();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = function () {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}
