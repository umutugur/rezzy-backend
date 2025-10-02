import React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import {
  adminGetUser,
  adminBanUser,
  adminUnbanUser,
  adminUpdateUserRole
} from "../../api/client";
import { showToast } from "../../ui/Toast";

export default function AdminUserDetailPage() {
  const { uid = "" } = useParams();
  const qc = useQueryClient();

  const uQ = useQuery({
    queryKey: ["admin-user", uid],
    queryFn: () => adminGetUser(uid),
    enabled: !!uid
  });

  const banMut = useMutation({
    mutationFn: () => adminBanUser(uid),
    onSuccess: () => {
      showToast("Kullanıcı banlandı", "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
    }
  });

  const unbanMut = useMutation({
    mutationFn: () => adminUnbanUser(uid),
    onSuccess: () => {
      showToast("Ban kaldırıldı", "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
    }
  });

  const [role, setRole] = React.useState("customer");
  React.useEffect(() => {
    if (uQ.data?.role) setRole(uQ.data.role);
  }, [uQ.data?.role]);

  const roleMut = useMutation({
    mutationFn: () => adminUpdateUserRole(uid, role as any),
    onSuccess: () => {
      showToast("Rol güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
    }
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
        <h2 className="text-lg font-semibold">Kullanıcı Detayı</h2>

        <Card title="Bilgiler">
          {uQ.isLoading ? (
            "Yükleniyor…"
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Ad</span>
                <div>{uQ.data?.name || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">E-posta</span>
                <div>{uQ.data?.email || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Telefon</span>
                <div>{uQ.data?.phone || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Rol</span>
                <div>{uQ.data?.role || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Durum</span>
                <div>{uQ.data?.banned ? "Banlı" : "Aktif"}</div>
              </div>
            </div>
          )}
        </Card>

        <Card title="İşlemler">
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white disabled:opacity-60"
              onClick={() => banMut.mutate()}
              disabled={banMut.isPending || uQ.data?.banned}
            >
              Banla
            </button>

            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
              onClick={() => unbanMut.mutate()}
              disabled={unbanMut.isPending || !uQ.data?.banned}
            >
              Banı Kaldır
            </button>

            <div className="ml-4 flex items-end gap-2">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Rol</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                >
                  <option value="customer">customer</option>
                  <option value="restaurant">restaurant</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
                onClick={() => roleMut.mutate()}
                disabled={roleMut.isPending}
              >
                Rolü Kaydet
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
