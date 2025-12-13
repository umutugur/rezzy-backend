// controllers/branchMenuOverride.controller.js
import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import OrgMenuCategory from "../models/OrgMenuCategory.js";
import OrgMenuItem from "../models/OrgMenuItem.js";
import BranchMenuOverride from "../models/BranchMenuOverride.js";

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

async function assertRestaurantOrg(rid) {
  const rest = await Restaurant.findById(rid)
    .select("_id organizationId")
    .lean();

  if (!rest) return { ok: false, status: 404, message: "Restaurant not found" };
  if (!rest.organizationId)
    return {
      ok: false,
      status: 400,
      message: "Restaurant is not attached to any organization",
    };

  return { ok: true, rest };
}

// PATCH /api/panel/restaurants/:rid/menu/overrides/categories/:orgCategoryId
export const upsertCategoryOverride = async (req, res, next) => {
  try {
    const { rid, orgCategoryId } = req.params;

    if (!isValidId(rid) || !isValidId(orgCategoryId)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const chk = await assertRestaurantOrg(rid);
    if (!chk.ok) return res.status(chk.status).json({ message: chk.message });

    const orgCat = await OrgMenuCategory.findOne({
      _id: orgCategoryId,
      organizationId: chk.rest.organizationId,
    })
      .select("_id")
      .lean();

    if (!orgCat) {
      return res
        .status(404)
        .json({ message: "Org category not found for this organization" });
    }

    const { hidden, order } = req.body || {};
    const $set = {};

    if (typeof hidden === "boolean") $set.hidden = hidden;

    if (order != null) {
      const n = Number(order);
      if (!Number.isNaN(n)) $set.order = n;
    }

    const doc = await BranchMenuOverride.findOneAndUpdate(
      { restaurantId: rid, targetType: "category", targetId: orgCat._id },
      {
        $set,
        $setOnInsert: {
          restaurantId: rid,
          targetType: "category",
          targetId: orgCat._id,
        },
      },
      { new: true, upsert: true }
    ).lean();

    return res.json({ ok: true, override: doc });
  } catch (e) {
    next(e);
  }
};

// PATCH /api/panel/restaurants/:rid/menu/overrides/items/:orgItemId
export const upsertItemOverride = async (req, res, next) => {
  try {
    const { rid, orgItemId } = req.params;

    if (!isValidId(rid) || !isValidId(orgItemId)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const chk = await assertRestaurantOrg(rid);
    if (!chk.ok) return res.status(chk.status).json({ message: chk.message });

    const orgItem = await OrgMenuItem.findOne({
      _id: orgItemId,
      organizationId: chk.rest.organizationId,
    })
      .select("_id defaultPrice")
      .lean();

    if (!orgItem) {
      return res
        .status(404)
        .json({ message: "Org item not found for this organization" });
    }

    const { hidden, order, price, isAvailable } = req.body || {};
    const $set = {};

    if (typeof hidden === "boolean") $set.hidden = hidden;

    if (order != null) {
      const n = Number(order);
      if (!Number.isNaN(n)) $set.order = n;
    }

    if (price != null) {
      const n = Number(price);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ message: "Invalid price" });
      }
      $set.price = n;
    }

    if (typeof isAvailable === "boolean") $set.isAvailable = isAvailable;

    const doc = await BranchMenuOverride.findOneAndUpdate(
      { restaurantId: rid, targetType: "item", targetId: orgItem._id },
      {
        $set,
        $setOnInsert: {
          restaurantId: rid,
          targetType: "item",
          targetId: orgItem._id,
        },
      },
      { new: true, upsert: true }
    ).lean();

    return res.json({ ok: true, override: doc });
  } catch (e) {
    next(e);
  }
};