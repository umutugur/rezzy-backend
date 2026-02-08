import React from "react";
import MenuManagerPage from "../../pages/restaurant/MenuManager";
import {
  RestaurantDesktopLayout,
  useRestaurantDesktopCurrency,
} from "../layouts/RestaurantDesktopLayout";
import { useNavigate } from "react-router-dom";
import { authStore } from "../../store/auth";

function DesktopMenuInner() {
  const { restaurantId } = useRestaurantDesktopCurrency();
  const nav = useNavigate();
  const user = authStore.getUser();
  const fallbackOrgId = user?.organizations?.[0]?.id ?? null;

  if (!restaurantId) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-sm text-red-600">RestaurantId bulunamadı.</div>
        {fallbackOrgId && (
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
            onClick={() => nav(`/org/organizations/${fallbackOrgId}/menu`)}
          >
            Organizasyon menüsüne git
          </button>
        )}
      </div>
    );
  }

  return <MenuManagerPage restaurantId={restaurantId} />;
}

export function DesktopMenuManagerPage() {
  return (
    <RestaurantDesktopLayout
      activeNav={"menu" as any}
      title="Menü Yönetimi"
      subtitle="Kategoriler ve ürünler"
    >
      <DesktopMenuInner />
    </RestaurantDesktopLayout>
  );
}
