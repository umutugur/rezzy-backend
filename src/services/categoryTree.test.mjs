import assert from "node:assert";
import { buildTree, validateParent } from "./categoryTree.js";

// buildTree: düz listeden ana→alt ağaç kurar
{
  const rows = [
    { _id: "a", parentId: null, key: "kahvaltilik" },
    { _id: "b", parentId: "a", key: "peynir" },
    { _id: "c", parentId: "a", key: "zeytin" },
    { _id: "d", parentId: null, key: "icecek" },
  ];
  const tree = buildTree(rows);
  assert.strictEqual(tree.length, 2, "2 ana kategori");
  const kahvalti = tree.find((n) => n._id === "a");
  assert.strictEqual(kahvalti.children.length, 2, "kahvaltiligin 2 alti");
  assert.deepStrictEqual(kahvalti.children.map((c) => c._id).sort(), ["b", "c"]);
  const icecek = tree.find((n) => n._id === "d");
  assert.strictEqual(icecek.children.length, 0, "icecegin alti yok");
}

// validateParent: kesin 2 seviye — parent'ın kendisi alt ise reddet
{
  // parent null-parent ise geçerli
  assert.strictEqual(validateParent({ _id: "child" }, { _id: "a", parentId: null }), null);
  // parent zaten alt kategori ise (parentId dolu) → hata mesajı döner
  assert.ok(validateParent({ _id: "child" }, { _id: "b", parentId: "a" }));
  // kendine parent olamaz
  assert.ok(validateParent({ _id: "a" }, { _id: "a", parentId: null }));
}
console.log("categoryTree ok");
