import React from "react";
import MenuManagerPage from "../../pages/restaurant/MenuManager";
import {
  RestaurantDesktopLayout,
  useRestaurantDesktopCurrency,
} from "../layouts/RestaurantDesktopLayout";
import { useNavigate } from "react-router-dom";
import { authStore } from "../../store/auth";
import { useI18n } from "../../i18n";

function DesktopMenuInner() {
  const { t } = useI18n();
  const { restaurantId } = useRestaurantDesktopCurrency();
  const nav = useNavigate();
  const user = authStore.getUser();
  const fallbackOrgId = user?.organizations?.[0]?.id ?? null;

  if (!restaurantId) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-sm text-red-600">{t("RestaurantId bulunamadı.")}</div>
        {fallbackOrgId && (
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
            onClick={() => nav(`/org/organizations/${fallbackOrgId}/menu`)}
          >
            {t("Organizasyon menüsüne git")}
          </button>
        )}
      </div>
    );
  }

  return <MenuManagerPage restaurantId={restaurantId} />;
}

export function DesktopMenuManagerPage() {
  const { t } = useI18n();
  return (
    <RestaurantDesktopLayout
      activeNav={"menu" as any}
      title={t("Menü Yönetimi")}
      subtitle={t("Kategoriler ve ürünler")}
    >
      <DesktopMenuInner />
    </RestaurantDesktopLayout>
  );
}
