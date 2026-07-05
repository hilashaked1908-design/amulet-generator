/**
 * Load bundled seed collection (Netlify / Render) into localStorage before other scripts run.
 */
const SEED_COLLECTION_URL = '/questionnaire/seed/collection.json';
const COLLECTION_KEY = 'amuletCollection';

function parseCollectionRaw(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function entryMergeKey(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.id != null) return 'id:' + entry.id;
  return 'fp:' + (entry.createdAt || 0);
}

function mergeCollectionEntries(a, b) {
  const byKey = new Map();
  for (const entry of [...a, ...b]) {
    const key = entryMergeKey(entry);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const prefer =
      (entry.snapshot && !existing.snapshot) ||
      (entry.glbUrl && !existing.glbUrl) ||
      (entry.createdAt || 0) > (existing.createdAt || 0)
        ? entry
        : existing;
    byKey.set(key, prefer);
  }
  return [...byKey.values()].sort(function (x, y) {
    return (x.createdAt || 0) - (y.createdAt || 0);
  });
}

function writeCollection(collection) {
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
    return true;
  } catch (_) {
    try {
      sessionStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
      return true;
    } catch (e) {
      console.warn('[seed-bootstrap] could not write collection', e);
      return false;
    }
  }
}

let seedPromise = null;

export function ensureSeedCollectionLoaded() {
  if (seedPromise) return seedPromise;
  seedPromise = fetch(SEED_COLLECTION_URL, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (seed) {
      if (!Array.isArray(seed) || !seed.length) return false;
      const local = parseCollectionRaw(
        localStorage.getItem(COLLECTION_KEY) || sessionStorage.getItem(COLLECTION_KEY)
      );
      const merged = local.length ? mergeCollectionEntries(local, seed) : seed;
      writeCollection(merged);
      window.__seedCollectionLoaded = true;
      console.log('[seed-bootstrap] loaded', seed.length, 'seed amulet(s)');
      return true;
    })
    .catch(function () {
      return false;
    });
  return seedPromise;
}
