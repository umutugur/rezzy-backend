// src/desktop/pages/ReportsPage.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { authStore } from "../../store/auth";
import { api, restaurantGetReportsOverview } from "../../api/client";
import { asId } from "../../lib/id"; // ✅ EKLENDİ

// ---- Tipler (Dashboard ile aynı rezervasyon modeli) ----
type Row = {
  _id: string;
  dateTimeUTC: string;
  partySize: number;
  status:
    | "pending"
    | "confirmed"
    | "arrived"
    | "cancelled"
    | "no_show"
    | string;
  user?: { name?: string; email?: string };
  totalPrice?: number;
  depositAmount?: number;
};

type Range = { from?: string; to?: string };

type ViewMode = "reservations" | "advanced";

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

// ---- Range & API yardımcıları ----
// Default: Bugün, Son 7 gün, Son 30 gün, Son 90 gün
function rangeParams(sel: string): Range {
  const today = new Date();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (sel) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "7":
      return { from: fmt(daysAgo(6)), to: fmt(today) }; // 7 gün
    case "30":
      return { from: fmt(daysAgo(29)), to: fmt(today) };
    case "90":
    default:
      return { from: fmt(daysAgo(89)), to: fmt(today) };
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

    const batch: Row[] = Array.isArray(data)
      ? (data as Row[])
      : data?.items ?? [];
    if (!batch.length) break;

    items.push(...batch);

    const nextCursor: string | undefined = (data as any)?.nextCursor;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return items;
}

/** Rapor ekranı için özetler (eski rezervasyon mantığı). */
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
async function fetchRecentInRange(
  rid: string,
  sel: string
): Promise<Row[]> {
  const range = rangeParams(sel);
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params: { ...range, limit: 10 },
  });
  return Array.isArray(data) ? (data as Row[]) : data?.items ?? [];
}

// ---- Component ----

