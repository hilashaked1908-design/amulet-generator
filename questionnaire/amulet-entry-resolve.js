/**
 * Authoritative entry → model resolution for detail page and save pipeline.
 * Every amulet is keyed by collection entry id (not display index).
 */

const SEED_COLLECTION_URL = '/questionnaire/seed/collection.json';

let seedEntryById = null;
let seedEntryByIdPromise = null;

export function loadLocalCollection() {
  if (typeof window.gardenLoadCollection === 'function') {
    return window.gardenLoadCollection();
  }
  try {
    const raw =
      localStorage.getItem('amuletCollection') || sessionStorage.getItem('amuletCollection');
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export function findCollectionEntryById(entryId, collection) {
  if (entryId == null) return null;
  const coll = collection || loadLocalCollection();
  for (let i = 0; i < coll.length; i += 1) {
    const entry = coll[i];
    if (entry && entry.id == entryId) return entry;
  }
  if (typeof window.pagmarFindCollectionEntryById === 'function') {
    return window.pagmarFindCollectionEntryById(entryId);
  }
  return null;
}

export async function ensureSeedEntryMap() {
  if (seedEntryById) return seedEntryById;
  if (seedEntryByIdPromise) return seedEntryByIdPromise;
  seedEntryByIdPromise = fetch(SEED_COLLECTION_URL, { cache: 'force-cache' })
    .then(function (res) {
      if (!res.ok) return [];
      return res.json();
    })
    .then(function (arr) {
      const map = new Map();
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i += 1) {
          const entry = arr[i];
          if (entry && entry.id != null) map.set(entry.id, entry);
        }
      }
      seedEntryById = map;
      return map;
    })
    .catch(function () {
      seedEntryById = new Map();
      return seedEntryById;
    });
  return seedEntryByIdPromise;
}

export function collectionIndexForEntryId(entryId, collection) {
  if (entryId == null) return -1;
  const coll = collection || loadLocalCollection();
  for (let i = 0; i < coll.length; i += 1) {
    if (coll[i] && coll[i].id == entryId) return i;
  }
  return -1;
}

export function displayLabelForEntryId(entryId, collection) {
  const base =
    typeof window.AMULET_QUESTIONS !== 'undefined'
      ? (window.AMULET_QUESTIONS || []).length
      : 8;
  const idx = collectionIndexForEntryId(entryId, collection);
  if (idx < 0) return null;
  return base + idx + 1;
}

export function canonicalSeedGlbUrl(entryId) {
  if (entryId == null) return null;
  return '/questionnaire/seed/glbs/' + entryId + '.glb';
}

export function canonicalSeedSnapshotUrl(entryId) {
  if (entryId == null) return null;
  return '/questionnaire/seed/snapshots/' + entryId + '.png';
}

/** Snapshot URL from a collection entry record (data URL, IDB-backed preview, or seed path). */
export function snapshotUrlFromEntryRecord(entryId, entryRecord) {
  if (!entryRecord || !entryRecord.snapshot) return null;
  const snap = String(entryRecord.snapshot);
  if (!snap) return null;
  if (snap.indexOf('data:') === 0 || snap.indexOf('blob:') === 0) return snap;
  if (snap.indexOf('/seed/snapshots/') !== -1) {
    return entryId != null && snap.indexOf('/' + entryId + '.') !== -1 ? snap : null;
  }
  if (entryId != null && snap.indexOf('/' + entryId + '.') !== -1) return snap;
  if (snap.indexOf('/questionnaire/seed/') !== 0) return snap;
  return null;
}

/** Sync snapshot URL for detail page — checks entry record and preloaded IDB cache. */
export function resolveDetailSnapshotUrlSync(entryId, entryRecord, seedMap) {
  const fromEntry = snapshotUrlFromEntryRecord(entryId, entryRecord);
  if (fromEntry) return fromEntry;

  if (
    typeof window !== 'undefined' &&
    window.__pagmarDetailSnapshotByEntryId &&
    window.__pagmarDetailSnapshotByEntryId[entryId]
  ) {
    return window.__pagmarDetailSnapshotByEntryId[entryId];
  }

  if (entryShouldUseBundledSeedGlb(entryId, seedMap, entryRecord)) {
    return canonicalSeedSnapshotUrl(entryId);
  }
  return null;
}

/** Async snapshot URL — also reads hi-res preview from IndexedDB. */
export async function resolveDetailSnapshotUrlAsync(entryId, entryRecord, seedMap) {
  const sync = resolveDetailSnapshotUrlSync(entryId, entryRecord, seedMap);
  if (sync) return sync;
  if (entryId == null) return null;
  try {
    const store = await import('./amulet-glb-store.js');
    const raw = await store.loadSnapshot('collection-' + entryId);
    if (raw) {
      if (typeof window !== 'undefined') {
        window.__pagmarDetailSnapshotByEntryId = window.__pagmarDetailSnapshotByEntryId || {};
        window.__pagmarDetailSnapshotByEntryId[entryId] = raw;
      }
      return raw;
    }
  } catch (_) {}
  return null;
}

export function glbUrlMatchesEntryId(glbUrl, entryId) {
  if (!glbUrl || entryId == null) return false;
  const id = String(entryId);
  return glbUrl.indexOf('/' + id + '.glb') !== -1;
}

export function isSeedCatalogEntry(entryId, seedMap) {
  return entryId != null && seedMap != null && seedMap.has(entryId);
}

export function entryLooksLikeSeed(entry, entryId, seedMap) {
  return isSeedCatalogEntry(entryId, seedMap);
}

