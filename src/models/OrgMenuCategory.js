import mongoose from "mongoose";

const OrgMenuCategorySchema = new mongoose.Schema(
  {
    // Hangi organizasyona ait? (zorunlu)
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Kategori başlığı (örn. "Kahvaltı", "Mezeler")
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // Opsiyonel açıklama
    description: {
      type: String,
      trim: true,
    },

    // Sıralama (küçük olan önce)
    order: {
      type: Number,
      default: 0,
    },

    // Kategori aktif mi?
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// 🔎 Organization içinde listeleme ve sıralama için ana index
OrgMenuCategorySchema.index(
  { organizationId: 1, order: 1 },
  { name: "org_menu_category_org_order" }
);

// Aktif kategorileri hızlı bulmak için
OrgMenuCategorySchema.index(
  { organizationId: 1, isActive: 1 },
  { name: "org_menu_category_org_active" }
);

export default mongoose.model("OrgMenuCategory", OrgMenuCategorySchema);