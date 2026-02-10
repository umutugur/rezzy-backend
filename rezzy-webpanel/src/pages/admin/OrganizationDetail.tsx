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
  adminUpdateOrganization,
  type AdminOrganization,
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { DEFAULT_LANGUAGE, LANG_OPTIONS } from "../../utils/languages";
import { t as i18nT, useI18n } from "../../i18n";

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
      return i18nT("Owner");
    case "org_admin":
      return i18nT("Admin");
    case "org_finance":
      return i18nT("Finans");
    case "org_staff":
      return i18nT("Staff");
    default:
      return role;
  }
}

export default function AdminOrganizationDetailPage() {
  const { oid = "" } = useParams<{ oid: string }>();
  const qc = useQueryClient();
  const { t } = useI18n();

  const orgQ = useQuery<OrgDetail | null>({
    queryKey: ["admin-organization", oid],
    queryFn: async () => (await adminGetOrganization(oid)) as OrgDetail,
    enabled: !!oid,
  });

  const org = orgQ.data;
  const [orgLang, setOrgLang] = React.useState<string>(DEFAULT_LANGUAGE);

  React.useEffect(() => {
    if (org?.defaultLanguage) {
      setOrgLang(String(org.defaultLanguage));
    } else {
      setOrgLang(DEFAULT_LANGUAGE);
    }
  }, [org?.defaultLanguage]);

  const updateOrgLangMut = useMutation({
    mutationFn: () =>
      adminUpdateOrganization(oid, { defaultLanguage: orgLang }),
    onSuccess: () => {
      showToast(t("Organizasyon dili güncellendi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-organization", oid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message || err?.message || t("Dil güncellenemedi");
      showToast(msg, "error");
    },
  });

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
        t("Kullanıcı aranamadı");
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
      showToast(t("Üye eklendi"), "success");
      setSelectedMember(null);
      setMemberQuery("");
      setMemberRole("org_admin");
      qc.invalidateQueries({ queryKey: ["admin-organization", oid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t("Üye eklenemedi");
      showToast(msg, "error");
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (userId: string) =>
      adminRemoveOrganizationMember(oid, userId),
    onSuccess: () => {
      showToast(t("Üyelik kaldırıldı"), "success");
      qc.invalidateQueries({ queryKey: ["admin-organization", oid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t("Üyelik kaldırılamadı");
      showToast(msg, "error");
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember?._id) {
      showToast(t("Önce kullanıcı seçin"), "error");
      return;
    }
    if (!memberRole) {
      showToast(t("Rol seçin"), "error");
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
        t("Kullanıcı aranamadı");
      showToast(msg, "error");
    } finally {
      setOwnerSearchLoading(false);
    }
  };

  const selectOwner = (u: UserOption) => {
    setOwnerId(u._id);
    setOwnerLabel(
      `${u.name || t("İsimsiz")} (${u.email || t("e-posta yok")})`
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
      showToast(t("Restoran oluşturuldu"), "success");
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
        t("Restoran oluşturulamadı");
      showToast(msg, "error");
    },
  });

  const handleCreateRestaurant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerId) {
      showToast(t("Önce restoran sahibini seçin"), "error");
      return;
    }
    if (!rName.trim()) {
      showToast(t("Restoran ismi zorunlu"), "error");
      return;
    }
    createRestMut.mutate();
  };

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
        <h2 className="text-lg font-semibold">
          {org?.name || t("Organizasyon Detayı")}
        </h2>

        {/* Genel bilgiler */}
        <Card title={t("Bilgiler")}>
          {orgQ.isLoading ? (
            t("Yükleniyor…")
          ) : !org ? (
            <div className="text-sm text-gray-500">
              {t("Kayıt bulunamadı.")}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500 text-sm">{t("Ad")}</span>
                  <div>{org.name}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">{t("Bölge")}</span>
                  <div>{org.region || "-"}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">
                    {t("Vergi No")}
                  </span>
                  <div>{org.taxNumber || "-"}</div>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">
                    {t("Oluşturulma")}
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

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    {t("Varsayılan Dil")}
                  </label>
                  <select
                    className="border rounded-lg px-3 py-2 text-sm bg-white"
                    value={orgLang}
                    onChange={(e) => setOrgLang(e.target.value)}
                  >
                    {LANG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs disabled:opacity-60"
                  onClick={() => updateOrgLangMut.mutate()}
                  disabled={
                    updateOrgLangMut.isPending ||
                    orgLang === (org.defaultLanguage || DEFAULT_LANGUAGE)
                  }
                >
                  {updateOrgLangMut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Organizasyon Üyeleri */}
        <Card title={t("Organizasyon Üyeleri")}>
          {/* Liste */}
          {members && members.length > 0 ? (
            <div className="overflow-auto mb-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Ad")}</th>
                    <th className="py-2 px-4">{t("E-posta")}</th>
                    <th className="py-2 px-4">{t("Rol")}</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const userId =
                      m.userId || m.user?._id || m._id || "";
                    const name =
                      m.name || m.user?.name || t("İsimsiz");
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
                            {t("Kaldır")}
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
              {t("Henüz bu organizasyona bağlı üye yok.")}
            </div>
          )}

          {/* Üye ekleme formu */}
          <form
            onSubmit={handleAddMember}
            className="grid md:grid-cols-3 gap-3 items-start"
          >
            <div className="md:col-span-2 space-y-1">
              <label className="block text-xs text-gray-600">
                {t("Kullanıcı Ara (isim / e-posta)")}
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
                      {t("Aranıyor…")}
                    </div>
                  )}
                  {!memberSearchLoading &&
                    memberResults.length === 0 &&
                    memberQuery.trim() && (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {t("Sonuç yok")}
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
                        {u.name || t("İsimsiz")}{" "}
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
                  ? t("Seçili kullanıcı: {name} ({email})", {
                      name: selectedMember.name || t("İsimsiz"),
                      email: selectedMember.email || "-",
                    })
                  : t("Henüz kullanıcı seçilmedi")}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-gray-600 mb-1">
                {t("Rol")}
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value)}
              >
                {ORG_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.label)}
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
                  ? t("Ekleniyor…")
                  : t("Üye Ekle")}
              </button>
            </div>
          </form>
        </Card>

        {/* Organizasyona bağlı restoranlar */}
        <Card title={t("Bu Organizasyona Bağlı Restoranlar")}>
          {restaurants && restaurants.length > 0 ? (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Ad")}</th>
                    <th className="py-2 px-4">{t("Şehir")}</th>
                    <th className="py-2 px-4">{t("Bölge")}</th>
                    <th className="py-2 px-4">{t("Durum")}</th>
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
                            {t("Aktif")}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-rose-50 text-rose-700">
                            {t("Pasif")}
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
              {t("Henüz bu organizasyona bağlı restoran yok.")}
            </div>
          )}
        </Card>

        {/* Bu organizasyona yeni restoran ekle */}
        <Card title={t("Bu Organizasyona Yeni Restoran (Şube) Ekle")}>
          {/* Owner search */}
          <form
            onSubmit={handleSearchOwner}
            className="space-y-3 mb-4"
          >
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">
                  {t("Restoran Sahibi Ara (isim / e-posta)")}
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
                  {ownerSearchLoading ? t("Aranıyor…") : t("Kullanıcı Ara")}
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
                      {u.name || t("İsimsiz")}{" "}
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
                {t("Seçili sahip: {label}", { label: ownerLabel })}
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
                {t("Restoran Adı *")}
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
                {t("Şehir")}
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
                {t("Bölge (ülke kodu, örn: TR, UK)")}
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
                {t("Telefon")}
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
                {t("E-posta")}
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
                {t("Adres")}
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
                  ? t("Restoran oluşturuluyor…")
                  : t("Bu Organizasyona Restoran Ekle")}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
