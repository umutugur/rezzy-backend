import React from "react";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import { useI18n } from "../../i18n";

export function MarketSettingsPage() {
  const { t } = useI18n();
  return (
    <MarketDesktopLayout>
      <div style={{ padding: 24, color: "#9ca3af", textAlign: "center", marginTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 18 }}>{t("Ayarlar yakında eklenecek.")}</div>
      </div>
    </MarketDesktopLayout>
  );
}
