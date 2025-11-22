// src/models/CoreCategory.js
import mongoose from "mongoose";

const I18nSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const CoreCategorySchema = new mongoose.Schema(
  {
    // Bir kategori birden fazla işletme tipinde kullanılabilir
    businessTypes: {
      type: [String],
      default: [],
      index: true,
    },

    // Sabit kimlik / slug (seed ve mapleme için)
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },

    // Çok dil (hibrit fallback için)
    i18n: {
      tr: { type: I18nSchema, required: true },
      en: { type: I18nSchema, required: true },
      ru: { type: I18nSchema, required: true },
      el: { type: I18nSchema, required: true },
      // ileride yeni dil eklemek istersen buraya eklemene gerek yok,
      // Mongo zaten esnek; seed/newLang push edebilirsin.
    },

    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

CoreCategorySchema.index({ businessTypes: 1, order: 1 });
CoreCategorySchema.index({ key: 1 });

export default mongoose.model("CoreCategory", CoreCategorySchema);