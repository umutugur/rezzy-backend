import assert from "node:assert";
import { requiredKeys, isSubmittable, isApprovable, resetRejectedToPending } from "../utils/partnerApplication.logic.js";

const reqs = [
  { key: "driving_license", required: true, file: true },
  { key: "insurance", required: true, file: true },
  { key: "health_report", required: false, file: true },
];
assert.deepEqual(requiredKeys(reqs).sort(), ["driving_license", "insurance"]);

const okApp = { selfieUrl: "s", documents: [{ requirementKey: "driving_license", fileUrl: "a" }, { requirementKey: "insurance", fileUrl: "b" }] };
assert.equal(isSubmittable(okApp, reqs), true);
assert.equal(isSubmittable({ ...okApp, selfieUrl: "" }, reqs), false, "selfie zorunlu");
assert.equal(isSubmittable({ selfieUrl: "s", documents: [{ requirementKey: "driving_license", fileUrl: "a" }] }, reqs), false, "eksik zorunlu belge");

const verified = { documents: [{ requirementKey: "driving_license", status: "verified" }, { requirementKey: "insurance", status: "verified" }] };
assert.equal(isApprovable(verified, reqs), true);
assert.equal(isApprovable({ documents: [{ requirementKey: "driving_license", status: "verified" }, { requirementKey: "insurance", status: "rejected" }] }, reqs), false);

const after = resetRejectedToPending([
  { requirementKey: "driving_license", status: "verified" },
  { requirementKey: "insurance", status: "rejected", rejectReason: "bulanık" },
]);
assert.equal(after[0].status, "verified");
assert.equal(after[1].status, "pending");
assert.equal(after[1].rejectReason, null);

console.log("ok: partnerApplication.logic (4 groups)");
