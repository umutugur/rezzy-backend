import TaxiDriver from "../models/TaxiDriver.js";
import MarketStore from "../models/MarketStore.js";
import Restaurant from "../models/Restaurant.js";
import Organization from "../models/Organization.js";
import User from "../models/User.js";

/**
 * On approval, create/activate the live business + owner role for the application's appType.
 * Idempotent: re-running does not duplicate. Returns { kind, id }.
 */
export async function materializeApproval(app) {
  const userId = app.user;
  const p = app.payload || {};

  // ── DRIVER ────────────────────────────────────────────────────────────────
  if (app.appType === "driver") {
    const lic = (app.documents || []).find((d) => d.requirementKey === "driving_license");
    const doc = await TaxiDriver.findOneAndUpdate(
      { user: userId },
      {
        $set: {
          vehiclePlate: p.plate,
          vehicleBrand: p.brand,
          vehicleModel: p.model,
          vehicleColor: p.color,
          vehicleType: String(p.type || "").toLowerCase(),
          acceptsPets: p.acceptsPets === true,
          isApproved: true,
          photoUrl: app.selfieUrl || "",
          licenseNumber: lic?.number || "",
          rejectionReason: null,
        },
      },
      { upsert: true, new: true }
    );
    return { kind: "driver", id: doc._id };
  }

  // ── MARKET ────────────────────────────────────────────────────────────────
  if (app.appType === "market") {
    // Idempotent: find existing store owned by this user
    let store = await MarketStore.findOne({ owner: userId }).select("_id").lean();
    if (!store) {
      // category must be one of the enum values; fall back to "supermarket" if not valid
      const VALID_MARKET_CATEGORIES = ["supermarket", "bakery", "greengrocer", "organic", "pharmacy"];
      const category = VALID_MARKET_CATEGORIES.includes(p.category) ? p.category : "supermarket";

      store = await MarketStore.create({
        name: p.businessName,
        category,
        address: p.address || "",
        location: p.location || { type: "Point", coordinates: [0, 0] },
        owner: userId,
        isActive: true,
        // Remaining required-by-schema fields all have schema defaults:
        // city:"", workingHours:{}, deliveryZoneKm:5, minOrderAmount:0,
        // deliveryFee:0, pickupEnabled:true, commissionRate:0.05
      });
    }
    await User.updateOne(
      { _id: userId, role: { $ne: "market_owner" } },
      { $set: { role: "market_owner" } }
    );
    return { kind: "market", id: store._id };
  }

  // ── RESTAURANT ────────────────────────────────────────────────────────────
  if (app.appType === "restaurant") {
    // Restaurant.organizationId is required — upsert a minimal org for this owner.
    // Region başvurunun ülkesinden gelir; eski region'sız org'lar da eşleşsin diye
    // isim bazlı arama iki şekli de kapsar.
    const orgRegion = String(app.countryCode || "").trim().toUpperCase() || null;
    const orgName = p.businessName || "Restaurant";
    let org = await Organization.findOne({
      name: orgName,
      ...(orgRegion ? { $or: [{ region: orgRegion }, { region: { $exists: false } }] } : { region: { $exists: false } }),
    })
      .select("_id")
      .lean();
    if (!org) {
      org = await Organization.create({ name: orgName, ...(orgRegion ? { region: orgRegion } : {}) });
    }

    // Idempotent: find existing restaurant owned by this user
    let r = await Restaurant.findOne({ owner: userId }).select("_id").lean();
    if (!r) {
      r = await Restaurant.create({
        owner: userId,
        organizationId: org._id,
        name: p.businessName,
        address: p.address || "",
        location: p.location || { type: "Point", coordinates: [0, 0] },
        isActive: true,
        // businessType defaults to "restaurant" per schema
        // status defaults to "active" per schema
        // all other fields have schema defaults or are optional
      });
    }

    // Grant panel access: set legacy restaurantId + add location_manager membership
    // + org_owner membership on the auto-created org (admin akışıyla tutarlı;
    // org sahipsiz kalmasın). Idempotent.
    const user = await User.findById(userId)
      .select("role restaurantId restaurantMemberships organizations")
      .exec();
    if (user) {
      user.role = "restaurant";
      user.restaurantId = r._id;

      if (!Array.isArray(user.restaurantMemberships)) {
        user.restaurantMemberships = [];
      }
      const alreadyMember = user.restaurantMemberships.some(
        (m) => String(m.restaurant) === String(r._id)
      );
      if (!alreadyMember) {
        user.restaurantMemberships.push({ restaurant: r._id, role: "location_manager" });
      }

      if (!Array.isArray(user.organizations)) {
        user.organizations = [];
      }
      const alreadyOrg = user.organizations.some(
        (m) => String(m.organization) === String(org._id)
      );
      if (!alreadyOrg) {
        user.organizations.push({ organization: org._id, role: "org_owner" });
      }

      await user.save();
    } else {
      // Fallback if user somehow not found
      await User.updateOne(
        { _id: userId },
        {
          $set: { role: "restaurant", restaurantId: r._id },
          $addToSet: { organizations: { organization: org._id, role: "org_owner" } },
        }
      );
    }

    return { kind: "restaurant", id: r._id };
  }

  throw new Error(`Unknown appType: ${app.appType}`);
}
