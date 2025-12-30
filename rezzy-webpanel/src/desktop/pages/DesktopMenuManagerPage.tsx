import React from "react";
import MenuManagerPage from "../../pages/restaurant/MenuManager";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";

export function DesktopMenuManagerPage() {
  return (
    <RestaurantDesktopLayout
      activeNav={"menu" as any}
      title="Menü Yönetimi"
      subtitle="Kategoriler ve ürünler"
    >
      <MenuManagerPage />
    </RestaurantDesktopLayout>
  );
}