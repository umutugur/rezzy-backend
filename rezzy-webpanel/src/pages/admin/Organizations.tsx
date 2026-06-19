import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card";
import {
  adminListOrganizations,
  adminCreateOrganization,
  adminSearchUsers,
  type AdminOrganization,
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { LANG_OPTIONS, DEFAULT_LANGUAGE } from "../../utils/languages";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

type UserLite = { _id: string; name?: string; email?: string; role?: string };

async function fetchOrganizations(
  query: string
): Promise<AdminOrganization[]> {
  const params = query ? { query } : undefined;
  return adminListOrganizations(params);
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls =
  "border rounded-lg px-3 py-2 w-full text-sm bg-white";

export default function AdminOrganizationsPage() {
  const { t } = useI18n();
  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-organizations", search],
    queryFn: () => fetchOrganizations(search),
  });

  // Yeni organization form state
  const [name, setName] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [taxNumber, setTaxNumber] = React.useState("");
  const [defaultLanguage, setDefaultLanguage] =
    React.useState(DEFAULT_LANGUAGE);

  // Owner seçimi
  const [ownerQuery, setOwnerQuery] = React.useState("");
  const [owner, setOwner] = React.useState<UserLite | null>(null);

  const userSearchQ = useQuery({
    queryKey: ["admin-org-owner-search", ownerQuery],
    queryFn: () => adminSearchUsers(ownerQuery),
    enabled: ownerQuery.trim().length >= 2,
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminCreateOrganization({
        name: name.trim(),
        region: region.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        defaultLanguage,
        ownerId: owner?._id as string,
      }),
    onSuccess: (org) => {
      showToast(t("Organizasyon oluşturuldu"), "success");
      setName("");
      setRegion("");
      setTaxNumber("");
      setDefaultLanguage(DEFAULT_LANGUAGE);
      setOwner(null);
      setOwnerQuery("");

      qc.invalidateQueries({ queryKey: ["admin-organizations"] });

      // Otomatik detay sayfasına yönlendir:
      nav(`/admin/organizations/${org._id}`);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t("Organizasyon oluşturulamadı");
      showToast(msg, "error");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast(t("İsim zorunlu"), "error");
      return;
    }
    if (!owner?._id) {
      showToast(t("Önce organizasyon sahibi kullanıcıyı seçin"), "error");
      return;
    }
    createMut.mutate();
  };

  const list = data ?? [];

  return (
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Organizasyonlar")}
        subtitle={t("Tüm organizasyonları yönetin")}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="text"
              placeholder={t("İsim / vergi no / bölge ara…")}
              style={{
                border: "1px solid var(--rezvix-border-strong)",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 13,
                background: "var(--rezvix-bg-elevated)",
                color: "var(--rezvix-text-main)",
                outline: "none",
                minWidth: 220,
              }}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button
              onClick={() => setSearch(searchInput.trim())}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid var(--rezvix-border-strong)",
                background: "var(--rezvix-bg-soft)",
                color: "var(--rezvix-text-main)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("Ara")}
            </button>
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                }}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  color: "var(--rezvix-text-soft)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {t("Temizle")}
              </button>
            )}
          </div>
        }
      />

      {isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>
          {t("Yükleniyor…")}
        </div>
      )}
      {error && (
        <div style={{ color: "var(--rezvix-danger)", fontSize: 13, marginBottom: 12 }}>
          {t("Organizasyon listesi alınamadı")}
        </div>
      )}

      {/* Liste */}
      <div
        style={{
          background: "var(--rezvix-bg-elevated)",
          borderRadius: "var(--rezvix-radius-lg)",
          border: "1px solid var(--rezvix-border-subtle)",
          boxShadow: "var(--rezvix-shadow-soft)",
          overflow: "auto",
          marginBottom: 24,
        }}
      >
        <table style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr
              style={{
                background: "var(--rezvix-bg-soft)",
                textAlign: "left",
              }}
            >
              {[t("Ad"), t("Bölge"), t("Vergi No"), t("Restoran Sayısı"), t("Oluşturulma")].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      color: "var(--rezvix-text-soft)",
                      fontWeight: 600,
                      fontSize: 12,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const restaurantsCount =
                (o as any).restaurantsCount ??
                (o as any).restaurantCount ??
                (o as any).branchesCount ??
                "-";

              return (
                <tr
                  key={o._id}
                  style={{
                    borderTop: "1px solid var(--rezvix-border-subtle)",
                  }}
                >
                  <td style={{ padding: "10px 16px" }}>
                    <Link
                      to={`/admin/organizations/${o._id}`}
                      style={{
                        color: "var(--rezvix-primary)",
                        fontWeight: 600,
                        textDecoration: "underline",
                        fontSize: 13,
                      }}
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                    {o.region || "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                    {o.taxNumber || "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                    {restaurantsCount}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                    {o.createdAt
                      ? new Date(o.createdAt).toLocaleDateString("tr-TR")
                      : "-"}
                  </td>
                </tr>
              );
            })}
            {(!list || list.length === 0) && (
              <tr>
                <td
                  style={{
                    padding: "14px 16px",
                    color: "var(--rezvix-text-soft)",
                    fontSize: 13,
                  }}
                  colSpan={5}
                >
                  {t("Kayıt yok")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Yeni organization formu */}
      <Card title={t("Yeni Organizasyon Ekle")}>
        <div className="space-y-4">
          {/* Owner seçimi */}
          <div>
            <h3
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: "var(--rezvix-text-main)",
              }}
            >
              {t("Organizasyon Sahibi Seçimi")}
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--rezvix-text-soft)",
                    marginBottom: 4,
                  }}
                >
                  {t("Kullanıcı Ara (isim / e-posta)")}
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={ownerQuery}
                  onChange={(e) => {
                    setOwnerQuery(e.target.value);
                    setOwner(null);
                  }}
                  placeholder={t("En az 2 karakter girin")}
                />
                {ownerQuery.trim().length >= 2 && (
                  <div
                    style={{
                      marginTop: 8,
                      maxHeight: 192,
                      overflow: "auto",
                      border: "1px solid var(--rezvix-border-strong)",
                      borderRadius: 8,
                      background: "var(--rezvix-bg-elevated)",
                    }}
                  >
                    {userSearchQ.isLoading && (
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
                    {userSearchQ.data?.length === 0 && !userSearchQ.isLoading && (
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
                    {(userSearchQ.data ?? []).map((u: UserLite) => (
                      <button
                        key={u._id}
                        type="button"
                        onClick={() => setOwner(u)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          fontSize: 13,
                          cursor: "pointer",
                          border: "none",
                          background:
                            owner?._id === u._id
                              ? "var(--rezvix-primary-soft)"
                              : "transparent",
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{u.name || "-"}</div>
                        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                          {u.email || ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--rezvix-text-soft)",
                    marginBottom: 4,
                  }}
                >
                  {t("Seçilen Sahip")}
                </label>
                <div
                  style={{
                    border: "1px solid var(--rezvix-border-strong)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    minHeight: 42,
                    background: "var(--rezvix-bg-elevated)",
                  }}
                >
                  {owner ? (
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--rezvix-text-main)" }}>
                        {owner.name || "-"}
                      </div>
                      <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                        {owner.email || ""}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
                      {t("Henüz seçilmedi")}
                    </span>
                  )}
                </div>
                <p style={{ marginTop: 4, fontSize: 11, color: "var(--rezvix-text-soft)" }}>
                  {t(
                    "Organizasyon oluştururken en az bir ana sahip kullanıcı seçilmelidir."
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Form alanları */}
          <form
            onSubmit={handleCreate}
            className="grid gap-3 md:grid-cols-3"
          >
            <div className="md:col-span-1">
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--rezvix-text-soft)",
                  marginBottom: 4,
                }}
              >
                {t("İsim *")}
              </label>
              <input
                type="text"
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--rezvix-text-soft)",
                  marginBottom: 4,
                }}
              >
                {t("Bölge (ülke kodu, örn: TR, UK)")}
              </label>
              <input
                type="text"
                className={inputCls}
                value={region}
                onChange={(e) => setRegion(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--rezvix-text-soft)",
                  marginBottom: 4,
                }}
              >
                {t("Varsayılan Dil")}
              </label>
              <select
                className={inputCls}
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
              >
                {LANG_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--rezvix-text-soft)",
                  marginBottom: 4,
                }}
              >
                {t("Vergi No")}
              </label>
              <input
                type="text"
                className={inputCls}
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={createMut.isPending}
                style={{
                  marginTop: 8,
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  background: "var(--rezvix-primary)",
                  color: "#fff",
                  opacity: createMut.isPending ? 0.6 : 1,
                  transition: "opacity 0.15s ease",
                }}
              >
                {createMut.isPending
                  ? t("Oluşturuluyor…")
                  : t("Organizasyon Oluştur")}
              </button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
