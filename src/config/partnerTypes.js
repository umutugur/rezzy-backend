export const PARTNER_TYPES = ["driver", "market", "restaurant"];

export const REQUIRED_PAYLOAD = {
  driver: ["plate", "brand", "model", "color", "type"],
  market: ["businessName", "category", "address", "location"],
  restaurant: ["businessName", "category", "address", "location"],
};

export function isValidAppType(t) {
  return PARTNER_TYPES.includes(t);
}

/** true if every required payload field for appType is present & non-empty. location must have coordinates[2]. */
export function hasRequiredPayload(appType, payload) {
  const fields = REQUIRED_PAYLOAD[appType] || [];
  return fields.every((f) => {
    const v = payload?.[f];
    if (f === "location") return !!(v && Array.isArray(v.coordinates) && v.coordinates.length === 2);
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
}
