import React from "react";
import { useParams, Link } from "react-router-dom";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Card } from "../../components/Card";
import {
  adminGetOrganization,
  adminCreateOrganizationRestaurant,
  adminSearchUsers,
  adminAddOrganizationMember,
  adminRemoveOrganizationMember,
  adminUpdateOrganization,
  type AdminOrganization,
  type AdminOrganizationDetail,
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { DEFAULT_LANGUAGE, LANG_OPTIONS } from "../../utils/languages";
import { t as i18nT, useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

type OrgDetail = AdminOrganizationDetail;

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

// ── Shared helpers ────────────────────────────────────────────────────────────
const inputCls = "border rounded-lg px-3 py-2 w-full text-sm bg-white";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--rezvix-text-soft)",
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  background: "var(--rezvix-primary)",
  color: "#fff",
  transition: "opacity 0.15s ease",
};

const secondaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-soft)",
  color: "var(--rezvix-text-muted)",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 500,
};

function ActiveBadge({ isActive }: { isActive?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: isActive
          ? "rgba(22, 163, 74, 0.10)"
          : "var(--rezvix-bg-soft)",
        color: isActive
          ? "var(--rezvix-success)"
          : "var(--rezvix-text-soft)",
        border: isActive
          ? "1px solid rgba(22, 163, 74, 0.25)"
          : "1px solid var(--rezvix-border-subtle)",
      }}
    >
      {isActive ? t("Aktif") : t("Pasif")}
    </span>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: "10px 16px",
  color: "var(--rezvix-text-soft)",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  background: "var(--rezvix-bg-soft)",
  textAlign: "left",
};

