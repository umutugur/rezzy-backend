import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
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

type UserLite = { _id: string; name?: string; email?: string; role?: string };

async function fetchOrganizations(
  query: string
): Promise<AdminOrganization[]> {
  const params = query ? { query } : undefined;
  return adminListOrganizations(params);
}

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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{t("Organizasyonlar")}</h2>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={t("İsim / vergi no / bölge ara…")}
              className="border rounded-lg px-3 py-2 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button
              onClick={() => setSearch(searchInput.trim())}
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
            >
              {t("Ara")}
            </button>
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                }}
                className="px-2 py-1 text-xs text-gray-500"
              >
                {t("Temizle")}
              </button>
            )}
          </div>
        </div>

        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && (
          <div className="text-red-600 text-sm">
            {t("Organizasyon listesi alınamadı")}
          </div>
        )}

        {/* Liste */}
        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">{t("Ad")}</th>
                <th className="py-2 px-4">{t("Bölge")}</th>
                <th className="py-2 px-4">{t("Vergi No")}</th>
                <th className="py-2 px-4">{t("Restoran Sayısı")}</th>
                <th className="py-2 px-4">{t("Oluşturulma")}</th>
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
                  <tr key={o._id} className="border-t">
                    <td className="py-2 px-4">
                      <Link
                        to={`/admin/organizations/${o._id}`}
                        className="text-brand-700 underline"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="py-2 px-4">{o.region || "-"}</td>
                    <td className="py-2 px-4">{o.taxNumber || "-"}</td>
                    <td className="py-2 px-4">{restaurantsCount}</td>
                    <td className="py-2 px-4">
                      {o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString("tr-TR")
                        : "-"}
                    </td>
                  </tr>
                );
              })}
              {(!list || list.length === 0) && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={5}>
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
              <h3 className="text-sm font-medium mb-2">
                {t("Organizasyon Sahibi Seçimi")}
              </h3>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    {t("Kullanıcı Ara (isim / e-posta)")}
                  </label>
                  <input
                    type="text"
                    className="border rounded-lg px-3 py-2 w-full text-sm"
                    value={ownerQuery}
                    onChange={(e) => {
                      setOwnerQuery(e.target.value);
                      setOwner(null);
                    }}
                    placeholder={t("En az 2 karakter girin")}
                  />
                  {ownerQuery.trim().length >= 2 && (
                    <div className="mt-2 max-h-48 overflow-auto border rounded-lg">
                      {userSearchQ.isLoading && (
                        <div className="px-3 py-2 text-sm text-gray-500">
                          {t("Aranıyor…")}
                        </div>
                      )}
                      {userSearchQ.data?.length === 0 && !userSearchQ.isLoading && (
                        <div className="px-3 py-2 text-sm text-gray-500">
                          {t("Sonuç yok")}
                        </div>
                      )}
                      {(userSearchQ.data ?? []).map((u: UserLite) => (
                        <button
                          key={u._id}
                          type="button"
                          onClick={() => setOwner(u)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                            owner?._id === u._id ? "bg-brand-50" : ""
                          }`}
                        >
                          <div className="font-medium">{u.name || "-"}</div>
                          <div className="text-gray-500">{u.email || ""}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    {t("Seçilen Sahip")}
                  </label>
                  <div className="border rounded-lg px-3 py-2 min-h-[42px]">
                    {owner ? (
                      <div>
                        <div className="font-medium">{owner.name || "-"}</div>
                        <div className="text-gray-500 text-sm">
                          {owner.email || ""}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">
                        {t("Henüz seçilmedi")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("Organizasyon oluştururken en az bir ana sahip kullanıcı seçilmelidir.")}
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
                <label className="block text-xs text-gray-600 mb-1">
                  {t("İsim *")}
                </label>
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  {t("Bölge (ülke kodu, örn: TR, UK)")}
                </label>
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                  value={region}
                  onChange={(e) => setRegion(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  {t("Varsayılan Dil")}
                </label>
                <select
                  className="border rounded-lg px-3 py-2 w-full text-sm bg-white"
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
                <label className="block text-xs text-gray-600 mb-1">
                  {t("Vergi No")}
                </label>
                <input
                  type="text"
                  className="border rounded-lg px-3 py-2 w-full text-sm"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="mt-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
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
    </div>
  );
}
