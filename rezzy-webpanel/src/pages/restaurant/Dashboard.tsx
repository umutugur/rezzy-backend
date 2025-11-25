// pages/restaurant/Dashboard.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";

type Row = {
  _id: string;
  dateTimeUTC: string;
  partySize: number;
  status: "pending" | "confirmed" | "arrived" | "cancelled" | "no_show" | string;
  user?: { name?: string; email?: string };
  totalPrice?: number;
  depositAmount?: number;
};

type Range = { from?: string; to?: string };

function rangeParams(sel: string): Range {
  const today = new Date();
  const startOfMonth = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (sel) {
    case "month":
      return { from: fmt(startOfMonth), to: fmt(today) };
    case "30":
      return { from: fmt(daysAgo(30)), to: fmt(today) };
    case "90":
      return { from: fmt(daysAgo(90)), to: fmt(today) };
    case "all":
      return {};
    default:
      return { from: fmt(daysAgo(90)), to: fmt(today) };
  }
}

const trStatus: Record<string, string> = {
  pending: "Bekleyen",
  confirmed: "Onaylı",
  arrived: "Geldi",
  no_show: "Gelmedi",
  cancelled: "İptal",
};
function fmtStatus(s: string) {
  return trStatus[s] ?? s;
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtDT(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return iso;
  }
}
function pillClass(s: string) {
  switch (s) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "confirmed":
      return "bg-blue-100 text-blue-800";
    case "arrived":
      return "bg-green-100 text-green-800";
    case "no_show":
      return "bg-gray-200 text-gray-700";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

// --- API yardımcıları

/** Cursor'lı listeyi tamamen çeker (seçilen aralık içinde). */
async function fetchAllReservationsInRange(
  rid: string,
  p: Range
): Promise<Row[]> {
  const items: Row[] = [];
  let cursor: string | undefined = undefined;

  // Güvenli limit (backend tarafı zaten min(100,limit) yapıyor)
  const limit = 100;

  // Olası “çok veri” durumunda da çalışsın
  for (let page = 0; page < 100; page++) {
    const params: any = { ...p, limit };
    if (cursor) params.cursor = cursor;

    const { data } = await api.get(`/restaurants/${rid}/reservations`, {
      params,
    });

    const batch: Row[] = Array.isArray(data) ? (data as Row[]) : data?.items ?? [];
    if (!batch.length) break;

    items.push(...batch);

    const nextCursor: string | undefined = data?.nextCursor;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return items;
}

/** Dashboard kartları için gerekli özetleri hesaplar. */
async function fetchDashboardSummary(rid: string, sel: string) {
  const range = rangeParams(sel);
  const rows = await fetchAllReservationsInRange(rid, range);

  // Sayaçlar
  const counts = {
    total: rows.length,
    pending: 0,
    confirmed: 0,
    arrived: 0,
    cancelled: 0,
    no_show: 0,
  } as Record<string, number>;

  // Tutarlar
  let grossArrived = 0; // sadece arrived totalPrice
  let depositForConfirmedAndNoShow = 0; // sadece confirmed + no_show depositAmount

  for (const r of rows) {
    const st = r.status;
    if (counts[st] != null) counts[st] += 1;

    if (st === "arrived") {
      grossArrived += Number(r.totalPrice || 0);
    }
    if (st === "confirmed" || st === "no_show") {
      depositForConfirmedAndNoShow += Number(r.depositAmount || 0);
    }
  }

  return {
    rows, // yaklaşıan tablosu için ayrıca kısa liste çekeceğiz ama rows da lazım olabilir
    counts,
    totals: {
      grossArrived,
      depositConfirmedNoShow: depositForConfirmedAndNoShow,
    },
  };
}

/** Yaklaşan ilk 8 rezervasyon (bugün ve sonrası) */
async function fetchUpcoming(rid: string): Promise<Row[]> {
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params: { from: ymd(new Date()), limit: 8 },
  });
  return Array.isArray(data) ? (data as Row[]) : data?.items ?? [];
}

// --- Component

