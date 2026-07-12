/**
 * Load bundled seed collection (Netlify / Render) into localStorage before other scripts run.
 */
import { isPermanentlyRemovedEntryId } from './permanently-removed-labels.js';
import { glbUrlMatchesEntryId } from './amulet-entry-resolve.js';

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
    const other = prefer === entry ? existing : entry;
    const merged = Object.assign({}, prefer);
    if (
      other.glbUrl &&
      prefer.id != null &&
      glbUrlMatchesEntryId(other.glbUrl, prefer.id) &&
      String(other.glbUrl).indexOf('/seed/glbs/') !== -1 &&
      (!merged.glbUrl || !glbUrlMatchesEntryId(merged.glbUrl, prefer.id))
    ) {
      merged.glbUrl = other.glbUrl;
    }
    if (
      other.snapshot &&
      String(other.snapshot).indexOf('/seed/snapshots/') !== -1 &&
      (!merged.snapshot ||
        String(merged.snapshot).indexOf('data:') === 0 ||
        !merged.snapshot)
    ) {
      merged.snapshot = other.snapshot;
      if (other.snapshotInIdb === false) merged.snapshotInIdb = false;
    }
    byKey.set(key, merged);
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

function filterPermanentlyRemovedEntries(collection) {
  const removed = [];
  const kept = collection.filter(function (entry) {
    if (entry && isPermanentlyRemovedEntryId(entry.id)) {
      removed.push(entry);
      return false;
    }
    return true;
  });
  return { kept: kept, removed: removed };
}

export function ensureSeedCollectionLoaded() {
  if (seedPromise) return seedPromise;
  seedPromise = fetch(SEED_COLLECTION_URL, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(async function (seed) {
      if (!Array.isArray(seed) || !seed.length) return false;
      const local = parseCollectionRaw(
        localStorage.getItem(COLLECTION_KEY) || sessionStorage.getItem(COLLECTION_KEY)
      );
      const merged = local.length ? mergeCollectionEntries(local, seed) : seed;
      const { kept, removed } = filterPermanentlyRemovedEntries(merged);
      if (removed.length) {
        try {
          const { deleteGlb } = await import('./amulet-glb-store.js');
          await Promise.all(
            removed.flatMap(function (entry) {
              if (!entry || entry.id == null) return [];
              const id = entry.id;
              const snapKey = 'collection-' + id;
              return [
                deleteGlb(snapKey).catch(function () {}),
                deleteGlb('snap-' + snapKey).catch(function () {}),
                deleteGlb('snap-composed3d-' + id).catch(function () {}),
                deleteGlb('snap-answers-collection-' + id).catch(function () {}),
              ];
            })
          );
        } catch (_) {}
      }
      writeCollection(kept);
      window.__seedCollectionLoaded = true;
      console.log('[seed-bootstrap] loaded', seed.length, 'seed amulet(s)');
      return true;
    })
    .catch(function () {
      return false;
    });
  return seedPromise;
}
