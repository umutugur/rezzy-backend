import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  api,
  adminGetUserStats,
  adminExportUsers,
  adminResetUserPassword,
} from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Stat, StatGrid } from "../../components/Card";
import Modal from "../../components/Modal";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

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
  const { t } = useI18n();
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

  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetTarget, setResetTarget] = React.useState<User | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetPassword2, setResetPassword2] = React.useState("");
  const [resetBusy, setResetBusy] = React.useState(false);

  const openReset = (u: User) => {
    setResetTarget(u);
    setResetPassword("");
    setResetPassword2("");
    setResetOpen(true);
  };

  const genRandom = () => {
    const v = Math.random().toString(36).slice(-10);
    setResetPassword(v);
    setResetPassword2(v);
  };

  const copyPassword = async () => {
    try {
      if (!resetPassword) return;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resetPassword);
        showToast(t("Şifre kopyalandı"), "success");
      }
    } catch {}
  };

  const submitReset = async () => {
    const target = resetTarget;
    if (!target) return;
    const p1 = String(resetPassword || "").trim();
    const p2 = String(resetPassword2 || "").trim();
    if (p1.length < 8) {
      showToast(t("Şifre en az 8 karakter olmalı"), "error");
      return;
    }
    if (p1 !== p2) {
      showToast(t("Şifreler eşleşmiyor"), "error");
      return;
    }
    setResetBusy(true);
    try {
      await adminResetUserPassword(target._id, p1);
      showToast(t("Şifre sıfırlandı"), "success");
      setResetOpen(false);
    } catch (e: any) {
      showToast(
        e?.response?.data?.message || e?.message || t("Şifre sıfırlanamadı"),
        "error"
      );
    } finally {
      setResetBusy(false);
    }
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Kullanıcılar")}</h2>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm"
          >
            {t("CSV Dışa Aktar")}
          </button>
        </div>

        {/* İstatistik Kartları */}
        {statsQ.data && (
          <StatGrid>
            <Stat label={t("Toplam Kullanıcı")} value={statsQ.data.total} />
            <Stat label={t("Banlı")} value={statsQ.data.banned} />
            <Stat label={t("Yüksek Riskli")} value={statsQ.data.highRisk} />
            <Stat
              label={t("Ortalama Risk")}
              value={statsQ.data.avgRisk.toFixed(1)}
              helper="/100"
            />
          </StatGrid>
        )}

        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && <div className="text-red-600 text-sm">{t("Liste çekilemedi")}</div>}

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">{t("Ad")}</th>
                <th className="py-2 px-4">{t("E-posta")}</th>
                <th className="py-2 px-4">{t("Telefon")}</th>
                <th className="py-2 px-4">{t("Rol")}</th>
                <th className="py-2 px-4">{t("Risk")}</th>
                <th className="py-2 px-4">{t("Durum")}</th>
                <th className="py-2 px-4">{t("İşlem")}</th>
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
                          title={t("Risk skoru (0–100)")}
                        >
                          {u.riskScore ?? 0}
                        </span>
                        {typeof u.noShowCount === "number" && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200"
                            title={t("No-show sayısı")}
                          >
                            {t("NS: {count}", { count: u.noShowCount })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      {u.banned ? (
                        <span className="text-red-600 font-medium">{t("Banlı")}</span>
                      ) : (
                        <span className="text-green-700 font-medium">
                          {t("Aktif")}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <button
                        onClick={() => openReset(u)}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
                      >
                        {t("Şifre Sıfırla")}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(!data || data.length === 0) && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={7}>
                    {t("Kayıt yok")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("Şifre Sıfırla")}
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            {resetTarget?.name} • {resetTarget?.email || resetTarget?.phone || resetTarget?._id}
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">{t("Yeni Şifre")}</label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder={t("En az 8 karakter")}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">{t("Yeni Şifre (Tekrar)")}</label>
            <input
              type="password"
              value={resetPassword2}
              onChange={(e) => setResetPassword2(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder={t("Tekrar")}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={genRandom}
            >
              {t("Rastgele Üret")}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={copyPassword}
              disabled={!resetPassword}
            >
              {t("Kopyala")}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setResetOpen(false)}
              disabled={resetBusy}
            >
              {t("Vazgeç")}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
              onClick={submitReset}
              disabled={resetBusy}
            >
              {resetBusy ? t("Sıfırlanıyor…") : t("Sıfırla")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
