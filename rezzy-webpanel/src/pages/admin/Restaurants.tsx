import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { useI18n } from "../../i18n";

type Restaurant = {
  _id: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  region?:string;
  isActive?:boolean;
};

async function fetchRestaurants(): Promise<Restaurant[]> {
  const { data } = await api.get("/admin/restaurants");
  return Array.isArray(data) ? data : data?.items || [];
}

export default function AdminRestaurantsPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: fetchRestaurants
  });
  const nav = useNavigate();

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: t("Dashboard") },
          { to: "/admin/banners", label: t("Bannerlar") },
          { to: "/admin/commissions", label: t("Komisyonlar") }, // ✅ menüye eklendi
          { to: "/admin/organizations", label: t("Organizasyonlar") },
          { to: "/admin/restaurants", label: t("Restoranlar") },
          { to: "/admin/users", label: t("Kullanıcılar") },
          { to: "/admin/reservations", label: t("Rezervasyonlar") },
          { to: "/admin/moderation", label: t("Moderasyon") },
          { to: "/admin/notifications", label: t("Bildirim Gönder") },
        ]}
      />
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Restoranlar")}</h2>
          <button
            onClick={() => nav("/admin/restaurants/new")}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm"
          >
            {t("Restoran Ekle")}
          </button>
        </div>

        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && <div className="text-red-600 text-sm">{t("Liste çekilemedi")}</div>}

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">{t("Ad")}</th>
                <th className="py-2 px-4">{t("Şehir")}</th>
                <th className="py-2 px-4">{t("Adres")}</th>
                <th className="py-2 px-4">{t("Telefon")}</th>
                <th className="py-2 px-4">{t("E-posta")}</th>
                <th className="py-2 px-4">{t("Bölge")}</th>
                <th className="py-2 px-4">{t("Durum")}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r._id} className="border-t">
                  <td className="py-2 px-4">
                    <Link to={`/admin/restaurants/${r._id}`} className="text-brand-700 underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 px-4">{r.city || "-"}</td>
                  <td className="py-2 px-4">{r.address || "-"}</td>
                  <td className="py-2 px-4">{r.phone || "-"}</td>
                  <td className="py-2 px-4">{r.email || "-"}</td>
                  <td className="py-2 px-4">{r.region || "-"}</td>
     <td className="py-2 px-4">
      {r.isActive
        ? <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700">{t("Aktif")}</span>
        : <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-rose-50 text-rose-700">{t("Pasif")}</span>}
    </td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td className="py-3 px-4 text-gray-500" colSpan={5}>{t("Kayıt yok")}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Card>
          <div className="text-sm text-gray-500">{t("Satıra tıklayarak detaya gidebilirsin.")}</div>
        </Card>
      </div>
    </div>
  );
}
