// src/services/categoryTree.js
import CoreCategory from "../models/CoreCategory.js";

/**
 * Düz kategori listesinden (her biri {_id, parentId, ...}) ana→alt ağaç kurar.
 * Sadece parentId:null ana düğümler kök olur; parentId dolu olanlar children'a girer.
 */
export function buildTree(rows) {
  const byId = new Map();
  const norm = (v) => (v == null ? null : String(v));
  for (const r of rows) byId.set(norm(r._id), { ...r, _id: norm(r._id), children: [] });
  const roots = [];
  for (const node of byId.values()) {
    const pid = norm(node.parentId);
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Kesin 2-seviye kuralı. child'ı parent'ın altına koymak geçerli mi?
 * Geçersizse hata mesajı (string) döner, geçerliyse null.
 * parent: {_id, parentId} — DB'den okunmuş aday parent.
 */
export function validateParent(child, parent) {
  const cid = child?._id == null ? null : String(child._id);
  const pid = parent?._id == null ? null : String(parent._id);
  if (cid && pid && cid === pid) return "Kategori kendisine üst kategori olamaz";
  if (parent && parent.parentId != null) return "Alt kategori başka bir kategoriye üst olamaz (yalnızca 2 seviye)";
  return null;
}

/**
 * DB: verilen kategori id'sinin alt kategori id'lerini döner (string[]).
 */
export async function childIdsOf(categoryId) {
  if (!categoryId) return [];
  const kids = await CoreCategory.find({ parentId: categoryId }).select("_id").lean();
  return kids.map((k) => String(k._id));
}

/**
 * DB: ürün filtresi için kategori id listesi.
 * - Ana kategori → [kendisi, ...altları] (altlardaki ürünleri de kapsar)
 * - Alt kategori → [kendisi]
 */
export async function expandCategoryFilter(categoryId) {
  if (!categoryId) return [];
  const self = String(categoryId);
  const kids = await childIdsOf(self);
  return [self, ...kids];
}
