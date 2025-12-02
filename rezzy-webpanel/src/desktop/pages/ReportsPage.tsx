// src/desktop/pages/ReportsPage.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { authStore } from "../../store/auth";
import { api } from "../../api/client";

// ---- Tipler (Dashboard ile aynı rezervasyon modeli) ----
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

// ---- Range & API yardımcıları (Dashboard mantığını aynen kullanıyoruz) ----
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

/** Cursor'lı listeyi tamamen çeker (seçilen aralık içinde). */
async function fetchAllReservationsInRange(
  rid: string,
  p: Range
): Promise<Row[]> {
  const items: Row[] = [];
  let cursor: string | undefined = undefined;
  const limit = 100;

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

/** Rapor ekranı için özetler (Dashboard ile aynı hesaplama mantığı). */
async function fetchReportsSummary(rid: string, sel: string) {
  const range = rangeParams(sel);
  const rows = await fetchAllReservationsInRange(rid, range);

  const counts = {
    total: rows.length,
    pending: 0,
    confirmed: 0,
    arrived: 0,
    cancelled: 0,
    no_show: 0,
  } as Record<string, number>;

  let grossArrived = 0; // sadece arrived totalPrice
  let depositForConfirmedAndNoShow = 0; // confirmed + no_show depositAmount

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
    rows,
    counts,
    totals: {
      grossArrived,
      depositConfirmedNoShow: depositForConfirmedAndNoShow,
    },
  };
}

/** Seçili aralıktaki son 10 rezervasyon (ciro tablosunun altı için) */
async function fetchRecentInRange(rid: string, sel: string): Promise<Row[]> {
  const range = rangeParams(sel);
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params: { ...range, limit: 10 },
  });
  return Array.isArray(data) ? (data as Row[]) : data?.items ?? [];
}

// ---- Component ----

