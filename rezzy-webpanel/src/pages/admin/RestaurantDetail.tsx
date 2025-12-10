// src/pages/admin/AdminRestaurantDetailPage.tsx
import React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import {
  adminGetRestaurant,
  adminUpdateRestaurantCommission,
  adminListReservationsByRestaurant,
  adminUpdateRestaurant,
  adminSearchUsers,
  adminAddRestaurantMember,
  adminRemoveRestaurantMember,
} from "../../api/client";
import { showToast } from "../../ui/Toast";

// ---- Tipler
type RestaurantMember = {
  userId: string;
  name: string;
  email?: string;
  role: string;
};

type RestaurantInfo = {
  _id: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  region?: string;
  isActive?: boolean;
  commissionRate?: number;
  commissionPct?: number;
  commission?: number;

  members?: RestaurantMember[];
};

type Rsv = {
  _id: string;
  dateTimeUTC: string;
  status: string;
  partySize?: number;
  totalPrice?: number;
  user?: { name?: string; email?: string };
};

type RsvList = { items: Rsv[]; total: number; page: number; limit: number };

type UserOption = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
};

// Restoran rollerini organizasyondan ayrı tutuyoruz
const RESTAURANT_ROLES = [
  { value: "location_manager", label: "Şube Yöneticisi" },
  { value: "staff", label: "Personel" },
  { value: "host", label: "Host / Karşılama" },
  { value: "kitchen", label: "Mutfak" },
];

function prettyRestaurantRole(role?: string) {
  if (!role) return "-";
  switch (role) {
    case "location_manager":
      return "Şube Yöneticisi";
    case "staff":
      return "Personel";
    case "host":
      return "Host";
    case "kitchen":
      return "Mutfak";
    default:
      return role;
  }
}

