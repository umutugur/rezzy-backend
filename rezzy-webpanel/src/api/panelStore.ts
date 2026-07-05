// Shared module-level state for the market panel's currently-selected store.
// Kept separate from marketDesktop.ts / marketCampaigns.ts / marketBranchOverride.ts
// to avoid circular imports between those API modules.

let panelStoreId: string | null = null;

export function setPanelStoreId(id: string | null) {
  panelStoreId = id;
}

export function getPanelStoreId(): string | null {
  return panelStoreId;
}

// Merge storeId into GET params (or any params object) when one is selected.
export function withStore<T extends Record<string, unknown> | undefined>(
  params?: T
): (T & { storeId?: string }) | { storeId?: string } {
  const base = (params ?? {}) as Record<string, unknown>;
  return panelStoreId ? { ...base, storeId: panelStoreId } : (base as any);
}
