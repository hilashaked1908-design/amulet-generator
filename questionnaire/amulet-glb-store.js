/**
 * amulet-glb-store.js
 *
 * IndexedDB persistence for amulet GLB binary data + lighting metadata.
 * Each entry stores { glb: ArrayBuffer, lighting: Object }.
 */

import { GLTFExporter } from './vendor/GLTFExporter.js';
import { GLTFLoader }   from './vendor/GLTFLoader.js';

const DB_NAME    = 'amuletGlbStore';
const DB_VERSION = 2;
const STORE_NAME = 'glbs';

/* ── IndexedDB helpers ────────────────────────────────── */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function idbAllKeys(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ── Light serialization ─────────────────────────────── */

function serializeLights(scene) {
  const THREE = window.__THREE_MODULE__;
  const lights = [];
  scene.traverse(function (obj) {
    if (!obj.isLight) return;
    const entry = {
      type: obj.type,
      color: obj.color ? obj.color.getHex() : 0xffffff,
      intensity: obj.intensity,
    };
    if (obj.position) {
      entry.position = [obj.position.x, obj.position.y, obj.position.z];
    }
    if (obj.isHemisphereLight && obj.groundColor) {
      entry.groundColor = obj.groundColor.getHex();
    }
    lights.push(entry);
  });
  return lights;
}

/* ── Public API ───────────────────────────────────────── */

/**
 * Export a Three.js scene to GLB + lighting metadata and save to IndexedDB.
 */
export async function saveGlb(amuletId, sceneOrObject, opts = {}) {
  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      sceneOrObject,
      (result) => resolve(result),
      (error)  => reject(error),
      { binary: true }
    );
  });

  const lighting = opts.lighting || serializeLights(sceneOrObject);
  const rendererSettings = opts.rendererSettings || {};
  const materialOverrides = opts.materialOverrides || [];

  const bundle = {
    glb: glbBuffer,
    lighting: lighting,
    rendererSettings: rendererSettings,
    materialOverrides: materialOverrides,
  };

  const db = await openDB();
  await idbPut(db, amuletId, bundle);
  db.close();
  console.log(`[glb-store] saved GLB for "${amuletId}" (${(glbBuffer.byteLength / 1024).toFixed(1)} KB, ${lighting.length} lights)`);
}

/**
 * Load a GLB + lighting from IndexedDB.
 * @returns {Promise<{ scene: THREE.Group, lighting: Array, rendererSettings: Object } | null>}
 */
export async function loadGlb(amuletId) {
  const db = await openDB();
  const raw = await idbGet(db, amuletId);
  db.close();
  if (!raw) return null;

  const buffer = raw instanceof ArrayBuffer ? raw : raw.glb;
  if (!buffer) return null;

  const loader = new GLTFLoader();
  const scene = await new Promise((resolve, reject) => {
    loader.parse(
      buffer, '',
      (gltf) => resolve(gltf.scene),
      (error) => reject(error)
    );
  });

  return {
    scene: scene,
    lighting: raw.lighting || [],
    rendererSettings: raw.rendererSettings || {},
    materialOverrides: raw.materialOverrides || [],
  };
}

/**
 * Delete a GLB from IndexedDB.
 */
export async function deleteGlb(amuletId) {
  const db = await openDB();
  await idbDelete(db, amuletId);
  db.close();
}

/**
 * List all stored amulet IDs.
 */
export async function listGlbKeys() {
  const db = await openDB();
  const keys = await idbAllKeys(db);
  db.close();
  return keys;
}

/**
 * Copy a GLB entry from one key to another.
 */
export async function copyGlb(fromId, toId) {
  const db = await openDB();
  const data = await idbGet(db, fromId);
  if (!data) { db.close(); return; }
  await idbPut(db, toId, data);
  db.close();
}

/**
 * Get raw stored data without parsing.
 */
export async function loadGlbRaw(amuletId) {
  const db = await openDB();
  const data = await idbGet(db, amuletId);
  db.close();
  return data || null;
}

/**
 * Save a high-res snapshot Blob to IndexedDB (separate from GLB data).
 */
export async function saveSnapshot(key, dataUrl) {
  const db = await openDB();
  await idbPut(db, 'snap-' + key, dataUrl);
  db.close();
}

/**
 * Load a snapshot data URL from IndexedDB.
 */
export async function loadSnapshot(key) {
  const db = await openDB();
  const data = await idbGet(db, 'snap-' + key);
  db.close();
  return data || null;
}
