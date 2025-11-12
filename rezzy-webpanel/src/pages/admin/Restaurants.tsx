import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: fetchRestaurants
  });
  const nav = useNavigate();

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" }
        ]}
      />
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Restoranlar</h2>
          <button
            onClick={() => nav("/admin/restaurants/new")}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm"
          >
            Restoran Ekle
          </button>
        </div>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Liste çekilemedi</div>}

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Ad</th>
                <th className="py-2 px-4">Şehir</th>
                <th className="py-2 px-4">Adres</th>
                <th className="py-2 px-4">Telefon</th>
                <th className="py-2 px-4">E-posta</th>
                <th className="py-2 px-4">Bölge</th>
                <th className="py-2 px-4">Durum</th>
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
        ? <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700">Aktif</span>
        : <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-rose-50 text-rose-700">Pasif</span>}
    </td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td className="py-3 px-4 text-gray-500" colSpan={5}>Kayıt yok</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Card>
          <div className="text-sm text-gray-500">Satıra tıklayarak detaya gidebilirsin.</div>
        </Card>
      </div>
    </div>
  );
}