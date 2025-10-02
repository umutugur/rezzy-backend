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

export default function AdminModerationPage() {
  const [tab, setTab] = React.useState<"reviews" | "complaints">("reviews");
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
        <h2 className="text-lg font-semibold">Moderasyon</h2>

        <div className="flex gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg ${
              tab === "reviews" ? "bg-brand-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
            onClick={() => setTab("reviews")}
          >
            Yorumlar
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg ${
              tab === "complaints" ? "bg-brand-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
            onClick={() => setTab("complaints")}
          >
            Şikayetler
          </button>
        </div>

        {tab === "reviews" ? <ReviewsTable /> : <ComplaintsTable />}
      </div>
    </div>
  );
}

function ReviewsTable() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => adminListReviews({ limit: 500 })
  });

  const hideMut = useMutation({
    mutationFn: (id: string) => adminHideReview(id),
    onSuccess: () => {
      showToast("Yorum gizlendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });
  const unhideMut = useMutation({
    mutationFn: (id: string) => adminUnhideReview(id),
    onSuccess: () => {
      showToast("Yorum görünür yapıldı", "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });
  const delMut = useMutation({
    mutationFn: (id: string) => adminDeleteReview(id),
    onSuccess: () => {
      showToast("Yorum silindi", "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });

  const rows = Array.isArray(q.data?.items) ? q.data.items : Array.isArray(q.data) ? q.data : [];

  return (
    <Card title="Yorumlar">
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 px-4">Tarih</th>
              <th className="py-2 px-4">Restoran</th>
              <th className="py-2 px-4">Kullanıcı</th>
              <th className="py-2 px-4">Puan</th>
              <th className="py-2 px-4">Yorum</th>
              <th className="py-2 px-4">Durum</th>
              <th className="py-2 px-4">Aksiyon</th>
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
                <td className="py-2 px-4">{r.hidden ? "Gizli" : "Görünür"}</td>
                <td className="py-2 px-4">
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => hideMut.mutate(r._id)} disabled={r.hidden}>Gizle</button>
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => unhideMut.mutate(r._id)} disabled={!r.hidden}>Göster</button>
                    <button className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700" onClick={() => delMut.mutate(r._id)}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="py-3 px-4 text-gray-500" colSpan={7}>Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ComplaintsTable() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: () => adminListComplaints({ limit: 500 })
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => adminResolveComplaint(id),
    onSuccess: () => {
      showToast("Şikayet çözümlendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
    }
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => adminDismissComplaint(id),
    onSuccess: () => {
      showToast("Şikayet reddedildi", "success");
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
    }
  });

  const rows = Array.isArray(q.data?.items) ? q.data.items : Array.isArray(q.data) ? q.data : [];

  return (
    <Card title="Şikayetler">
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2 px-4">Tarih</th>
              <th className="py-2 px-4">Restoran</th>
              <th className="py-2 px-4">Kullanıcı</th>
              <th className="py-2 px-4">Konu</th>
              <th className="py-2 px-4">Durum</th>
              <th className="py-2 px-4">Aksiyon</th>
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
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => resolveMut.mutate(c._id)} disabled={c.status === "resolved"}>Çöz</button>
                    <button className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => dismissMut.mutate(c._id)} disabled={c.status === "dismissed"}>Reddet</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="py-3 px-4 text-gray-500" colSpan={6}>Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
