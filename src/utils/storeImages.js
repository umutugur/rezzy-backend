/**
 * Resolve a store's effective logo + photos with org-level fallback.
 * Branch values win; empty branch values fall back to the org defaults.
 * Pure + non-destructive.
 */
export function resolveStoreImages(store, org) {
  const logo = (store && store.logo) || (org && org.logoUrl) || null;
  const photos =
    store && Array.isArray(store.photos) && store.photos.length
      ? store.photos
      : (org && org.coverUrl ? [org.coverUrl] : []);
  return { logo, photos };
}
