// Pure helpers for market panel store access (DB-free; unit tested).

/** @returns Map<storeIdString, "owner"|"manager"> — owner wins on conflicts */
export function buildAccessSet(ownedStores, marketMemberships) {
  const set = new Map();
  for (const m of Array.isArray(marketMemberships) ? marketMemberships : []) {
    const id = String(m?.store?._id ?? m?.store ?? "");
    if (id) set.set(id, "manager");
  }
  for (const s of Array.isArray(ownedStores) ? ownedStores : []) {
    const id = String(s?._id ?? s ?? "");
    if (id) set.set(id, "owner");
  }
  return set;
}

/**
 * @returns {{storeId,access}|null|undefined}
 *  null      -> forbidden / no access
 *  undefined -> multiple stores, explicit storeId required
 */
export function pickStore(accessSet, storeId) {
  if (storeId != null && storeId !== "") {
    const key = String(storeId);
    return accessSet.has(key) ? { storeId: key, access: accessSet.get(key) } : null;
  }
  if (accessSet.size === 0) return null;
  if (accessSet.size === 1) {
    const [k, v] = accessSet.entries().next().value;
    return { storeId: k, access: v };
  }
  return undefined;
}