export default function AdminOrganizationDetailPage() {
  const { oid = "" } = useParams<{ oid: string }>();
  const qc = useQueryClient();
  const { t } = useI18n();

  const orgQ = useQuery<OrgDetail | null>({
    queryKey: ["admin-organization", oid],
    queryFn: () => adminGetOrganization(oid),
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

  const marketStores: Array<{
    _id: string;
    name: string;
    city?: string;
    isActive?: boolean;
    rating?: number;
    totalOrders?: number;
  }> = org?.marketStores ?? [];

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
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={org?.name || t("Organizasyon Detayı")}
        subtitle={t("Organizasyon bilgileri ve yönetimi")}
      />

      {/* Genel bilgiler */}
      <Card title={t("Bilgiler")}>
        {orgQ.isLoading ? (
          <span style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
            {t("Yükleniyor…")}
          </span>
        ) : !org ? (
          <div style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
            {t("Kayıt bulunamadı.")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("Ad")}
                </span>
                <div style={{ color: "var(--rezvix-text-main)", fontSize: 14 }}>
                  {org.name}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("Bölge")}
                </span>
                <div style={{ color: "var(--rezvix-text-main)", fontSize: 14 }}>
                  {org.region || "-"}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("Vergi No")}
                </span>
                <div style={{ color: "var(--rezvix-text-main)", fontSize: 14 }}>
                  {org.taxNumber || "-"}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("Oluşturulma")}
                </span>
                <div style={{ color: "var(--rezvix-text-main)", fontSize: 14 }}>
                  {org.createdAt
                    ? new Date(org.createdAt).toLocaleString("tr-TR")
                    : "-"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label style={labelStyle}>{t("Varsayılan Dil")}</label>
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
                style={{
                  ...primaryBtn,
                  fontSize: 12,
                  padding: "8px 14px",
                  opacity:
                    updateOrgLangMut.isPending ||
                    orgLang === (org.defaultLanguage || DEFAULT_LANGUAGE)
                      ? 0.5
                      : 1,
                }}
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

      <div style={{ marginTop: 20 }}>
        {/* Organizasyon Üyeleri */}
        <Card title={t("Organizasyon Üyeleri")}>
          {/* Liste */}
          {members && members.length > 0 ? (
            <div style={{ overflow: "auto", marginBottom: 16 }}>
              <table
                style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr>
                    {[t("Ad"), t("E-posta"), t("Rol"), ""].map((h, i) => (
                      <th key={i} style={tableHeaderStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const userId =
                      m.userId || m.user?._id || m._id || "";
                    const memberName =
                      m.name || m.user?.name || t("İsimsiz");
                    const memberEmail =
                      m.email || m.user?.email || "-";
                    const role =
                      m.role ||
                      m.orgRole ||
                      m.organizationRole ||
                      "";

                    return (
                      <tr
                        key={userId}
                        style={{
                          borderTop: "1px solid var(--rezvix-border-subtle)",
                        }}
                      >
                        <td
                          style={{
                            padding: "10px 16px",
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {memberName}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {memberEmail}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {prettyOrgRole(role)}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            textAlign: "right",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(userId)}
                            disabled={removeMemberMut.isPending}
                            style={{
                              ...secondaryBtn,
                              opacity: removeMemberMut.isPending ? 0.5 : 1,
                            }}
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
            <div
              style={{
                fontSize: 13,
                color: "var(--rezvix-text-soft)",
                marginBottom: 16,
              }}
            >
              {t("Henüz bu organizasyona bağlı üye yok.")}
            </div>
          )}

          {/* Üye ekleme formu */}
          <form
            onSubmit={handleAddMember}
            className="grid md:grid-cols-3 gap-3 items-start"
          >
            <div className="md:col-span-2 space-y-1">
              <label style={labelStyle}>
                {t("Kullanıcı Ara (isim / e-posta)")}
              </label>
              <input
                type="text"
                className={inputCls}
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
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 192,
                    overflow: "auto",
                    border: "1px solid var(--rezvix-border-strong)",
                    borderRadius: 8,
                    background: "var(--rezvix-bg-soft)",
                  }}
                >
                  {memberSearchLoading && (
                    <div
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      {t("Aranıyor…")}
                    </div>
                  )}
                  {!memberSearchLoading &&
                    memberResults.length === 0 &&
                    memberQuery.trim() && (
                      <div
                        style={{
                          padding: "8px 12px",
                          fontSize: 13,
                          color: "var(--rezvix-text-soft)",
                        }}
                      >
                        {t("Sonuç yok")}
                      </div>
                    )}
                  {memberResults.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => selectMember(u)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        border: "none",
                        background:
                          selectedMember?._id === u._id
                            ? "var(--rezvix-primary-soft)"
                            : "transparent",
                        color: "var(--rezvix-text-main)",
                      }}
                    >
                      <span>
                        {u.name || t("İsimsiz")}{" "}
                        <span style={{ color: "var(--rezvix-text-soft)" }}>
                          ({u.email || "-"})
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--rezvix-text-soft)",
                        }}
                      >
                        {u.role || ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: "var(--rezvix-success)",
                  marginTop: 4,
                }}
              >
                {selectedMember
                  ? t("Seçili kullanıcı: {name} ({email})", {
                      name: selectedMember.name || t("İsimsiz"),
                      email: selectedMember.email || "-",
                    })
                  : t("Henüz kullanıcı seçilmedi")}
              </div>
            </div>

            <div className="space-y-2">
              <label style={{ ...labelStyle, marginBottom: 4 }}>
                {t("Rol")}
              </label>
              <select
                className={inputCls}
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
                style={{
                  ...primaryBtn,
                  marginTop: 8,
                  width: "100%",
                  fontSize: 12,
                  padding: "8px 14px",
                  opacity:
                    !selectedMember || !memberRole || addMemberMut.isPending
                      ? 0.5
                      : 1,
                }}
              >
                {addMemberMut.isPending
                  ? t("Ekleniyor…")
                  : t("Üye Ekle")}
              </button>
            </div>
          </form>
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        {/* Organizasyona bağlı restoranlar */}
        <Card title={t("Bu Organizasyona Bağlı Restoranlar")}>
          {restaurants && restaurants.length > 0 ? (
            <div style={{ overflow: "auto" }}>
              <table
                style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr>
                    {[t("Ad"), t("Şehir"), t("Bölge"), t("Durum")].map((h) => (
                      <th key={h} style={tableHeaderStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r) => (
                    <tr
                      key={r._id}
                      style={{
                        borderTop: "1px solid var(--rezvix-border-subtle)",
                      }}
                    >
                      <td style={{ padding: "10px 16px" }}>
                        <Link
                          to={`/admin/restaurants/${r._id}`}
                          style={{
                            color: "var(--rezvix-primary)",
                            fontWeight: 600,
                            textDecoration: "underline",
                          }}
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        {r.city || "-"}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        {r.region || "-"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <ActiveBadge isActive={r.isActive} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
              {t("Henüz bu organizasyona bağlı restoran yok.")}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        {/* Organizasyona bağlı market şubeleri */}
        <Card title={t("Marketler")}>
          {marketStores && marketStores.length > 0 ? (
            <div style={{ overflow: "auto" }}>
              <table
                style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr>
                    {[t("Ad"), t("Şehir"), t("Durum"), t("Toplam Sipariş")].map((h) => (
                      <th key={h} style={tableHeaderStyle}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marketStores.map((m) => (
                    <tr
                      key={m._id}
                      style={{
                        borderTop: "1px solid var(--rezvix-border-subtle)",
                      }}
                    >
                      <td style={{ padding: "10px 16px" }}>
                        <Link
                          to={`/admin/market/stores/${m._id}`}
                          style={{
                            color: "var(--rezvix-primary)",
                            fontWeight: 600,
                            textDecoration: "underline",
                          }}
                        >
                          {m.name}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        {m.city || "-"}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <ActiveBadge isActive={m.isActive} />
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        {m.totalOrders ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
              {t("Bu zincire bağlı market yok")}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        {/* Bu organizasyona yeni restoran ekle */}
        <Card title={t("Bu Organizasyona Yeni Restoran (Şube) Ekle")}>
          {/* Owner search */}
          <form onSubmit={handleSearchOwner} className="space-y-3 mb-4">
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label style={labelStyle}>
                  {t("Restoran Sahibi Ara (isim / e-posta)")}
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={ownerQuery}
                  onChange={(e) => setOwnerQuery(e.target.value)}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={ownerSearchLoading}
                  style={{
                    ...secondaryBtn,
                    width: "100%",
                    padding: "9px 14px",
                    opacity: ownerSearchLoading ? 0.5 : 1,
                  }}
                >
                  {ownerSearchLoading ? t("Aranıyor…") : t("Kullanıcı Ara")}
                </button>
              </div>
            </div>

            {ownerResults.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--rezvix-border-strong)",
                  borderRadius: 8,
                  padding: 8,
                  maxHeight: 192,
                  overflow: "auto",
                  fontSize: 13,
                  background: "var(--rezvix-bg-soft)",
                }}
              >
                {ownerResults.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    onClick={() => selectOwner(u)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      color: "var(--rezvix-text-main)",
                    }}
                  >
                    <span>
                      {u.name || t("İsimsiz")}{" "}
                      <span style={{ color: "var(--rezvix-text-soft)" }}>
                        ({u.email || "-"})
                      </span>
                    </span>
                    <span
                      style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}
                    >
                      {u.role || ""}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {ownerLabel && (
              <div style={{ fontSize: 11, color: "var(--rezvix-success)", marginTop: 4 }}>
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
              <label style={labelStyle}>{t("Restoran Adı *")}</label>
              <input
                type="text"
                className={inputCls}
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t("Şehir")}</label>
              <input
                type="text"
                className={inputCls}
                value={rCity}
                onChange={(e) => setRCity(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>
                {t("Bölge (ülke kodu, örn: TR, UK)")}
              </label>
              <input
                type="text"
                className={inputCls}
                value={rRegion}
                onChange={(e) =>
                  setRRegion(e.target.value.toUpperCase())
                }
                maxLength={2}
              />
            </div>

            <div>
              <label style={labelStyle}>{t("Telefon")}</label>
              <input
                type="text"
                className={inputCls}
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("E-posta")}</label>
              <input
                type="email"
                className={inputCls}
                value={rEmail}
                onChange={(e) => setREmail(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("Adres")}</label>
              <input
                type="text"
                className={inputCls}
                value={rAddress}
                onChange={(e) => setRAddress(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={createRestMut.isPending}
                style={{
                  ...primaryBtn,
                  marginTop: 8,
                  opacity: createRestMut.isPending ? 0.5 : 1,
                }}
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
