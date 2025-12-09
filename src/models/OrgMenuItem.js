import mongoose from "mongoose";

const OrgMenuItemSchema = new mongoose.Schema(
  {
    // Hangi organizasyona ait? (zorunlu)
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Hangi org kategorisinin altında? (zorunlu)
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrgMenuCategory",
      required: true,
      index: true,
    },

    // Ürün adı (örn. "Serpme Kahvaltı", "Acılı Ezme")
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Ürün açıklaması
    description: {
      type: String,
      trim: true,
    },

    // Zincir için default fiyat (şubeler override edebilir)
    defaultPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Zincir seviyesinde default fotoğraf (şubeler override edebilir)
    photoUrl: {
      type: String,
      trim: true,
    },

    // Etiketler (örn. ["vegan", "signature", "spicy"])
    tags: {
      type: [String],
      default: [],
    },

    // Kategori içi sıralama
    order: {
      type: Number,
      default: 0,
    },

    // Ürün aktif mi?
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// 🔎 Organization + kategori içinde performanslı listeleme için
OrgMenuItemSchema.index(
  { organizationId: 1, categoryId: 1, order: 1 },
  { name: "org_menu_item_org_cat_order" }
);

// Aktif ürünleri hızlı bulmak için
OrgMenuItemSchema.index(
  { organizationId: 1, isActive: 1 },
  { name: "org_menu_item_org_active" }
);

export default mongoose.model("OrgMenuItem", OrgMenuItemSchema);