import React from "react";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { EmptyState } from "../components/EmptyState";

export const RezzyOrdersPage: React.FC = () => {
  return (
    <RestaurantDesktopLayout
      activeNav="rezzy"
      title="Rezzy & QR Siparişleri"
      subtitle="Rezzy rezervasyonlarından ve QR menüden gelen siparişleri buradan yönetin."
    >
      <EmptyState
        icon="📲"
        title="Henüz aktif Rezzy / QR siparişi yok"
        text="Rezzy rezervasyonları ve QR menü siparişleri burada listelenecek."
      />
    </RestaurantDesktopLayout>
  );
};