export const ReportsPage: React.FC = () => {
  const user = authStore.getUser();
  const rid = user?.restaurantId || "";
  const [sel, setSel] = React.useState<"month" | "30" | "90" | "all">("90");

  const summary = useQuery({
    queryKey: ["desktop-reports-summary", rid, sel],
    queryFn: () => fetchReportsSummary(rid, sel),
    enabled: !!rid,
  });

  const recent = useQuery<Row[]>({
    queryKey: ["desktop-reports-recent", rid, sel],
    queryFn: () => fetchRecentInRange(rid, sel),
    enabled: !!rid,
  });

  const counts = summary.data?.counts || {};
  const totals =
    summary.data?.totals || ({ grossArrived: 0, depositConfirmedNoShow: 0 } as {
      grossArrived: number;
      depositConfirmedNoShow: number;
    });

  const totalReservations =
    counts.total ??
    ((counts.pending ?? 0) +
      (counts.confirmed ?? 0) +
      (counts.arrived ?? 0) +
      (counts.cancelled ?? 0) +
      (counts.no_show ?? 0));

  const isLoading = summary.isLoading || (!summary.data && summary.isFetching);
  const hasAnyData = (summary.data?.rows?.length ?? 0) > 0;

  return (
    <RestaurantDesktopLayout
      activeNav="reports"
      title="Raporlar"
      subtitle="Ciro, depozito ve durum bazlı özetler."
    >
      {!rid && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⚠️</div>
          <div className="rezvix-empty__title">Restoran bulunamadı</div>
          <div className="rezvix-empty__text">
            Bu ekranı kullanmak için oturum açmış bir restoran hesabı gerekir.
          </div>
        </div>
      )}

      {rid && isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⏳</div>
          <div className="rezvix-empty__title">Raporlar getiriliyor…</div>
          <div className="rezvix-empty__text">
            Seçili tarih aralığındaki rezervasyonlar analiz ediliyor.
          </div>
        </div>
      )}

      {rid && summary.error && !isLoading && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">⚠️</div>
          <div className="rezvix-empty__title">Raporlar yüklenemedi</div>
          <div className="rezvix-empty__text">
            Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı
            kontrol edin.
          </div>
        </div>
      )}

      {rid && !isLoading && !summary.error && !hasAnyData && (
        <div className="rezvix-empty">
          <div className="rezvix-empty__icon">📊</div>
          <div className="rezvix-empty__title">
            Seçili tarih aralığında rezervasyon yok
          </div>
          <div className="rezvix-empty__text">
            Üstten tarih aralığını değiştirerek farklı bir dönem
            görüntüleyebilirsiniz.
          </div>
        </div>
      )}

      {rid && !isLoading && !summary.error && hasAnyData && (
        <div className="rezvix-board-layout">
          {/* Sol kolon: özet kartlar */}
          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">Özet</div>
              <div className="rezvix-board-column__count">
                {totalReservations || 0} rezervasyon
              </div>
            </div>

            <div className="rezvix-board-column__body" style={{ gap: 10 }}>
              {/* Tarih aralığı seçici */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={sel}
                  onChange={(e) =>
                    setSel(e.target.value as "month" | "30" | "90" | "all")
                  }
                  style={{
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid var(--rezvix-border-subtle)",
                    fontSize: 12,
                  }}
                >
                  <option value="month">Bu ay</option>
                  <option value="30">Son 30 gün</option>
                  <option value="90">Son 90 gün</option>
                  <option value="all">Tümü</option>
                </select>
              </div>

              {/* Sayısal özetler */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 8,
                }}
              >
                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">
                      Toplam Rezervasyon
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {totalReservations || 0}
                  </div>
                </div>

                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">
                      Onaylı
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {counts.confirmed ?? 0}
                  </div>
                </div>

                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">
                      Gelen (Arrived)
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {counts.arrived ?? 0}
                  </div>
                </div>

                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">
                      İptal
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {counts.cancelled ?? 0}
                  </div>
                </div>
              </div>

              {/* Ciro & depozito */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">
                      Toplam Ciro (₺)
                    </span>
                  </div>
                  <div className="rezvix-kitchen-ticket__meta">
                    Sadece <strong>Geldi (arrived)</strong> rezervasyonların{" "}
                    <code>totalPrice</code> tutarı.
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {Number(totals.grossArrived || 0).toLocaleString("tr-TR")}
                  </div>
                </div>

                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">
                      Toplam Depozito (₺)
                    </span>
                  </div>
                  <div className="rezvix-kitchen-ticket__meta">
                    <strong>Onaylı</strong> ve <strong>Gelmedi</strong>{" "}
                    rezervasyonların <code>depositAmount</code> toplamı.
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {Number(
                      totals.depositConfirmedNoShow || 0
                    ).toLocaleString("tr-TR")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sağ kolon: seçili aralıktaki son rezervasyonlar */}
          <div className="rezvix-board-column">
            <div className="rezvix-board-column__header">
              <div className="rezvix-board-column__title">
                Son Rezervasyonlar
              </div>
              <div className="rezvix-board-column__count">
                {recent.data?.length ?? 0} kayıt
              </div>
            </div>
            <div className="rezvix-board-column__body">
              {recent.isLoading && <div>Yükleniyor…</div>}
              {!recent.isLoading &&
                (recent.data?.length ?? 0) === 0 && (
                  <div className="rezvix-empty" style={{ minHeight: 120 }}>
                    <div className="rezvix-empty__icon">📭</div>
                    <div className="rezvix-empty__title">Kayıt yok</div>
                    <div className="rezvix-empty__text">
                      Seçili tarih aralığında gösterilecek rezervasyon
                      bulunamadı.
                    </div>
                  </div>
                )}
              {!recent.isLoading && (recent.data?.length ?? 0) > 0 && (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid var(--rezvix-border-subtle)",
                    background: "rgba(255,255,255,0.85)",
                    overflow: "hidden",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          textAlign: "left",
                          color: "var(--rezvix-text-soft)",
                        }}
                      >
                        <th style={{ padding: "6px 10px" }}>Tarih</th>
                        <th style={{ padding: "6px 10px" }}>Kullanıcı</th>
                        <th style={{ padding: "6px 10px" }}>Kişi</th>
                        <th style={{ padding: "6px 10px" }}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.data!.map((r) => (
                        <tr key={r._id} style={{ borderTop: "1px solid #eee" }}>
                          <td style={{ padding: "6px 10px" }}>
                            {fmtDT(r.dateTimeUTC)}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            {r.user?.name || "-"}{" "}
                            <span style={{ color: "#888" }}>
                              {r.user?.email ? `(${r.user.email})` : ""}
                            </span>
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            {r.partySize}
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            {fmtStatus(r.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};