export default function AdminRestaurantDetailPage() {
  const params = useParams();
  const rid = params.rid ?? "";
  const qc = useQueryClient();

  const [commission, setCommission] = React.useState<string>("");
  const [isActive, setIsActive] = React.useState<boolean>(true);

  // Restoran bilgisi
  const infoQ = useQuery<RestaurantInfo | null>({
    queryKey: ["admin-restaurant", rid],
    queryFn: async () => (await adminGetRestaurant(rid)) as RestaurantInfo,
    enabled: !!rid,
  });

  React.useEffect(() => {
    const d = infoQ.data;
    if (!d) return;

    // Komisyonu normalize et:
    // 1) Tercih edilen alan: commissionRate (0..1)
    // 2) Eski alanlar: commissionPct / commission (0..100)
    let pct = 5; // varsayılan %5
    if (typeof d.commissionRate === "number") {
      pct = d.commissionRate * 100;
    } else if (typeof d.commissionPct === "number") {
      pct = d.commissionPct;
    } else if (typeof d.commission === "number") {
      pct = d.commission;
    }
    setCommission(String(pct));

    // Aktif/pasif durumu
    setIsActive(typeof d.isActive === "boolean" ? d.isActive : true);
  }, [infoQ.data]);

  // -------------------
// RESTAURANT MEMBERS
// -------------------
const members: RestaurantMember[] = infoQ.data?.members ?? [];

  const [memberQuery, setMemberQuery] = React.useState("");
  const [memberResults, setMemberResults] = React.useState<UserOption[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] =
    React.useState(false);
  const [selectedMember, setSelectedMember] =
    React.useState<UserOption | null>(null);
  const [memberRole, setMemberRole] =
    React.useState<string>("location_manager");

  const handleSearchMember = async () => {
    if (!memberQuery.trim()) return;
    try {
      setMemberSearchLoading(true);
      const res = await adminSearchUsers(memberQuery.trim());
      setMemberResults(res);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Kullanıcı aranamadı";
      showToast(msg, "error");
    } finally {
      setMemberSearchLoading(false);
    }
  };

  const selectMember = (u: UserOption) => {
    setSelectedMember(u);
    setMemberResults([]);
  };

  const addMemberMut = useMutation({
    mutationFn: () =>
      adminAddRestaurantMember(rid, {
        userId: selectedMember?._id as string,
        role: memberRole,
      }),
    onSuccess: () => {
      showToast("Restoran üyesi eklendi", "success");
      setSelectedMember(null);
      setMemberQuery("");
      setMemberRole("location_manager");
      qc.invalidateQueries({ queryKey: ["admin-restaurant", rid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Üye eklenemedi";
      showToast(msg, "error");
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) => adminRemoveRestaurantMember(rid, userId),
    onSuccess: () => {
      showToast("Restoran üyeliği kaldırıldı", "success");
      qc.invalidateQueries({ queryKey: ["admin-restaurant", rid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Üyelik kaldırılamadı";
      showToast(msg, "error");
    },
  });

  const handleAddMember = () => {
    if (!selectedMember?._id) {
      showToast("Önce kullanıcı seçin", "error");
      return;
    }
    if (!memberRole) {
      showToast("Rol seçin", "error");
      return;
    }
    addMemberMut.mutate();
  };

  const handleRemoveMember = (userId: string) => {
    if (!userId) return;
    removeMemberMut.mutate(userId);
  };

  // -------------------
  // REZERVASYON LİSTESİ
  // -------------------
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  // Restoranın rezervasyonları
  const rsvQ = useQuery<RsvList>({
    queryKey: ["admin-r-rsv", rid, status, from, to, page, limit],
    queryFn: async () =>
      (await adminListReservationsByRestaurant(rid, {
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit,
      })) as RsvList,
    enabled: !!rid,
  });

  const activeMut = useMutation({
    mutationFn: (next: boolean) =>
      adminUpdateRestaurant(rid, { isActive: next }),
    onSuccess: () => {
      showToast("Restoran durumu güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-restaurant", rid] });
    },
    onError: () => {
      showToast("Restoran durumu güncellenemedi", "error");
    },
  });

  // Komisyon kaydet
  const saveMut = useMutation({
    mutationFn: () => {
      const raw = Number(commission);
      if (Number.isNaN(raw) || raw < 0) {
        throw new Error("Geçerli bir komisyon oranı girin");
      }
      const rate = raw / 100; // % değerini 0..1'e çevir
      return adminUpdateRestaurantCommission(rid, rate);
    },
    onSuccess: () => {
      showToast("Komisyon güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-restaurant", rid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Komisyon güncellenemedi";
      showToast(msg, "error");
    },
  });

  const totalPages =
    rsvQ.data && rsvQ.data.limit > 0
      ? Math.ceil(rsvQ.data.total / rsvQ.data.limit)
      : 1;

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" },
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">
          {infoQ.data?.name || "Restoran Detayı"}
        </h2>

        {/* Bilgiler */}
        <Card title="Bilgiler">
          {infoQ.isLoading ? (
            "Yükleniyor…"
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Şehir</span>
                <div>{infoQ.data?.city || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Adres</span>
                <div>{infoQ.data?.address || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Telefon</span>
                <div>{infoQ.data?.phone || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">E-posta</span>
                <div>{infoQ.data?.email || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Bölge</span>
                <div>{infoQ.data?.region || "-"}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">Aktif</span>
                <input
                  type="checkbox"
                  checked={!!isActive}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIsActive(next);
                    activeMut.mutate(next);
                  }}
                  disabled={activeMut.isPending || infoQ.isLoading}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Restoran Üyeleri */}
        <Card title="Restoran Üyeleri">
          {/* Liste */}
          {members && members.length > 0 ? (
            <div className="overflow-auto mb-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">Ad</th>
                    <th className="py-2 px-4">E-posta</th>
                    <th className="py-2 px-4">Rol</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
  <tr key={m.userId} className="border-t">
    <td className="py-2 px-4">{m.name || "İsimsiz"}</td>
    <td className="py-2 px-4">{m.email || "-"}</td>
    <td className="py-2 px-4">
      {prettyRestaurantRole(m.role)}
    </td>
    <td className="py-2 px-4 text-right">
      <button
        type="button"
        onClick={() => handleRemoveMember(m.userId)}
        disabled={removeMemberMut.isPending}
        className="px-2 py-1 text-xs rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60"
      >
        Kaldır
      </button>
    </td>
  </tr>
))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-500 mb-4">
              Henüz bu restorana bağlı üye yok.
            </div>
          )}

          {/* Üye ekleme formu */}
          <div className="grid md:grid-cols-3 gap-3 items-start">
            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs text-gray-600">
                Kullanıcı Ara (isim / e-posta)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                  value={memberQuery}
                  onChange={(e) => {
                    setMemberQuery(e.target.value);
                    setSelectedMember(null);
                    setMemberResults([]);
                  }}
                />
                <button
                  type="button"
                  onClick={handleSearchMember}
                  disabled={memberSearchLoading}
                  className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs disabled:opacity-60"
                >
                  {memberSearchLoading ? "Aranıyor…" : "Ara"}
                </button>
              </div>

              {memberQuery.trim().length >= 2 && (
                <div className="mt-2 max-h-48 overflow-auto border rounded-lg bg-gray-50">
                  {memberSearchLoading && (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      Aranıyor…
                    </div>
                  )}
                  {!memberSearchLoading &&
                    memberResults.length === 0 &&
                    memberQuery.trim() && (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        Sonuç yok
                      </div>
                    )}
                  {memberResults.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => selectMember(u)}
                      className={`w-full flex justify-between items-center px-3 py-2 text-sm hover:bg-white ${
                        selectedMember?._id === u._id
                          ? "bg-brand-50"
                          : ""
                      }`}
                    >
                      <span>
                        {u.name || "İsimsiz"}{" "}
                        <span className="text-gray-500">
                          ({u.email || "-"})
                        </span>
                      </span>
                      <span className="text-xs text-gray-400">
                        {u.role || ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="text-xs text-emerald-700 mt-1">
                {selectedMember
                  ? `Seçili kullanıcı: ${
                      selectedMember.name || "İsimsiz"
                    } (${selectedMember.email || "-"})`
                  : "Henüz kullanıcı seçilmedi"}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-gray-600 mb-1">
                Rol
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value)}
              >
                {RESTAURANT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddMember}
                disabled={
                  !selectedMember ||
                  !memberRole ||
                  addMemberMut.isPending
                }
                className="mt-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs w-full disabled:opacity-60"
              >
                {addMemberMut.isPending
                  ? "Ekleniyor…"
                  : "Üye Ekle"}
              </button>
            </div>
          </div>
        </Card>

        {/* Komisyon */}
        <Card title="Komisyon">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                % Oran
              </label>
              <input
                type="number"
                min={0}
                step={0.1}
                className="border rounded-lg px-3 py-2 w-40"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
            <button
              onClick={() => saveMut.mutate()}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
              disabled={saveMut.isPending}
            >
              Kaydet
            </button>
          </div>
        </Card>

        {/* Rezervasyonlar */}
        <Card title="Rezervasyonlar">
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Durum
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="">Hepsi</option>
                <option value="pending">Bekleyen</option>
                <option value="confirmed">Onaylı</option>
                <option value="arrived">Gelen</option>
                <option value="cancelled">İptal</option>
                <option value="no_show">No-show</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Başlangıç
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Bitiş
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Sayfa
              </label>
              <input
                type="number"
                min={1}
                value={page}
                onChange={(e) =>
                  setPage(Number(e.target.value) || 1)
                }
                className="w-24 border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Limit
              </label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) =>
                  setLimit(Number(e.target.value) || 20)
                }
                className="w-24 border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 px-4">Tarih</th>
                  <th className="py-2 px-4">Kullanıcı</th>
                  <th className="py-2 px-4">Durum</th>
                  <th className="py-2 px-4">Kişi</th>
                  <th className="py-2 px-4">Tutar (₺)</th>
                </tr>
              </thead>
              <tbody>
                {(rsvQ.data?.items ?? []).map((r) => (
                  <tr key={r._id} className="border-t">
                    <td className="py-2 px-4">
                      {r.dateTimeUTC
                        ? new Date(
                            r.dateTimeUTC
                          ).toLocaleString()
                        : "-"}
                    </td>
                    <td className="py-2 px-4">
                      {r.user?.name || "-"}{" "}
                      <span className="text-gray-500">
                        ({r.user?.email || "-"})
                      </span>
                    </td>
                    <td className="py-2 px-4">{r.status}</td>
                    <td className="py-2 px-4">
                      {r.partySize ?? "-"}
                    </td>
                    <td className="py-2 px-4">
                      {r.totalPrice != null
                        ? r.totalPrice.toLocaleString("tr-TR")
                        : "-"}
                    </td>
                  </tr>
                ))}
                {(!rsvQ.data?.items ||
                  rsvQ.data.items.length === 0) && (
                  <tr>
                    <td
                      className="py-3 px-4 text-gray-500"
                      colSpan={5}
                    >
                      Kayıt yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {rsvQ.data && (
            <div className="flex items-center gap-2 mt-3">
              <button
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() =>
                  setPage((p) => Math.max(1, p - 1))
                }
              >
                Önceki
              </button>
              <div className="text-sm text-gray-600">
                Sayfa {page} / {totalPages}
              </div>
              <button
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sonraki
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}