import React from "react";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { EmptyState } from "../components/EmptyState";

export const SettingsPage: React.FC = () => {
  return (
    <RestaurantDesktopLayout
      activeNav="settings"
      title="Ayarlar"
      subtitle="Masalar, salonlar, kullanıcılar ve yazıcı ayarları."
    >
      <EmptyState
        icon="⚙️"
        title="Ayarlar ekranı"
        text="Masa, salon ve servis kullanıcısı ayarlarını burada yönetebilirsiniz."
      />
    </RestaurantDesktopLayout>
  );
};