export function entryShouldUseBundledSeedGlb(entryId, seedMap, entryRecord) {
  if (entryId == null) return false;
  if (isSeedCatalogEntry(entryId, seedMap)) return true;
  if (
    entryRecord &&
    entryRecord.glbUrl &&
    glbUrlMatchesEntryId(entryRecord.glbUrl, entryId) &&
    String(entryRecord.glbUrl).indexOf('/seed/glbs/') !== -1
  ) {
    return true;
  }
  return false;
}

export function bundledGlbUrlForEntry(entry, entryId, seedMap) {
  if (!isSeedCatalogEntry(entryId, seedMap)) return null;
  const canonical = canonicalSeedGlbUrl(entryId);
  if (entry && entry.glbUrl && !glbUrlMatchesEntryId(entry.glbUrl, entryId)) {
    console.warn(
      '[entry-resolve] ignoring mismatched glbUrl — using canonical seed path',
      { entryId: entryId, glbUrl: entry.glbUrl, canonical: canonical }
    );
  }
  return canonical;
}

/** Single GLB URL for detail page — seed entries only; user entries return null (use IDB). */
export function authoritativeGlbUrlForEntry(entryId, seedMap, entryRecord) {
  if (entryId == null) return null;
  if (!entryShouldUseBundledSeedGlb(entryId, seedMap, entryRecord)) return null;
  if (
    entryRecord &&
    entryRecord.glbUrl &&
    glbUrlMatchesEntryId(entryRecord.glbUrl, entryId) &&
    String(entryRecord.glbUrl).indexOf('/seed/glbs/') !== -1
  ) {
    return entryRecord.glbUrl;
  }
  return canonicalSeedGlbUrl(entryId);
}

export function readDetailNavForEntry(entryId) {
  if (entryId == null) return null;
  try {
    const raw = sessionStorage.getItem('pagmarAmuletDetailNav');
    if (!raw) return null;
    const nav = JSON.parse(raw);
    if (nav && nav.entryId == entryId) return nav;
  } catch (_) {}
  return null;
}

export function readDetailNavGlbUrl(entryId) {
  const nav = readDetailNavForEntry(entryId);
  if (!nav || !nav.glbUrl) return null;
  return glbUrlMatchesEntryId(nav.glbUrl, entryId) ? nav.glbUrl : null;
}

export function parseGlbUrlFromLocation(entryId) {
  if (entryId == null) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('glb');
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    return glbUrlMatchesEntryId(decoded, entryId) ? decoded : null;
  } catch (_) {
    return null;
  }
}

export function collectAuthoritativeGlbUrls(entryId, seedMap, entryRecord, navGlbUrl) {
  const urls = [];
  const seen = new Set();
  function push(url) {
    if (!url || !glbUrlMatchesEntryId(url, entryId) || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  }
  push(navGlbUrl);
  push(parseGlbUrlFromLocation(entryId));
  push(readDetailNavGlbUrl(entryId));
  if (entryRecord && entryRecord.glbUrl) push(entryRecord.glbUrl);
  push(authoritativeGlbUrlForEntry(entryId, seedMap, entryRecord));
  push(bundledGlbUrlForEntry(entryRecord, entryId, seedMap));
  if (
    isSeedCatalogEntry(entryId, seedMap) ||
    entryShouldUseBundledSeedGlb(entryId, seedMap, entryRecord)
  ) {
    push(canonicalSeedGlbUrl(entryId));
  }
  return urls;
}

export async function seedGlbFileExists(entryId) {
  const url = canonicalSeedGlbUrl(entryId);
  if (!url) return false;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export function authoritativeAnswersForEntry(entryId, collection) {
  if (entryId == null) return null;

  const entry = findCollectionEntryById(entryId, collection);
  if (entry && entry.answers && entry.answers.q1Wish) return entry.answers;

  if (
    window.__pagmarDetailAnswersByEntryId &&
    window.__pagmarDetailAnswersByEntryId[entryId] &&
    window.__pagmarDetailAnswersByEntryId[entryId].q1Wish
  ) {
    return window.__pagmarDetailAnswersByEntryId[entryId];
  }

  try {
    const navRaw = sessionStorage.getItem('pagmarAmuletDetailNav');
    if (navRaw) {
      const nav = JSON.parse(navRaw);
      if (nav && nav.entryId == entryId && nav.answers && nav.answers.q1Wish) {
        return nav.answers;
      }
    }
  } catch (_) {}

  return null;
}

export async function authoritativeAnswersForEntryAsync(entryId, collection) {
  const direct = authoritativeAnswersForEntry(entryId, collection);
  if (direct && direct.q1Wish) return direct;
  const record = await resolveEntryRecord(entryId);
  return record && record.answers ? record.answers : null;
}

/** Merge local collection entry with bundled seed catalog entry (glbUrl, snapshot). */
export async function resolveEntryRecord(entryId) {
  const seedMap = await ensureSeedEntryMap();
  const local = findCollectionEntryById(entryId);
  const seed = seedMap.get(entryId) || null;
  if (!local && !seed) return null;

  if (isSeedCatalogEntry(entryId, seedMap)) {
    const canonical = {
      id: entryId,
      glbUrl: canonicalSeedGlbUrl(entryId),
      snapshot: canonicalSeedSnapshotUrl(entryId),
    };
    if (!local) return Object.assign({}, seed, canonical);
    if (!seed) return Object.assign({}, local, canonical);
    return Object.assign({}, seed, local, canonical, {
      answers: local.answers && local.answers.q1Wish ? local.answers : seed.answers,
    });
  }

  return local || null;
}

export function glbStoreKeyForEntry(entryId) {
  return 'collection-' + entryId;
}
