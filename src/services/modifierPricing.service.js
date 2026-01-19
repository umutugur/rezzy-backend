// src/services/modifierPricing.service.js
import mongoose from "mongoose";
import ModifierGroup from "../models/ModifierGroup.js";
import MenuItem from "../models/MenuItem.js";

/**
 * Client payload beklenen format:
 * items: [
 *   {
 *     itemId,
 *     qty | quantity,
 *     note,
 *     selectedModifiers: [
 *       { groupId, optionIds: [optionId, ...] }
 *     ]
 *   }
 * ]
 */

function oid(v) {
  const s = String(v || "").trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normalizeIncomingItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, code: "ITEMS_REQUIRED", message: "Sepet boş olamaz." };
  }

  return items.map((x) => {
    const itemId = oid(x?.itemId);
    if (!itemId) {
      throw { status: 400, code: "ITEM_ID_INVALID", message: "Sepette geçersiz ürün var." };
    }

    const qty = Math.max(1, Number(x?.qty || x?.quantity || 1));
    const note = String(x?.note || "").trim();

    const selectedModifiers = Array.isArray(x?.selectedModifiers)
      ? x.selectedModifiers.map((g) => {
          const groupId = oid(g?.groupId);
          if (!groupId) {
            throw { status: 400, code: "MODIFIER_GROUP_INVALID", message: "Opsiyon grubu geçersiz." };
          }

          const optionIdsRaw = Array.isArray(g?.optionIds) ? g.optionIds : [];
          const optionIds = optionIdsRaw.map(oid).filter(Boolean);

          return { groupId, optionIds };
        })
      : [];

    return { itemId, qty, note, selectedModifiers };
  });
}

async function fetchMenuItemsByIds({ restaurantId, itemIds }) {
  // NOT: Şu an sipariş itemId'si MenuItem _id bekliyor.
  // OrgMenuItem id geliyorsa bu fonksiyon genişletilmeli.
  const docs = await MenuItem.find({
    _id: { $in: itemIds },
    restaurantId: String(restaurantId),
    isActive: true,
    isAvailable: true,
  })
    .select("_id title price modifierGroupIds")
    .lean();

  return docs;
}

async function fetchModifierGroupsForRestaurant({ restaurantId, groupIds, includeInactive = false }) {
  const q = {
    _id: { $in: groupIds },
    restaurantId: oid(restaurantId),
  };
  if (!includeInactive) q.isActive = true;

  const groups = await ModifierGroup.find(q).lean();
  return groups;
}

function buildGroupMap(groups) {
  const map = new Map();
  for (const g of groups || []) map.set(String(g._id), g);
  return map;
}

function validateGroupSelection({ group, chosenOptionIds }) {
  const minSelect = Math.max(0, Number(group.minSelect ?? 0));
  const maxSelect = Math.max(1, Number(group.maxSelect ?? 1));

  const chosen = uniqStrings((chosenOptionIds || []).map(String));

  if (chosen.length < minSelect) {
    throw {
      status: 400,
      code: "MODIFIER_MIN_NOT_MET",
      message: `"${group.title}" için en az ${minSelect} seçim yapmalısınız.`,
      meta: { groupId: String(group._id), minSelect, chosen: chosen.length },
    };
  }

  if (chosen.length > maxSelect) {
    throw {
      status: 400,
      code: "MODIFIER_MAX_EXCEEDED",
      message: `"${group.title}" için en fazla ${maxSelect} seçim yapabilirsiniz.`,
      meta: { groupId: String(group._id), maxSelect, chosen: chosen.length },
    };
  }

  return chosen;
}

