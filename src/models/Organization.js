import mongoose from "mongoose";

const OrganizationSchema = new mongoose.Schema(
  {
    // Zincir / marka adı (örn. "BigChefs", "MeyhaneZinciri A.Ş.")
    name: {
      type: String,
      required: true,
      index: true,
    },

    // Opsiyonel: daha kurumsal / ticari unvan
    legalName: {
      type: String,
    },

    // Marka logosu (chain seviyesinde)
    logoUrl: {
      type: String,
    },

    // Ana bölge / ülke (örn. "TR", "CY", "UK")
    region: {
      type: String,
      index: true,
    },

    // Varsayılan dil ayarı (restaurant.preferredLanguage ile uyumlu)
    defaultLanguage: {
      type: String,
      default: "tr",
    },

    // Opsiyonel açıklama / not
    description: {
      type: String,
    },

    // İleride muhasebe / fatura entegrasyonu için kullanılabilecek alanlar
    taxNumber: {
      type: String,
    },
    taxOffice: {
      type: String,
    },
  },
  { timestamps: true }
);

// İsim + bölge kombinasyonu ile aramalar için basit index
OrganizationSchema.index(
  { name: 1, region: 1 },
  { name: "organization_name_region" }
);

export default mongoose.model("Organization", OrganizationSchema);