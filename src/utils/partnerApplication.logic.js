/** Pure helpers for driver-application state. No DB access. */

export function requiredKeys(requirements) {
  return requirements.filter((r) => r.required).map((r) => r.key);
}

/** All required docs have a fileUrl AND a selfie is present. */
export function isSubmittable(application, requirements) {
  if (!application || !application.selfieUrl) return false;
  const byKey = new Map((application.documents || []).map((d) => [d.requirementKey, d]));
  return requiredKeys(requirements).every((k) => {
    const d = byKey.get(k);
    return !!(d && d.fileUrl);
  });
}

/** All required docs are status === "verified". */
export function isApprovable(application, requirements) {
  const byKey = new Map((application?.documents || []).map((d) => [d.requirementKey, d]));
  return requiredKeys(requirements).every((k) => byKey.get(k)?.status === "verified");
}

/** Return docs with any rejected ones reset to pending (clears rejectReason). Non-destructive. */
export function resetRejectedToPending(documents) {
  return (documents || []).map((d) =>
    d.status === "rejected" ? { ...d, status: "pending", rejectReason: null } : d
  );
}
