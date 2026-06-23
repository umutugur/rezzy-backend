import assert from "node:assert";
import { groupCatalogCategories } from "../controllers/market.controller.js";

const cat = (id, trTitle, order) => ({
  _id: id, key: `k_${id}`, order,
  i18n: { tr: { title: trTitle }, en: { title: trTitle } },
});

// 1) populated category: dedupe + count + order sort
let r = groupCatalogCategories([
  { _id: "p1", category: cat("c2", "İçecekler", 50) },
  { _id: "p2", category: cat("c1", "Atıştırmalık", 60) },
  { _id: "p3", category: cat("c2", "İçecekler", 50) },
  { _id: "p4", category: null },
]);
assert.equal(r.length, 2, "2 farklı kategori");
assert.equal(r[0]._id, "c2", "order 50 önce gelir");
assert.equal(r[0].count, 2, "c2 iki ürün");
assert.equal(r[1]._id, "c1");
assert.equal(r[1].count, 1);
assert.equal(r[0].i18n.tr.title, "İçecekler");

// 2) bare ObjectId category (i18n yok): yine de gruplanır
r = groupCatalogCategories([
  { _id: "p1", category: "abc123" },
  { _id: "p2", category: "abc123" },
]);
assert.equal(r.length, 1);
assert.equal(r[0]._id, "abc123");
assert.equal(r[0].count, 2);
assert.equal(r[0].i18n, null);

// 3) boş katalog
assert.deepEqual(groupCatalogCategories([]), []);

console.log("ok: groupCatalogCategories (3 cases)");
