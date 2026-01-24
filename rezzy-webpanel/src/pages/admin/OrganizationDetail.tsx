import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import {
  adminGetOrganization,
  adminCreateOrganizationRestaurant,
  adminSearchUsers,
  adminAddOrganizationMember,
  adminRemoveOrganizationMember,
  type AdminOrganization,
} from "../../api/client";
import { showToast } from "../../ui/Toast";

type OrgDetail = AdminOrganization & {
  // Backend'te farklı isimler kullanılabilir; hepsini zorlamıyoruz
  restaurants?: Array<{
    _id: string;
    name: string;
    city?: string;
    region?: string;
    isActive?: boolean;
  }>;
  members?: any[];
};

type UserOption = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
};

const ORG_ROLES = [
  { value: "org_owner", label: "Owner" },
  { value: "org_admin", label: "Admin" },
  { value: "org_finance", label: "Finans" },
  { value: "org_staff", label: "Staff" },
];

function prettyOrgRole(role?: string) {
  if (!role) return "-";
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_admin":
      return "Admin";
    case "org_finance":
      return "Finans";
    case "org_staff":
      return "Staff";
    default:
      return role;
  }
}

export default function AdminOrganizationDetailPage() {
  const { oid = "" } = useParams<{ oid: string }>();
  const qc = useQueryClient();

  const orgQ = useQuery<OrgDetail | null>({
    queryKey: ["admin-organization", oid],
    queryFn: async () => (await adminGetOrganization(oid)) as OrgDetail,
    enabled: !!oid,
  });

  const org = orgQ.data;

  const restaurants: Array<{
    _id: string;
    name: string;
    city?: string;
    region?: string;
    isActive?: boolean;
  }> =
    (org as any)?.restaurants ??
    (org as any)?.branches ??
    (org as any)?.restaurantList ??
    [];

  // =======================
  // ORGANIZATION MEMBERSHIP
  // =======================

  // Org members (backend shape esnek tutuldu)
  const members: any[] = (org as any)?.members ?? [];

  const [memberQuery, setMemberQuery] = React.useState("");
  const [memberResults, setMemberResults] = React.useState<UserOption[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] =
    React.useState(false);
  const [selectedMember, setSelectedMember] =
    React.useState<UserOption | null>(null);
  const [memberRole, setMemberRole] =
    React.useState<string>("org_admin");

  const handleSearchMember = async (e: React.FormEvent) => {
    e.preventDefault();
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
      adminAddOrganizationMember(oid, {
        userId: selectedMember?._id as string,
        role: memberRole,
      }),
    onSuccess: () => {
      showToast("Üye eklendi", "success");
      setSelectedMember(null);
      setMemberQuery("");
      setMemberRole("org_admin");
      qc.invalidateQueries({ queryKey: ["admin-organization", oid] });
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
    mutationFn: (userId: string) =>
      adminRemoveOrganizationMember(oid, userId),
    onSuccess: () => {
      showToast("Üyelik kaldırıldı", "success");
      qc.invalidateQueries({ queryKey: ["admin-organization", oid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Üyelik kaldırılamadı";
      showToast(msg, "error");
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
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

  // =======================
  // RESTAURANT CREATE FORM
  // =======================

  // Owner seçimi için user search (restoran)
  const [ownerQuery, setOwnerQuery] = React.useState("");
  const [ownerResults, setOwnerResults] = React.useState<UserOption[]>([]);
  const [ownerSearchLoading, setOwnerSearchLoading] =
    React.useState(false);
  const [ownerId, setOwnerId] = React.useState("");
  const [ownerLabel, setOwnerLabel] = React.useState("");

  const handleSearchOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerQuery.trim()) return;
    try {
      setOwnerSearchLoading(true);
      const res = await adminSearchUsers(ownerQuery.trim());
      setOwnerResults(res);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Kullanıcı aranamadı";
      showToast(msg, "error");
    } finally {
      setOwnerSearchLoading(false);
    }
  };

  const selectOwner = (u: UserOption) => {
    setOwnerId(u._id);
    setOwnerLabel(
      `${u.name || "İsimsiz"} (${u.email || "e-posta yok"})`
    );
    setOwnerResults([]);
  };

  // Yeni restoran formu
  const [rName, setRName] = React.useState("");
  const [rCity, setRCity] = React.useState("");
  const [rRegion, setRRegion] = React.useState("");
  const [rPhone, setRPhone] = React.useState("");
  const [rEmail, setREmail] = React.useState("");
  const [rAddress, setRAddress] = React.useState("");

  const createRestMut = useMutation({
    mutationFn: () =>
      adminCreateOrganizationRestaurant(oid, {
        ownerId,
        name: rName.trim(),
        region: rRegion.trim() || undefined,
        city: rCity.trim() || undefined,
        phone: rPhone.trim() || undefined,
        email: rEmail.trim() || undefined,
        address: rAddress.trim() || undefined,
      }),
    onSuccess: () => {
      showToast("Restoran oluşturuldu", "success");
      setRName("");
      setRCity("");
      setRRegion("");
      setRPhone("");
      setREmail("");
      setRAddress("");
      qc.invalidateQueries({ queryKey: ["admin-organization", oid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Restoran oluşturulamadı";
      showToast(msg, "error");
    },
  });

  const handleCreateRestaurant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) {
      showToast("Önce restoran sahibini seçin", "error");
      return;
    }
    if (!rName.trim()) {
      showToast("Restoran ismi zorunlu", "error");
      return;
    }
    createRestMut.mutate();
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
        <h2 className="text-lg font-semibold">
          {org?.name || "Organizasyon Detayı"}
        </h2>

        {/* Genel bilgiler */}
        <Card title="Bilgiler">
          {orgQ.isLoading ? (
            "Yükleniyor…"
          ) : !org ? (
            <div className="text-sm text-gray-500">
              Kayıt bulunamadı.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Ad</span>
                <div>{org.name}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Bölge</span>
                <div>{org.region || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">
                  Vergi No
                </span>
                <div>{org.taxNumber || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">
                  Oluşturulma
                </span>
                <div>
                  {org.createdAt
                    ? new Date(
                        org.createdAt
                      ).toLocaleString("tr-TR")
                    : "-"}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Organizasyon Üyeleri */}
        <Card title="Organizasyon Üyeleri">
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
                  {members.map((m) => {
                    const userId =
                      m.userId || m.user?._id || m._id || "";
                    const name =
                      m.name || m.user?.name || "İsimsiz";
                    const email =
                      m.email || m.user?.email || "-";
                    const role =
                      m.role ||
                      m.orgRole ||
                      m.organizationRole ||
                      "";

                    return (
                      <tr key={userId} className="border-t">
                        <td className="py-2 px-4">{name}</td>
                        <td className="py-2 px-4">{email}</td>
                        <td className="py-2 px-4">
                          {prettyOrgRole(role)}
                        </td>
                        <td className="py-2 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(userId)}
                            disabled={removeMemberMut.isPending}
                            className="px-2 py-1 text-xs rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60"
                          >
                            Kaldır
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-500 mb-4">
              Henüz bu organizasyona bağlı üye yok.
            </div>
          )}

          {/* Üye ekleme formu */}
          <form
            onSubmit={handleAddMember}
            className="grid md:grid-cols-3 gap-3 items-start"
          >
            <div className="md:col-span-2 space-y-1">
              <label className="block text-xs text-gray-600">
                Kullanıcı Ara (isim / e-posta)
              </label>
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
                type="submit"
                onClick={handleSearchMember}
                className="hidden"
              />
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
                {ORG_ROLES.map((r) => (
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
          </form>
        </Card>

        {/* Organizasyona bağlı restoranlar */}
        <Card title="Bu Organizasyona Bağlı Restoranlar">
          {restaurants && restaurants.length > 0 ? (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">Ad</th>
                    <th className="py-2 px-4">Şehir</th>
                    <th className="py-2 px-4">Bölge</th>
                    <th className="py-2 px-4">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="py-2 px-4">
                        <Link
                          to={`/admin/restaurants/${r._id}`}
                          className="text-brand-700 underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2 px-4">
                        {r.city || "-"}
                      </td>
                      <td className="py-2 px-4">
                        {r.region || "-"}
                      </td>
                      <td className="py-2 px-4">
                        {r.isActive ? (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700">
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-rose-50 text-rose-700">
                            Pasif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Henüz bu organizasyona bağlı restoran yok.
            </div>
          )}
        </Card>

        {/* Bu organizasyona yeni restoran ekle */}
        <Card title="Bu Organizasyona Yeni Restoran (Şube) Ekle">
          {/* Owner search */}
          <form
            onSubmit={handleSearchOwner}
            className="space-y-3 mb-4"
          >
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">
                  Restoran Sahibi Ara (isim / e-posta)
                </label>
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                  value={ownerQuery}
                  onChange={(e) => setOwnerQuery(e.target.value)}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={ownerSearchLoading}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm w-full disabled:opacity-60"
                >
                  {ownerSearchLoading ? "Aranıyor…" : "Kullanıcı Ara"}
                </button>
              </div>
            </div>

            {ownerResults.length > 0 && (
              <div className="border rounded-lg p-2 max-h-48 overflow-auto text-sm bg-gray-50">
                {ownerResults.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => selectOwner(u)}
                    className="w-full flex justify-between items-center px-2 py-1 rounded-lg hover:bg-white text-left"
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

            {ownerLabel && (
              <div className="text-xs text-emerald-700 mt-1">
                Seçili sahip: {ownerLabel}
              </div>
            )}
          </form>

          {/* Restaurant form */}
          <form
            onSubmit={handleCreateRestaurant}
            className="grid md:grid-cols-3 gap-3"
          >
            <div className="md:col-span-1">
              <label className="block text-xs text-gray-600 mb-1">
                Restoran Adı *
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Şehir
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={rCity}
                onChange={(e) => setRCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Bölge (ülke kodu, örn: TR, UK)
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={rRegion}
                onChange={(e) =>
                  setRRegion(e.target.value.toUpperCase())
                }
                maxLength={2}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Telefon
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                E-posta
              </label>
              <input
                type="email"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Adres
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={rAddress}
                onChange={(e) => setRAddress(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={createRestMut.isPending}
                className="mt-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
              >
                {createRestMut.isPending
                  ? "Restoran oluşturuluyor…"
                  : "Bu Organizasyona Restoran Ekle"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}