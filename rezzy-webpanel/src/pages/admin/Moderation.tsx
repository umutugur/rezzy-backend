import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import {
  adminListReviews,
  adminHideReview,
  adminUnhideReview,
  adminDeleteReview,
  adminListComplaints,
  adminResolveComplaint,
  adminDismissComplaint
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

export default function AdminModerationPage() {
  const [tab, setTab] = React.useState<"reviews" | "complaints">("reviews");
  const { t } = useI18n();
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
        <h2 className="text-lg font-semibold">{t("Moderasyon")}</h2>

        <div className="flex gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg ${
              tab === "reviews" ? "bg-brand-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
            onClick={() => setTab("reviews")}
          >
            {t("Yorumlar")}
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg ${
              tab === "complaints" ? "bg-brand-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
            onClick={() => setTab("complaints")}
          >
            {t("Şikayetler")}
          </button>
        </div>

        {tab === "reviews" ? <ReviewsTable /> : <ComplaintsTable />}
      </div>
    </div>
  );
}

function ReviewsTable() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => adminListReviews({ limit: 500 })
  });

  const hideMut = useMutation({
    mutationFn: (id: string) => adminHideReview(id),
    onSuccess: () => {
      showToast(t("Yorum gizlendi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });
  const unhideMut = useMutation({
    mutationFn: (id: string) => adminUnhideReview(id),
    onSuccess: () => {
      showToast(t("Yorum görünür yapıldı"), "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });
  const delMut = useMutation({
    mutationFn: (id: string) => adminDeleteReview(id),
    onSuccess: () => {
      showToast(t("Yorum silindi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });

  const rows = Array.isArray(q.data?.items) ? q.data.items : Array.isArray(q.data) ? q.data : [];

  return (
    <Card title={t("Yorumlar")}>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 px-4">{t("Tarih")}</th>
              <th className="py-2 px-4">{t("Restoran")}</th>
              <th className="py-2 px-4">{t("Kullanıcı")}</th>
              <th className="py-2 px-4">{t("Puan")}</th>
              <th className="py-2 px-4">{t("Yorum")}</th>
              <th className="py-2 px-4">{t("Durum")}</th>
              <th className="py-2 px-4">{t("Aksiyon")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r._id} className="border-t">
                <td className="py-2 px-4">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</td>
                <td className="py-2 px-4">{r.restaurant?.name || "-"}</td>
                <td className="py-2 px-4">{r.user?.name || "-"} <span className="text-gray-500">({r.user?.email || "-"})</span></td>
                <td className="py-2 px-4">{r.rating ?? "-"}</td>
                <td className="py-2 px-4">{r.comment ?? "-"}</td>
                <td className="py-2 px-4">{r.hidden ? t("Gizli") : t("Görünür")}</td>
                <td className="py-2 px-4">
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => hideMut.mutate(r._id)} disabled={r.hidden}>{t("Gizle")}</button>
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => unhideMut.mutate(r._id)} disabled={!r.hidden}>{t("Göster")}</button>
                    <button className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700" onClick={() => delMut.mutate(r._id)}>{t("Sil")}</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="py-3 px-4 text-gray-500" colSpan={7}>{t("Kayıt yok")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ComplaintsTable() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: () => adminListComplaints({ limit: 500 })
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => adminResolveComplaint(id),
    onSuccess: () => {
      showToast(t("Şikayet çözümlendi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
    }
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => adminDismissComplaint(id),
    onSuccess: () => {
      showToast(t("Şikayet reddedildi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
    }
  });

  const rows = Array.isArray(q.data?.items) ? q.data.items : Array.isArray(q.data) ? q.data : [];

  return (
    <Card title={t("Şikayetler")}>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 px-4">{t("Tarih")}</th>
              <th className="py-2 px-4">{t("Restoran")}</th>
              <th className="py-2 px-4">{t("Kullanıcı")}</th>
              <th className="py-2 px-4">{t("Konu")}</th>
              <th className="py-2 px-4">{t("Durum")}</th>
              <th className="py-2 px-4">{t("Aksiyon")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c._id} className="border-t">
                <td className="py-2 px-4">{c.createdAt ? new Date(c.createdAt).toLocaleString() : "-"}</td>
                <td className="py-2 px-4">{c.restaurant?.name || "-"}</td>
                <td className="py-2 px-4">{c.user?.name || "-"} <span className="text-gray-500">({c.user?.email || "-"})</span></td>
                <td className="py-2 px-4">{c.subject || "-"}</td>
                <td className="py-2 px-4">{c.status || "-"}</td>
                <td className="py-2 px-4">
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => resolveMut.mutate(c._id)} disabled={c.status === "resolved"}>{t("Çöz")}</button>
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => dismissMut.mutate(c._id)} disabled={c.status === "dismissed"}>{t("Reddet")}</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="py-3 px-4 text-gray-500" colSpan={6}>{t("Kayıt yok")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
