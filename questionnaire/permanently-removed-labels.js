/** Display labels removed from collection, garden, filters, and IndexedDB on every load. */
export const PERMANENTLY_REMOVED_LABELS = [33, 34];

export function isPermanentlyRemovedLabel(label) {
  const n = Number(label);
  return Number.isFinite(n) && PERMANENTLY_REMOVED_LABELS.includes(n);
}
