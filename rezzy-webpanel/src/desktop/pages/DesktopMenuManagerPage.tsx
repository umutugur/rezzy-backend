import React from "react";
import MenuManagerPage from "../../pages/restaurant/MenuManager";
import {
  RestaurantDesktopLayout,
  useRestaurantDesktopCurrency,
} from "../layouts/RestaurantDesktopLayout";

function DesktopMenuInner() {
  const { restaurantId } = useRestaurantDesktopCurrency();

  if (!restaurantId) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600">RestaurantId bulunamadı.</div>
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