export const ReportsPage: React.FC = () => {
  const user = authStore.getUser();

  // ✅ Önce legacy restaurantId, yoksa membership'ten ilk restoran
  const fallbackMembershipRestaurantId =
    user?.restaurantMemberships?.[0]?.id ?? null;

  const rid =
    asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  const [sel, setSel] = React.useState<"today" | "7" | "30" | "90">("today");
  const [view, setView] = React.useState<ViewMode>("reservations");

  // Rezervasyon bazlı eski özet (mevcut mantık)
  const summary = useQuery({
    queryKey: ["desktop-reports-summary", rid, sel],
    queryFn: () => fetchReportsSummary(rid, sel),
    enabled: !!rid && view === "reservations",
  });

  const recent = useQuery<Row[]>({
    queryKey: ["desktop-reports-recent", rid, sel],
    queryFn: () => fetchRecentInRange(rid, sel),
    enabled: !!rid && view === "reservations",
  });

  // Yeni gelişmiş rapor endpoint’i
  const advanced = useQuery({
    queryKey: ["desktop-reports-advanced", rid, sel],
    queryFn: () => restaurantGetReportsOverview(rid, rangeParams(sel)),
    enabled: !!rid && view === "advanced",
  });

  return (
    <RestaurantDesktopLayout
      activeNav="reports"
      title="Raporlar"
      subtitle="Ciro, depozito ve kanal bazlı özetler."
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

      {rid && (
        <>
          {/* Tab switcher */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: 999,
              padding: 4,
              border: "1px solid var(--rezvix-border-subtle)",
              marginBottom: 16,
              background: "rgba(255,255,255,0.7)",
            }}
          >
            <button
              onClick={() => setView("reservations")}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                background:
                  view === "reservations"
                    ? "var(--rezvix-primary-soft)"
                    : "transparent",
                color:
                  view === "reservations"
                    ? "#fff"
                    : "var(--rezvix-text-main)",
              }}
            >
              Rezervasyon Özeti
            </button>
            <button
              onClick={() => setView("advanced")}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                background:
                  view === "advanced"
                    ? "var(--rezvix-primary-soft)"
                    : "transparent",
                color:
                  view === "advanced"
                    ? "#fff"
                    : "var(--rezvix-text-main)",
              }}
            >
              Gelişmiş Raporlar
            </button>
          </div>

          {/* Ortak tarih filtresi */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <select
              value={sel}
              onChange={(e) =>
                setSel(e.target.value as "today" | "7" | "30" | "90")
              }
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                border: "1px solid var(--rezvix-border-subtle)",
                fontSize: 12,
              }}
            >
              <option value="today">Bugün</option>
              <option value="7">Son 7 gün</option>
              <option value="30">Son 30 gün</option>
              <option value="90">Son 90 gün</option>
            </select>
          </div>

          {/* -------- View: Rezervasyon Özeti (eski mantık) -------- */}
          {view === "reservations" && (
            <>
              {summary.isLoading && (
                <div className="rezvix-empty">
                  <div className="rezvix-empty__icon">⏳</div>
                  <div className="rezvix-empty__title">
                    Raporlar getiriliyor…
                  </div>
                  <div className="rezvix-empty__text">
                    Seçili tarih aralığındaki rezervasyonlar analiz ediliyor.
                  </div>
                </div>
              )}

              {summary.error && !summary.isLoading && (
                <div className="rezvix-empty">
                  <div className="rezvix-empty__icon">⚠️</div>
                  <div className="rezvix-empty__title">
                    Raporlar yüklenemedi
                  </div>
                  <div className="rezvix-empty__text">
                    Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse
                    bağlantınızı kontrol edin.
                  </div>
                </div>
              )}

              {!summary.isLoading &&
                !summary.error &&
                (summary.data?.rows?.length ?? 0) === 0 && (
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

              {!summary.isLoading &&
                !summary.error &&
                (summary.data?.rows?.length ?? 0) > 0 && (
                  <ReservationSummaryView
                    summaryRows={summary.data!.rows}
                    counts={summary.data!.counts}
                    totals={summary.data!.totals}
                    recent={recent}
                  />
                )}
            </>
          )}

          {/* -------- View: Gelişmiş Raporlar (yeni endpoint) -------- */}
          {view === "advanced" && (
            <>
              {advanced.isLoading && (
                <div className="rezvix-empty">
                  <div className="rezvix-empty__icon">⏳</div>
                  <div className="rezvix-empty__title">
                    Gelişmiş raporlar hazırlanıyor…
                  </div>
                  <div className="rezvix-empty__text">
                    Rezervasyon ve sipariş verileri derleniyor.
                  </div>
                </div>
              )}

              {advanced.error && !advanced.isLoading && (
                <div className="rezvix-empty">
                  <div className="rezvix-empty__icon">⚠️</div>
                  <div className="rezvix-empty__title">
                    Gelişmiş raporlar yüklenemedi
                  </div>
                  <div className="rezvix-empty__text">
                    Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse
                    bağlantınızı kontrol edin.
                  </div>
                </div>
              )}

              {!advanced.isLoading &&
                !advanced.error &&
                advanced.data &&
                advanced.data.reservations.totalCount === 0 &&
                advanced.data.orders.totalCount === 0 && (
                  <div className="rezvix-empty">
                    <div className="rezvix-empty__icon">📊</div>
                    <div className="rezvix-empty__title">
                      Seçili aralıkta veri bulunamadı
                    </div>
                    <div className="rezvix-empty__text">
                      Rezervasyon ya da sipariş kaydı yok. Tarih aralığını
                      genişletebilirsiniz.
                    </div>
                  </div>
                )}

              {!advanced.isLoading &&
                !advanced.error &&
                advanced.data &&
                (advanced.data.reservations.totalCount > 0 ||
                  advanced.data.orders.totalCount > 0) && (
                  <AdvancedReportsView data={advanced.data as any} />
                )}
            </>
          )}
        </>
      )}
    </RestaurantDesktopLayout>
  );
};