export default function RestaurantDashboardPage() {
  const rid = asId(authStore.getUser()?.restaurantId) || "";
  const [sel, setSel] = React.useState<"month" | "30" | "90" | "all">("90");

  const summary = useQuery({
    queryKey: ["restaurant-dashboard-summary", rid, sel],
    queryFn: () => fetchDashboardSummary(rid, sel),
    enabled: !!rid,
  });

  const upc = useQuery<Row[]>({
    queryKey: ["restaurant-upcoming", rid],
    queryFn: () => fetchUpcoming(rid),
    enabled: !!rid,
  });

  const counts = summary.data?.counts || {};
  const totals = summary.data?.totals || { grossArrived: 0, depositConfirmedNoShow: 0 };
  const total =
    counts.total ??
    ((counts.pending ?? 0) +
      (counts.confirmed ?? 0) +
      (counts.arrived ?? 0) +
      (counts.cancelled ?? 0) +
      (counts.no_show ?? 0));

  return (
    <div className="flex gap-6">
     <Sidebar
  items={[
    { to: "/restaurant", label: "Dashboard" },
    { to: "/restaurant/reservations", label: "Rezervasyonlar" },

    // ✅ EKLEDİK — MENÜ YÖNETİMİ (kategori + item)
    { to: "/restaurant/menu-manager", label: "Menü Yönetimi" },

    // varsa eski menüler sayfası
    { to: "/restaurant/menus", label: "Basit Menüler" },
    { to: "/restaurant/tables", label: "Canlı Masalar" },


    { to: "/restaurant/profile", label: "Profil & Ayarlar" },
  ]}
/>

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Restoran Özeti</h2>
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="month">Bu ay</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 90 gün</option>
            <option value="all">Tümü</option>
          </select>
        </div>

        {!rid && <div className="text-sm text-red-600">restaurantId bulunamadı.</div>}
        {summary.isLoading && <div>Yükleniyor…</div>}
        {summary.error && <div className="text-red-600 text-sm">Veri alınamadı</div>}

        {/* Sayaçlar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Toplam Rezervasyon">
            <div className="text-2xl font-semibold">{total || 0}</div>
          </Card>
          <Card title="Onaylı">
            <div className="text-2xl font-semibold">{counts.confirmed ?? 0}</div>
          </Card>
          <Card title="İptal">
            <div className="text-2xl font-semibold">{counts.cancelled ?? 0}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Bekleyen">
            <div className="text-2xl font-semibold">{counts.pending ?? 0}</div>
          </Card>
          <Card title="Gelen">
            <div className="text-2xl font-semibold">{counts.arrived ?? 0}</div>
          </Card>
          <Card title="Gelmedi">
            <div className="text-2xl font-semibold">{counts.no_show ?? 0}</div>
          </Card>
        </div>

        {/* 💡 İstenen mantık: */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Toplam Ciro (₺) — sadece 'Geldi'">
            <div className="text-2xl font-semibold">
              {Number(totals.grossArrived || 0).toLocaleString("tr-TR")}
            </div>
          </Card>
          <Card title="Toplam Depozito (₺) — 'Onaylı' + 'Gelmedi'">
            <div className="text-2xl font-semibold">
              {Number(totals.depositConfirmedNoShow || 0).toLocaleString("tr-TR")}
            </div>
          </Card>
        </div>

        {/* Yaklaşan Rezervasyonlar */}
        <Card title="Yaklaşan Rezervasyonlar">
          {upc.isLoading ? (
            <div>Yükleniyor…</div>
          ) : (upc.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500">Kayıt yok</div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">Tarih</th>
                    <th className="py-2 px-4">Kullanıcı</th>
                    <th className="py-2 px-4">Kişi</th>
                    <th className="py-2 px-4">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {upc.data!.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="py-2 px-4">{fmtDT(r.dateTimeUTC)}</td>
                      <td className="py-2 px-4">
                        {r.user?.name || "-"}{" "}
                        <span className="text-gray-500">
                          {r.user?.email ? `(${r.user.email})` : ""}
                        </span>
                      </td>
                      <td className="py-2 px-4">{r.partySize}</td>
                      <td className="py-2 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pillClass(
                            r.status
                          )}`}
                        >
                          {fmtStatus(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}