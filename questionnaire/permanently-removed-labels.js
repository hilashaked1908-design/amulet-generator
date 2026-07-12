/**
 * Legacy display labels that were removed once by index (buggy — deleted any amulet at
 * that slot on every refresh). Do not purge collection entries by label/index on load.
 */
export const PERMANENTLY_REMOVED_LABELS = [30, 33, 34];

/** Entry ids to hide/remove — authoritative; never derived from collection index. */
export const PERMANENTLY_REMOVED_ENTRY_IDS = [];

export function isPermanentlyRemovedLabel(label) {
  const n = Number(label);
  return Number.isFinite(n) && PERMANENTLY_REMOVED_LABELS.includes(n);
}

export function isPermanentlyRemovedEntryId(entryId) {
  if (entryId == null) return false;
  const n = Number(entryId);
  return Number.isFinite(n) && PERMANENTLY_REMOVED_ENTRY_IDS.includes(n);
}