/* -------------------------------------------
 * Alt bileşen: Rezervasyon Özeti (mevcut mantık)
 * ----------------------------------------- */

type ReservationSummaryViewProps = {
  summaryRows: Row[];
  counts: Record<string, number>;
  totals: { grossArrived: number; depositConfirmedNoShow: number };
  recent: ReturnType<typeof useQuery<Row[]>>;
};

const ReservationSummaryView: React.FC<ReservationSummaryViewProps> = ({
  summaryRows,
  counts,
  totals,
  recent,
}) => {
  const totalReservations =
    counts.total ??
    ((counts.pending ?? 0) +
      (counts.confirmed ?? 0) +
      (counts.arrived ?? 0) +
      (counts.cancelled ?? 0) +
      (counts.no_show ?? 0));

  return (
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
                <span className="rezvix-kitchen-ticket__title">Onaylı</span>
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
                <span className="rezvix-kitchen-ticket__title">İptal</span>
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
          <div className="rezvix-board-column__title">Son Rezervasyonlar</div>
          <div className="rezvix-board-column__count">
            {recent.data?.length ?? 0} kayıt
          </div>
        </div>
        <div className="rezvix-board-column__body">
          {recent.isLoading && <div>Yükleniyor…</div>}
          {!recent.isLoading && (recent.data?.length ?? 0) === 0 && (
            <div className="rezvix-empty" style={{ minHeight: 120 }}>
              <div className="rezvix-empty__icon">📭</div>
              <div className="rezvix-empty__title">Kayıt yok</div>
              <div className="rezvix-empty__text">
                Seçili tarih aralığında gösterilecek rezervasyon bulunamadı.
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
                      <td style={{ padding: "6px 10px" }}>{r.partySize}</td>
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
  );
};

/* -------------------------------------------
 * Alt bileşen: Gelişmiş Raporlar (yeni endpoint)
 * ----------------------------------------- */

type AdvancedReportsViewProps = {
  data: {
    range: { from: string; to: string };
    reservations: {
      totalCount: number;
      statusCounts: {
        pending: number;
        confirmed: number;
        arrived: number;
        cancelled: number;
        no_show: number;
      };
      depositTotal: number;
      revenueTotal: number; // sadece rezervasyon kaynaklı ciro
      byDay: Array<{
        date: string;
        reservations: number;
        deposits: number;
        revenue: number;
      }>;
    };
    orders: {
      totalCount: number;
      revenueTotal: number; // tüm masa siparişleri cirosu
      bySource: {
        WALK_IN: number;
        QR: number;
        REZVIX: number;
        UNKNOWN: number;
      };
      countsBySource: {
        WALK_IN: number;
        QR: number;
        REZVIX: number;
        UNKNOWN: number;
      };
      byDay: Array<{
        date: string;
        orders: number;
        revenue: number;
      }>;
      byHour?: Array<{
        hour: number;
        orders: number;
        revenue: number;
      }>;
      topItems?: Array<{
        itemId: string | null;
        title: string;
        qty: number;
        revenue: number;
      }>;
    };
    tables?: {
      totalSessions: number;
      closedSessions: number;
      avgSessionDurationMinutes: number;
      payments: {
        cardTotal: number;
        payAtVenueTotal: number;
        grandTotal: number;
      };
      topTables: Array<{
        tableId: string;
        sessionCount: number;
        revenueTotal: number;
      }>;
    };
  };
};

const AdvancedReportsView: React.FC<AdvancedReportsViewProps> = ({
  data,
}) => {
  const { reservations, orders, range, tables } = data;

  const totalReservations = reservations.totalCount;
  const totalOrders = orders.totalCount;

  // 🔢 Toplam ciro (Rezervasyon + Masa siparişi)
  const totalRevenue =
    Number(reservations.revenueTotal || 0) +
    Number(orders.revenueTotal || 0);

  // 🔢 Depozito toplamı
  const totalDeposit = Number(reservations.depositTotal || 0);

  // 🔢 No-show & arrive oranları
  const arrived = Number(reservations.statusCounts.arrived || 0);
  const noShow = Number(reservations.statusCounts.no_show || 0);
  const arrivedBase = arrived + noShow;
  const noShowRate =
    arrivedBase > 0 ? (noShow / arrivedBase) * 100 : 0;
  const arriveRate =
    arrivedBase > 0 ? (arrived / arrivedBase) * 100 : 0;

  // 🔢 Masa siparişi kanal bazlı ciro
  const walkinRev = Number(orders.bySource.WALK_IN || 0);
  const qrRev = Number(orders.bySource.QR || 0);
  const rezvixTableRev = Number(orders.bySource.REZVIX || 0);
  const otherRev = Number(orders.bySource.UNKNOWN || 0);

  const channelTotal = walkinRev + qrRev + rezvixTableRev + otherRev || 0;

  const pct = (val: number, base: number) =>
    base > 0 ? ((val / base) * 100).toFixed(1) : "0.0";

  // 🔢 Adisyon / masa kullanımı
  const totalSessions = tables?.totalSessions ?? 0;
  const avgSessionDurationMinutes =
    tables?.avgSessionDurationMinutes ?? 0;
  const payments = tables?.payments || {
    cardTotal: 0,
    payAtVenueTotal: 0,
    grandTotal: 0,
  };
  const topTables = tables?.topTables ?? [];

  const byHour = orders.byHour ?? [];
  const topItems = orders.topItems ?? [];

  return (
    <div className="rezvix-board-layout">
      {/* SOL: Hero + Rezervasyon performansı */}
      <div className="rezvix-board-column">
        <div className="rezvix-board-column__header">
          <div className="rezvix-board-column__title">
            Genel Özet (Rezvix + Masa)
          </div>
          <div className="rezvix-board-column__count">
            {range.from} – {range.to}
          </div>
        </div>

        <div className="rezvix-board-column__body" style={{ gap: 12 }}>
          {/* Hero kart: Toplam Ciro */}
          <div
            style={{
              borderRadius: 16,
              padding: 14,
              background:
                "linear-gradient(135deg, rgba(120,90,255,0.12), rgba(255,255,255,0.9))",
              border: "1px solid var(--rezvix-border-subtle)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--rezvix-text-soft)",
              }}
            >
              Toplam ciro (Rezervasyon + Masa)
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {totalRevenue.toLocaleString("tr-TR")} ₺
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.04)",
                }}
              >
                Rezervasyon cirosu:{" "}
                <strong>
                  {Number(
                    reservations.revenueTotal || 0
                  ).toLocaleString("tr-TR")}{" "}
                  ₺
                </strong>
              </div>
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.04)",
                }}
              >
                Masa siparişi cirosu:{" "}
                <strong>
                  {Number(orders.revenueTotal || 0).toLocaleString(
                    "tr-TR"
                  )}{" "}
                  ₺
                </strong>
              </div>
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.04)",
                }}
              >
                Toplam depozito:{" "}
                <strong>
                  {totalDeposit.toLocaleString("tr-TR")} ₺
                </strong>
              </div>
            </div>
          </div>

          {/* Rezervasyon KPI kartları */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  Toplam Rezervasyon
                </span>
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}
              >
                {totalReservations}
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Bekleyen + onaylı + gelen + iptal + no-show
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  Gelme Oranı
                </span>
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}
              >
                {arriveRate.toFixed(1)}%
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                (Gelen / Gelen + Gelmedi)
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  No-show Oranı
                </span>
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}
              >
                {noShowRate.toFixed(1)}%
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                (Gelmedi / Gelen + Gelmedi)
              </div>
            </div>
          </div>

          {/* Günlük rezervasyon/depozito/ciro tablosu */}
          {reservations.byDay.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Günlük Rezervasyon & Depozito & Ciro
              </div>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "rgba(255,255,255,0.9)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      <th style={{ padding: "6px 8px" }}>Tarih</th>
                      <th style={{ padding: "6px 8px" }}>Rez.</th>
                      <th style={{ padding: "6px 8px" }}>Depozito</th>
                      <th style={{ padding: "6px 8px" }}>Ciro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.byDay.map((d) => (
                      <tr
                        key={d.date}
                        style={{ borderTop: "1px solid #eee" }}
                      >
                        <td style={{ padding: "6px 8px" }}>{d.date}</td>
                        <td style={{ padding: "6px 8px" }}>
                          {d.reservations}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {Number(d.deposits).toLocaleString("tr-TR")}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {Number(d.revenue).toLocaleString("tr-TR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* En çok satan ürünler */}
          {topItems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                En çok satan ürünler
              </div>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "rgba(255,255,255,0.9)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      <th style={{ padding: "6px 8px" }}>Ürün</th>
                      <th style={{ padding: "6px 8px" }}>Adet</th>
                      <th style={{ padding: "6px 8px" }}>Ciro (₺)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((it, idx) => (
                      <tr
                        key={it.itemId ?? idx}
                        style={{ borderTop: "1px solid #eee" }}
                      >
                        <td style={{ padding: "6px 8px" }}>
                          {it.title || "-"}
                        </td>
                        <td style={{ padding: "6px 8px" }}>{it.qty}</td>
                        <td style={{ padding: "6px 8px" }}>
                          {Number(it.revenue).toLocaleString("tr-TR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SAĞ: Kanal bazlı masa siparişi performansı + adisyon */}
      <div className="rezvix-board-column">
        <div className="rezvix-board-column__header">
          <div className="rezvix-board-column__title">
            Masa & Menü (Walk-in / QR / Rezvix)
          </div>
          <div className="rezvix-board-column__count">
            {totalOrders} sipariş
          </div>
        </div>

        <div className="rezvix-board-column__body" style={{ gap: 12 }}>
          {/* Kanal bazlı stacked bar */}
          <div
            style={{
              borderRadius: 14,
              padding: 12,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "rgba(255,255,255,0.9)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Masa siparişi cirosu kanal dağılımı
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                overflow: "hidden",
                background: "rgba(0,0,0,0.05)",
                marginBottom: 8,
              }}
            >
              {channelTotal > 0 && (
                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                  <div
                    style={{
                      width: `${(walkinRev / channelTotal) * 100}%`,
                      background: "rgba(46, 204, 113, 0.9)", // Walk-in
                      transition: "width 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${(qrRev / channelTotal) * 100}%`,
                      background: "rgba(52, 152, 219, 0.9)", // QR
                      transition: "width 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${(rezvixTableRev / channelTotal) * 100}%`,
                      background: "rgba(155, 89, 182, 0.9)", // Rezvix
                      transition: "width 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${(otherRev / channelTotal) * 100}%`,
                      background: "rgba(149, 165, 166, 0.9)", // Diğer
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 8,
                fontSize: 11,
              }}
            >
              <ChannelLegendItem
                label="Walk-in"
                color="rgba(46, 204, 113, 0.9)"
                amount={walkinRev}
                count={orders.countsBySource.WALK_IN || 0}
                share={pct(walkinRev, channelTotal)}
              />
              <ChannelLegendItem
                label="QR Menü"
                color="rgba(52, 152, 219, 0.9)"
                amount={qrRev}
                count={orders.countsBySource.QR || 0}
                share={pct(qrRev, channelTotal)}
              />
              <ChannelLegendItem
                label="Rezvix"
                color="rgba(155, 89, 182, 0.9)"
                amount={rezvixTableRev}
                count={orders.countsBySource.REZVIX || 0}
                share={pct(rezvixTableRev, channelTotal)}
              />
              <ChannelLegendItem
                label="Diğer"
                color="rgba(149, 165, 166, 0.9)"
                amount={otherRev}
                count={orders.countsBySource.UNKNOWN || 0}
                share={pct(otherRev, channelTotal)}
              />
            </div>
          </div>

          {/* Adisyon / masa KPI'ları */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 8,
            }}
          >
            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  Toplam adisyon
                </span>
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}
              >
                {totalSessions}
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Seçili aralıktaki açılan masa oturumları
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  Ortalama oturma süresi
                </span>
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}
              >
                {avgSessionDurationMinutes} dk
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Kapalı adisyonların ortalaması
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  Masadan alınan ödeme
                </span>
              </div>
              <div
                style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}
              >
                {Number(
                  payments.grandTotal || 0
                ).toLocaleString("tr-TR")}{" "}
                ₺
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Kart + masada ödeme toplamı
              </div>
            </div>
          </div>

          {/* Günlük sipariş & ciro tablosu */}
          {orders.byDay.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Günlük sipariş & ciro
              </div>
              <div
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "rgba(255,255,255,0.9)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      <th style={{ padding: "6px 8px" }}>Tarih</th>
                      <th style={{ padding: "6px 8px" }}>Sipariş</th>
                      <th style={{ padding: "6px 8px" }}>Ciro (₺)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.byDay.map((d) => (
                      <tr
                        key={d.date}
                        style={{ borderTop: "1px solid #eee" }}
                      >
                        <td style={{ padding: "6px 8px" }}>{d.date}</td>
                        <td style={{ padding: "6px 8px" }}>{d.orders}</td>
                        <td style={{ padding: "6px 8px" }}>
                          {Number(d.revenue).toLocaleString("tr-TR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Saatlik sipariş & ciro (mini bar chart) */}
          {byHour.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Saatlik sipariş & ciro
              </div>
              <div
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "rgba(255,255,255,0.9)",
                  padding: 8,
                }}
              >
                {byHour.map((h) => {
                  const maxRevenue = Math.max(
                    ...byHour.map((x) => x.revenue || 0),
                    1
                  );
                  const width = (h.revenue / maxRevenue) * 100;
                  return (
                    <div
                      key={h.hour}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: 4,
                        gap: 6,
                      }}
                    >
                      <div style={{ width: 40, fontSize: 11 }}>
                        {h.hour.toString().padStart(2, "0")}:00
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          borderRadius: 999,
                          background: "rgba(0,0,0,0.05)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${width}%`,
                            height: "100%",
                            background: "rgba(52, 152, 219, 0.9)",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          width: 80,
                          textAlign: "right",
                          fontSize: 11,
                        }}
                      >
                        {Number(h.revenue).toLocaleString("tr-TR")} ₺
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* En çok kullanılan masalar */}
          {topTables.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                En çok kullanılan masalar
              </div>
              <div
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  borderRadius: 10,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "rgba(255,255,255,0.9)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      <th style={{ padding: "6px 8px" }}>Masa</th>
                      <th style={{ padding: "6px 8px" }}>Adisyon</th>
                      <th style={{ padding: "6px 8px" }}>Ciro (₺)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTables.map((t) => (
                      <tr
                        key={t.tableId}
                        style={{ borderTop: "1px solid #eee" }}
                      >
                        <td style={{ padding: "6px 8px" }}>
                          {t.tableId}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {t.sessionCount}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {Number(
                            t.revenueTotal
                          ).toLocaleString("tr-TR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ChannelLegendItem: React.FC<{
  label: string;
  color: string;
  amount: number;
  count: number;
  share: string; // "23.4"
}> = ({ label, color, amount, count, share }) => {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          marginTop: 3,
          background: color,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: "var(--rezvix-text-soft)" }}>
          {count} sipariş · {amount.toLocaleString("tr-TR")} ₺
        </div>
        <div style={{ fontSize: 11 }}>{share}% pay</div>
      </div>
    </div>
  );
};