function snapshotSelectedModifiers({ itemAllowedGroupIds, groupsById, selected }) {
  const out = [];
  let modifiersTotal = 0;

  const allowed = uniqStrings(itemAllowedGroupIds || []);
  const allowedSet = new Set(allowed);

  const selectedByGroup = new Map();
  for (const s of selected || []) {
    selectedByGroup.set(String(s.groupId), s);
  }

  // 0) Client’ın yolladığı ama item’a bağlı olmayan group varsa patlat
  for (const s of selected || []) {
    const gidStr = String(s.groupId);
    if (!allowedSet.has(gidStr)) {
      throw {
        status: 400,
        code: "MODIFIER_GROUP_NOT_ALLOWED",
        message: "Seçilen opsiyon grubu bu ürün için geçerli değil.",
      };
    }
  }

  // 1) Item’ın bağlı olduğu tüm grupları dolaş: required/min/max burada enforce edilir
  for (const gidStr of allowed) {
    const group = groupsById.get(gidStr);

    // Eğer item groupId bağlı ama group DB'de yoksa:
    // - yanlış data -> güvenli davranış: 400 dön (yok saymak sessiz bug üretir)
    if (!group) {
      throw {
        status: 400,
        code: "MODIFIER_GROUP_MISSING",
        message: "Bu ürünün opsiyon gruplarından bazıları artık kullanılmıyor. Lütfen menüyü yenileyin.",
      };
    }

    if (group.isActive === false) {
      throw {
        status: 400,
        code: "MODIFIER_GROUP_INACTIVE",
        message: `"${group.title}" şu an seçilemez.`,
      };
    }

    const req = selectedByGroup.get(gidStr);
    const chosenIds = req ? req.optionIds : [];

    const chosen = validateGroupSelection({ group, chosenOptionIds: chosenIds });

    const optionsById = new Map((group.options || []).map((o) => [String(o._id), o]));
    const snappedOptions = chosen.map((oidStr) => {
      const opt = optionsById.get(oidStr);
      if (!opt) {
        throw {
          status: 400,
          code: "MODIFIER_OPTION_INVALID",
          message: `"${group.title}" içinde geçersiz opsiyon seçildi.`,
        };
      }
      if (opt.isActive === false) {
        throw {
          status: 400,
          code: "MODIFIER_OPTION_INACTIVE",
          message: `"${group.title}" içinde "${opt.title}" şu an seçilemez.`,
        };
      }

      const delta = Math.max(0, Number(opt.price ?? 0));
      modifiersTotal += delta;

      return {
        optionId: opt._id,
        optionTitle: String(opt.title || ""),
        priceDelta: delta, // snapshot alan adı (Order schema ile uyumlu)
      };
    });

    if (snappedOptions.length > 0) {
      out.push({
        groupId: group._id,
        groupTitle: String(group.title || ""),
        options: snappedOptions,
      });
    }
  }

  return { selectedSnapshots: out, unitModifiersTotal: modifiersTotal };
}

export async function buildItemsWithModifiersOrThrow({ restaurant, items }) {
  const normalized = normalizeIncomingItems(items);

  const itemIds = normalized.map((x) => x.itemId);
  const menuItems = await fetchMenuItemsByIds({ restaurantId: restaurant._id, itemIds });

  const miMap = new Map(menuItems.map((m) => [String(m._id), m]));

  const allGroupIds = [];
  for (const it of normalized) {
    const m = miMap.get(String(it.itemId));
    if (!m) {
      throw {
        status: 400,
        code: "ITEM_NOT_AVAILABLE",
        message: "Sepetteki bazı ürünler artık mevcut değil. Lütfen sepeti güncelleyin.",
      };
    }
    const gids = Array.isArray(m.modifierGroupIds) ? m.modifierGroupIds : [];
    for (const gid of gids) allGroupIds.push(String(gid));
  }

  const groupIds = uniqStrings(allGroupIds).map(oid).filter(Boolean);

  const groups = groupIds.length
    ? await fetchModifierGroupsForRestaurant({
        restaurantId: restaurant._id,
        groupIds,
        includeInactive: false,
      })
    : [];

  const groupsById = buildGroupMap(groups);

  const built = normalized.map((it) => {
    const m = miMap.get(String(it.itemId));
    const basePrice = Math.max(0, Number(m.price || 0));

    const itemAllowedGroupIds = Array.isArray(m.modifierGroupIds) ? m.modifierGroupIds.map(String) : [];

    const { selectedSnapshots, unitModifiersTotal } = snapshotSelectedModifiers({
      itemAllowedGroupIds,
      groupsById,
      selected: it.selectedModifiers,
    });

    const unitTotal = basePrice + unitModifiersTotal;
    const lineTotal = unitTotal * it.qty;

    return {
      itemId: m._id,
      itemTitle: String(m.title || ""),
      basePrice,
      quantity: it.qty, // Order.js bunu kullanıyor
      qty: it.qty, // Delivery modelleri bunu kullanıyor
      note: it.note,

      selectedModifiers: selectedSnapshots,

      unitModifiersTotal,
      unitTotal,
      lineTotal,
    };
  });

  const subtotal = built.reduce((sum, x) => sum + Number(x.lineTotal || 0), 0);
  return { builtItems: built, subtotal };
}