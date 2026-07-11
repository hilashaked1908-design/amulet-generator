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
 * Load a GLB + lighting.
 * User amulets: IndexedDB first (archived GLB is authoritative).
 * Bundled seeds (preferBundledSeed / glbUrl): bundled file only — never stale IDB.
 */
export async function loadGlb(amuletId, opts) {
  opts = opts || {};
  const preferBundledSeed = Boolean(opts.preferBundledSeed || opts.glbUrl);

  async function fromBundled() {
    if (opts.glbUrl) return loadGlbFromUrl(opts.glbUrl);
    return loadGlbFromSeed(amuletId);
  }

  if (preferBundledSeed) {
    return fromBundled();
  }

  const fromIdb = await loadGlbFromIdb(amuletId);
  if (fromIdb) return fromIdb;
  return null;
}

/** Load the archived GLB for a user collection entry (IndexedDB only). */
export async function loadUserEntryGlb(entryId) {
  if (entryId == null) return null;
  return loadGlbFromIdb('collection-' + entryId);
}

/** Load a bundled seed GLB from its canonical URL (never IndexedDB). */
export async function loadBundledSeedGlb(glbUrl, entryId) {
  if (!glbUrl) return null;
  if (entryId != null && !String(glbUrl).includes('/' + entryId + '.glb')) {
    console.error('[glb-store] refusing GLB — URL does not match entryId', {
      entryId: entryId,
      glbUrl: glbUrl,
    });
    return null;
  }
  return loadGlbFromUrl(glbUrl);
}

export async function loadGlbFromIdb(amuletId) {
  const db = await openDB();
  const raw = await idbGet(db, amuletId);
  db.close();
  if (!raw) return null;

  const buffer = raw instanceof ArrayBuffer ? raw : raw.glb;
  if (!buffer) return null;

  const bufferHash = await hashArrayBuffer(buffer);
  const byteLength = buffer.byteLength;

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
    bufferHash: bufferHash,
    byteLength: byteLength,
  };
}

function seedIdFromAmuletId(amuletId) {
  if (!amuletId || typeof amuletId !== 'string') return null;
  const m = amuletId.match(/^collection-(\d+)$/);
  return m ? m[1] : null;
}

export async function loadGlbFromUrl(glbUrl) {
  if (!glbUrl || typeof glbUrl !== 'string') return null;

  const metaUrl = glbUrl.replace(/\.glb(\?.*)?$/i, '.json');

  let glbRes;
  try {
    glbRes = await fetch(glbUrl, { cache: 'force-cache' });
  } catch (_) {
    return null;
  }
  if (!glbRes.ok) return null;

  const buffer = await glbRes.arrayBuffer();
  const bufferHash = await hashArrayBuffer(buffer);
  const byteLength = buffer.byteLength;
  let meta = {};
  try {
    const metaRes = await fetch(metaUrl, { cache: 'force-cache' });
    if (metaRes.ok) meta = await metaRes.json();
  } catch (_) {}

  const loader = new GLTFLoader();
  const scene = await new Promise((resolve, reject) => {
    loader.parse(
      buffer, '',
      (gltf) => resolve(gltf.scene),
      (error) => reject(error)
    );
  });

  console.log('[glb-store] loaded GLB from URL', glbUrl, {
    sha256: bufferHash,
    bytes: byteLength,
  });
  return {
    scene: scene,
    lighting: meta.lighting || [],
    rendererSettings: meta.rendererSettings || {},
    materialOverrides: meta.materialOverrides || [],
    bufferHash: bufferHash,
    byteLength: byteLength,
  };
}

async function loadGlbFromSeed(amuletId) {
  const seedId = seedIdFromAmuletId(amuletId);
  if (!seedId) return null;
  return loadGlbFromUrl('/questionnaire/seed/glbs/' + seedId + '.glb');
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

/** SHA-256 hex digest (FNV-1a fallback when subtle crypto unavailable). */
export async function hashArrayBuffer(buffer) {
  if (!buffer) return null;
  if (globalThis.crypto && globalThis.crypto.subtle) {
    try {
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hash))
        .map(function (b) {
          return b.toString(16).padStart(2, '0');
        })
        .join('');
    } catch (_) {}
  }
  const view = new Uint8Array(buffer);
  let h = 2166136261;
  for (let i = 0; i < view.length; i += 1) {
    h ^= view[i];
    h = Math.imul(h, 16777619);
  }
  return 'fnv1a-' + (h >>> 0).toString(16);
}

/** Entry ids already used in local collection and IndexedDB `collection-*` keys. */
export async function collectUsedEntryIds() {
  const ids = new Set();
  try {
    if (typeof window.gardenLoadCollection === 'function') {
      window.gardenLoadCollection().forEach(function (entry) {
        if (entry && entry.id != null) ids.add(Number(entry.id));
      });
    }
  } catch (_) {}
  try {
    const raw =
      localStorage.getItem('amuletCollection') || sessionStorage.getItem('amuletCollection');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach(function (entry) {
          if (entry && entry.id != null) ids.add(Number(entry.id));
        });
      }
    }
  } catch (_) {}
  try {
    const keys = await listGlbKeys();
    keys.forEach(function (key) {
      if (typeof key !== 'string' || !key.startsWith('collection-')) return;
      const n = parseInt(key.slice('collection-'.length), 10);
      if (Number.isFinite(n)) ids.add(n);
    });
  } catch (_) {}
  return ids;
}

/** Allocate an entry id that is not already in collection or IndexedDB. */
export async function allocateUniqueEntryId() {
  const used = await collectUsedEntryIds();
  let id = Date.now();
  let bump = 0;
  while (used.has(id) && bump < 10000) {
    bump += 1;
    id = Date.now() + bump;
  }
  if (used.has(id)) {
    id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    while (used.has(id)) id += 1;
  }
  if (bump > 0) {
    console.warn('[glb-store] entryId collision avoided — bumped to', id, '(attempts:', bump + ')');
  }
  return id;
}

export async function entryStoreKeyExists(entryId) {
  if (entryId == null) return false;
  const raw = await loadGlbRaw('collection-' + entryId);
  return Boolean(raw && raw.glb);
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
  if (data) return data;

  const m = String(key || '').match(/^collection-(\d+)$/);
  if (!m) return null;
  const hiUrl = '/questionnaire/seed/snapshots/' + m[1] + '.png';
  try {
    const res = await fetch(hiUrl, { cache: 'force-cache' });
    if (!res.ok) {
      const jpgUrl = '/questionnaire/seed/snapshots/' + m[1] + '.jpg';
      const res2 = await fetch(jpgUrl, { cache: 'force-cache' });
      if (!res2.ok) return null;
      const blob = await res2.blob();
      return await new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    const blob = await res.blob();
    return await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (_) {
    return null;
  }
}
