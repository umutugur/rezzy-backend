import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, adminGetUserStats, adminExportUsers } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Stat, StatGrid } from "../../components/Card";

type User = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "customer" | "restaurant" | "admin";
  banned?: boolean;
  riskScore?: number;
  noShowCount?: number;
};

async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get("/admin/users");
  return Array.isArray(data) ? data : data?.items || [];
}

export default function AdminUsersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
  });

  const statsQ = useQuery({
    queryKey: ["admin-user-stats"],
    queryFn: adminGetUserStats,
  });

  const handleExport = async () => {
    try {
      await adminExportUsers();
    } catch {
      // hata toast interceptor tarafından gösteriliyor
    }
  };

  return (
    <div className="flex gap-6">
      <Sidebar
         items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/banners", label: "Bannerlar" },
          { to: "/admin/commissions", label: "Komisyonlar" }, // ✅ menüye eklendi
          { to: "/admin/organizations", label: "Organizasyonlar" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" },
          { to: "/admin/notifications", label: "Bildirim Gönder" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Kullanıcılar</h2>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm"
          >
            CSV Dışa Aktar
          </button>
        </div>

        {/* İstatistik Kartları */}
        {statsQ.data && (
          <StatGrid>
            <Stat label="Toplam Kullanıcı" value={statsQ.data.total} />
            <Stat label="Banlı" value={statsQ.data.banned} />
            <Stat label="Yüksek Riskli" value={statsQ.data.highRisk} />
            <Stat
              label="Ortalama Risk"
              value={statsQ.data.avgRisk.toFixed(1)}
              helper="/100"
            />
          </StatGrid>
        )}

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Liste çekilemedi</div>}

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Ad</th>
                <th className="py-2 px-4">E-posta</th>
                <th className="py-2 px-4">Telefon</th>
                <th className="py-2 px-4">Rol</th>
                <th className="py-2 px-4">Risk</th>
                <th className="py-2 px-4">Durum</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => {
                const highRisk = (u.riskScore ?? 0) >= 75;
                return (
                  <tr
                    key={u._id}
                    className={`border-t ${
                      u.banned ? "bg-red-50" : highRisk ? "bg-orange-50" : ""
                    }`}
                  >
                    <td className="py-2 px-4">
                      <Link
                        to={`/admin/users/${u._id}`}
                        className="text-brand-700 underline"
                      >
                        {u.name}
                      </Link>
                    </td>
                    <td className="py-2 px-4">{u.email || "-"}</td>
                    <td className="py-2 px-4">{u.phone || "-"}</td>
                    <td className="py-2 px-4 capitalize">{u.role}</td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            highRisk
                              ? "bg-red-100 text-red-700 border-red-200"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                          title="Risk skoru (0–100)"
                        >
                          {u.riskScore ?? 0}
                        </span>
                        {typeof u.noShowCount === "number" && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200"
                            title="No-show sayısı"
                          >
                            NS: {u.noShowCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      {u.banned ? (
                        <span className="text-red-600 font-medium">Banlı</span>
                      ) : (
                        <span className="text-green-700 font-medium">
                          Aktif
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!data || data.length === 0) && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={6}>
                    Kayıt yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}