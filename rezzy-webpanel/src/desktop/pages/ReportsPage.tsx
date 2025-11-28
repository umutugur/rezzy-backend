import React from "react";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { EmptyState } from "../components/EmptyState";

export const ReportsPage: React.FC = () => {
  return (
    <RestaurantDesktopLayout
      activeNav="reports"
      title="Raporlar"
      subtitle="Ciro, kanal kırılımı ve popüler ürünler."
    >
      <EmptyState
        icon="📊"
        title="Raporlar yakında burada"
        text="Mekanın günlük, haftalık ve kanal bazlı raporlarını bu ekrana taşıyacağız."
      />
    </RestaurantDesktopLayout>
  );
};