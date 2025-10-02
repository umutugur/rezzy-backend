import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";

type User = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "customer" | "restaurant" | "admin";
  banned?: boolean;
};

async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get("/admin/users");
  return Array.isArray(data) ? data : data?.items || [];
}

export default function AdminUsersPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers
  });

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
        <h2 className="text-lg font-semibold">Kullanıcılar</h2>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Liste çekilemedi</div>}

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Ad</th>
                <th className="py-2 px-4">E-posta</th>
                <th className="py-2 px-4">Telefon</th>
                <th className="py-2 px-4">Rol</th>
                <th className="py-2 px-4">Durum</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u._id} className="border-t">
                  <td className="py-2 px-4">
                    <Link to={`/admin/users/${u._id}`} className="text-brand-700 underline">
                      {u.name}
                    </Link>
                  </td>
                  <td className="py-2 px-4">{u.email || "-"}</td>
                  <td className="py-2 px-4">{u.phone || "-"}</td>
                  <td className="py-2 px-4">{u.role}</td>
                  <td className="py-2 px-4">{u.banned ? "Banlı" : "Aktif"}</td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td className="py-3 px-4 text-gray-500" colSpan={5}>Kayıt yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
