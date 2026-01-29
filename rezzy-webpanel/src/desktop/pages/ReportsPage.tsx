// src/desktop/pages/ReportsPage.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RestaurantDesktopLayout,
  useRestaurantDesktopCurrency,
} from "../layouts/RestaurantDesktopLayout";
import { authStore } from "../../store/auth";
import { api, restaurantGetReportsOverview } from "../../api/client";
import { deliveryListOrders, type DeliveryOrder } from "../../api/delivery";
import { asId } from "../../lib/id";

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

type ViewMode = "reservations" | "advanced" | "delivery";

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

const deliveryStatusTr: Record<string, string> = {
  new: "Yeni",
  accepted: "Kabul edildi",
  on_the_way: "Yolda",
  created: "Oluşturuldu",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  assigned: "Kuryeye verildi",
  picked_up: "Yolda",
  delivered: "Teslim edildi",
  cancelled: "İptal",
};
function fmtDeliveryStatus(s: string) {
  return deliveryStatusTr[s] ?? s;
}

function fmtDayLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

// Helper: Formats money with currency symbol (always uses tr-TR locale)
function fmtMoney(amount: any, currencySymbol: string) {
  const n = Number(amount || 0);
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currencySymbol}`;
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

type DeliveryRangeSel = "today" | "yesterday" | "week" | "month" | "custom";

function formatYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildDeliveryRange(sel: DeliveryRangeSel, customFrom?: string, customTo?: string): Range {
  const today = new Date();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

  if (sel === "custom") {
    const fallback = formatYmd(today);
    const from = String(customFrom || fallback);
    const to = String(customTo || fallback);
    if (from && to && from > to) return { from: to, to: from };
    return { from, to };
  }

  switch (sel) {
    case "today":
      return { from: formatYmd(today), to: formatYmd(today) };
    case "yesterday": {
      const y = daysAgo(1);
      return { from: formatYmd(y), to: formatYmd(y) };
    }
    case "week":
      return { from: formatYmd(daysAgo(6)), to: formatYmd(today) };
    case "month":
    default:
      return { from: formatYmd(daysAgo(29)), to: formatYmd(today) };
  }
}

function buildLastNDays(end: string, days: number) {
  const base = end ? new Date(end) : new Date();
  const items: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    items.push(formatYmd(d));
  }
  return items;
}

/** Cursor'lı listeyi tamamen çeker (seçilen aralık içinde). */
async function fetchAllReservationsInRange(rid: string, p: Range): Promise<Row[]> {
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

    const nextCursor: string | undefined = (data as any)?.nextCursor;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return items;
}

async function fetchAllDeliveryOrdersInRange(
  rid: string,
  p: Range
): Promise<DeliveryOrder[]> {
  const items: DeliveryOrder[] = [];
  let cursor: string | undefined = undefined;
  const limit = 100;

  for (let page = 0; page < 100; page++) {
    const params: any = { ...p, limit, status: "all" };
    if (cursor) params.cursor = cursor;
    const { items: batch, nextCursor } = await deliveryListOrders(rid, params);
    if (!batch.length) break;
    items.push(...batch);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  if (!p.from && !p.to) return items;
  const from = p.from || "";
  const to = p.to || "";
  const normalizedFrom = from || to;
  const normalizedTo = to || from;
  if (!normalizedFrom || !normalizedTo) return items;

  return items.filter((o) => {
    if (!o.createdAt) return false;
    const day = formatYmd(new Date(o.createdAt));
    return day >= normalizedFrom && day <= normalizedTo;
  });
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
async function fetchRecentInRange(rid: string, sel: string): Promise<Row[]> {
  const range = rangeParams(sel);
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params: { ...range, limit: 10 },
  });
  return Array.isArray(data) ? (data as Row[]) : data?.items ?? [];
}

// ---- Component ----

export const ReportsPage: React.FC = () => {
  return (
    <RestaurantDesktopLayout
      activeNav="reports"
      title="Raporlar"
      subtitle="Ciro, depozito ve kanal bazlı özetler."
    >
      <ReportsInner />
    </RestaurantDesktopLayout>
  );
};

const ReportsInner: React.FC = () => {
  const user = authStore.getUser();

  // ✅ Currency + active restaurant context is resolved at layout level
  const { currencySymbol, restaurantId: layoutRestaurantId } =
    useRestaurantDesktopCurrency();

  // ✅ Önce layout'tan gelen aktif restaurantId, yoksa legacy restaurantId,
  // yoksa membership'ten ilk restoran.
  const firstMembership: any = user?.restaurantMemberships?.[0] ?? null;
  const fallbackMembershipRestaurantId =
    firstMembership?.restaurant ?? firstMembership?.id ?? null;

  const rid =
    layoutRestaurantId ||
    asId(user?.restaurantId || fallbackMembershipRestaurantId) ||
    "";

  const [sel, setSel] = React.useState<"today" | "7" | "30" | "90">("today");
  const [view, setView] = React.useState<ViewMode>("reservations");
  const [deliverySel, setDeliverySel] = React.useState<DeliveryRangeSel>("today");
  const [deliveryFrom, setDeliveryFrom] = React.useState("");
  const [deliveryTo, setDeliveryTo] = React.useState("");

  const deliveryRange = React.useMemo(
    () => buildDeliveryRange(deliverySel, deliveryFrom, deliveryTo),
    [deliverySel, deliveryFrom, deliveryTo]
  );

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

  const deliveryOrders = useQuery({
    queryKey: ["desktop-reports-delivery", rid, deliveryRange.from, deliveryRange.to],
    queryFn: () => fetchAllDeliveryOrdersInRange(rid, deliveryRange),
    enabled: !!rid && view === "delivery",
  });

  if (!rid) {
    return (
      <div className="rezvix-empty">
        <div className="rezvix-empty__icon">⚠️</div>
        <div className="rezvix-empty__title">Restoran bulunamadı</div>
        <div className="rezvix-empty__text">
          Bu ekranı kullanmak için oturum açmış bir restoran hesabı gerekir.
        </div>
      </div>
    );
  }

  return (
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
              view === "reservations" ? "#fff" : "var(--rezvix-text-main)",
          }}
        >
          Rezervasyon Özeti
        </button>
        <button
          onClick={() => setView("delivery")}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
            background:
              view === "delivery" ? "var(--rezvix-primary-soft)" : "transparent",
            color: view === "delivery" ? "#fff" : "var(--rezvix-text-main)",
          }}
        >
          Paket Servis
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
              view === "advanced" ? "var(--rezvix-primary-soft)" : "transparent",
            color: view === "advanced" ? "#fff" : "var(--rezvix-text-main)",
          }}
        >
          Gelişmiş Raporlar
        </button>
      </div>

      {/* Tarih filtreleri */}
      {view !== "delivery" && (
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
            onChange={(e) => setSel(e.target.value as "today" | "7" | "30" | "90")}
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
      )}

      {view === "delivery" && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={deliverySel}
            onChange={(e) => setDeliverySel(e.target.value as DeliveryRangeSel)}
            style={{
              padding: "6px 10px",
              borderRadius: 12,
              border: "1px solid var(--rezvix-border-subtle)",
              fontSize: 12,
            }}
          >
            <option value="today">Bugün</option>
            <option value="yesterday">Dün</option>
            <option value="week">Haftalık (son 7 gün)</option>
            <option value="month">Aylık (son 30 gün)</option>
            <option value="custom">2 tarih arası</option>
          </select>
          {deliverySel === "custom" && (
            <>
              <input
                type="date"
                value={deliveryFrom}
                onChange={(e) => setDeliveryFrom(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 12,
                  border: "1px solid var(--rezvix-border-subtle)",
                  fontSize: 12,
                }}
              />
              <input
                type="date"
                value={deliveryTo}
                onChange={(e) => setDeliveryTo(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 12,
                  border: "1px solid var(--rezvix-border-subtle)",
                  fontSize: 12,
                }}
              />
            </>
          )}
          <div style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}>
            {deliveryRange.from} – {deliveryRange.to}
          </div>
        </div>
      )}

      {/* -------- View: Rezervasyon Özeti (eski mantık) -------- */}
      {view === "reservations" && (
        <>
          {summary.isLoading && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">⏳</div>
              <div className="rezvix-empty__title">Raporlar getiriliyor…</div>
              <div className="rezvix-empty__text">
                Seçili tarih aralığındaki rezervasyonlar analiz ediliyor.
              </div>
            </div>
          )}

          {summary.error && !summary.isLoading && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">⚠️</div>
              <div className="rezvix-empty__title">Raporlar yüklenemedi</div>
              <div className="rezvix-empty__text">
                Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı
                kontrol edin.
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
                currencySymbol={currencySymbol}
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
                Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı
                kontrol edin.
              </div>
            </div>
          )}

          {!advanced.isLoading &&
            !advanced.error &&
            advanced.data &&
            advanced.data.reservations.totalCount === 0 &&
            advanced.data.orders.totalCount === 0 &&
            ((advanced.data as any).delivery?.totalCount ?? 0) === 0 && (
              <div className="rezvix-empty">
                <div className="rezvix-empty__icon">📊</div>
                <div className="rezvix-empty__title">
                  Seçili aralıkta veri bulunamadı
                </div>
                <div className="rezvix-empty__text">
                  Rezervasyon, masa siparişi ya da paket servis kaydı yok. Tarih
                  aralığını genişletebilirsiniz.
                </div>
              </div>
            )}

          {!advanced.isLoading &&
            !advanced.error &&
            advanced.data &&
            (advanced.data.reservations.totalCount > 0 ||
              advanced.data.orders.totalCount > 0 ||
              ((advanced.data as any).delivery?.totalCount ?? 0) > 0) && (
              <AdvancedReportsView
                data={advanced.data as any}
                currencySymbol={currencySymbol}
              />
            )}
        </>
      )}

      {/* -------- View: Paket Servis -------- */}
      {view === "delivery" && (
        <>
          {deliveryOrders.isLoading && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">⏳</div>
              <div className="rezvix-empty__title">
                Paket servis raporları hazırlanıyor…
              </div>
              <div className="rezvix-empty__text">
                Seçili tarih aralığındaki siparişler listeleniyor.
              </div>
            </div>
          )}

          {deliveryOrders.error && !deliveryOrders.isLoading && (
            <div className="rezvix-empty">
              <div className="rezvix-empty__icon">⚠️</div>
              <div className="rezvix-empty__title">
                Paket servis raporları yüklenemedi
              </div>
              <div className="rezvix-empty__text">
                Lütfen sayfayı yenileyin veya bağlantınızı kontrol edin.
              </div>
            </div>
          )}

          {!deliveryOrders.isLoading &&
            !deliveryOrders.error &&
            (deliveryOrders.data?.length ?? 0) === 0 && (
              <div className="rezvix-empty">
                <div className="rezvix-empty__icon">📦</div>
                <div className="rezvix-empty__title">
                  Seçili aralıkta paket servis yok
                </div>
                <div className="rezvix-empty__text">
                  Farklı bir tarih aralığı seçerek tekrar deneyebilirsiniz.
                </div>
              </div>
            )}

          {!deliveryOrders.isLoading &&
            !deliveryOrders.error &&
            (deliveryOrders.data?.length ?? 0) > 0 && (
              <DeliveryReportsView
                orders={deliveryOrders.data as DeliveryOrder[]}
                currencySymbol={currencySymbol}
                range={deliveryRange}
              />
            )}
        </>
      )}
    </>
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
  currencySymbol: string;
};

const ReservationSummaryView: React.FC<ReservationSummaryViewProps> = ({
  counts,
  totals,
  recent,
  currencySymbol,
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
                  {"Toplam Ciro (" + currencySymbol + ")"}
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
                {fmtMoney(totals.grossArrived || 0, currencySymbol)}
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">
                  {"Toplam Depozito (" + currencySymbol + ")"}
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
                {fmtMoney(totals.depositConfirmedNoShow || 0, currencySymbol)}
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
    // ✅ Opsiyonel: Paket servis raporu (backend döndürürse görünür)
    delivery?: {
      totalCount: number;
      grossTotal: number;
      netTotal: number;
      statusCounts: Record<string, number>;
      byDay: Array<{ date: string; orders: number; gross: number; net: number }>;
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
  currencySymbol: string;
};

const AdvancedReportsView: React.FC<AdvancedReportsViewProps> = ({
  data,
  currencySymbol,
}) => {
  const { reservations, orders, range, tables, delivery } = data;

  const totalReservations = reservations.totalCount;
  const totalOrders = orders.totalCount;
  const totalDelivery = delivery?.totalCount ?? 0;

  // 🔢 Toplam ciro (Rezervasyon + Masa siparişi + Paket servis brüt)
  const totalRevenue =
    Number(reservations.revenueTotal || 0) +
    Number(orders.revenueTotal || 0) +
    Number(delivery?.grossTotal || 0);

  // 🔢 Depozito toplamı
  const totalDeposit = Number(reservations.depositTotal || 0);

  // 🔢 No-show & arrive oranları
  const arrived = Number(reservations.statusCounts.arrived || 0);
  const noShow = Number(reservations.statusCounts.no_show || 0);
  const arrivedBase = arrived + noShow;
  const noShowRate = arrivedBase > 0 ? (noShow / arrivedBase) * 100 : 0;
  const arriveRate = arrivedBase > 0 ? (arrived / arrivedBase) * 100 : 0;

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
  const avgSessionDurationMinutes = tables?.avgSessionDurationMinutes ?? 0;
  const payments = tables?.payments || {
    cardTotal: 0,
    payAtVenueTotal: 0,
    grandTotal: 0,
  };
  const topTables = tables?.topTables ?? [];

  const byHour = orders.byHour ?? [];
  const topItems = orders.topItems ?? [];
  const deliveryTopItems = delivery?.topItems ?? [];

  return (
    <div className="rezvix-board-layout">
      {/* SOL: Hero + Rezervasyon performansı */}
      <div className="rezvix-board-column">
        <div className="rezvix-board-column__header">
          <div className="rezvix-board-column__title">
            Genel Özet (Rezvix + Masa + Paket)
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
              Toplam ciro (Rezervasyon + Masa + Paket)
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              {fmtMoney(totalRevenue, currencySymbol)}
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
                  {fmtMoney(reservations.revenueTotal || 0, currencySymbol)}
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
                <strong>{fmtMoney(orders.revenueTotal || 0, currencySymbol)}</strong>
              </div>
              {delivery && (
                <>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.04)",
                    }}
                  >
                    Paket servis (brüt):{" "}
                    <strong>{fmtMoney(delivery.grossTotal || 0, currencySymbol)}</strong>
                  </div>
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.04)",
                    }}
                  >
                    Paket servis (net):{" "}
                    <strong>{fmtMoney(delivery.netTotal || 0, currencySymbol)}</strong>
                  </div>
                </>
              )}
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.04)",
                }}
              >
                Toplam depozito: <strong>{fmtMoney(totalDeposit, currencySymbol)}</strong>
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
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {totalReservations}
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Bekleyen + onaylı + gelen + iptal + no-show
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">Gelme Oranı</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {arriveRate.toFixed(1)}%
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                (Gelen / Gelen + Gelmedi)
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">No-show Oranı</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
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
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
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
                    <tr style={{ textAlign: "left", color: "var(--rezvix-text-soft)" }}>
                      <th style={{ padding: "6px 8px" }}>Tarih</th>
                      <th style={{ padding: "6px 8px" }}>Rez.</th>
                      <th style={{ padding: "6px 8px" }}>{`Depozito (${currencySymbol})`}</th>
                      <th style={{ padding: "6px 8px" }}>{`Ciro (${currencySymbol})`}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.byDay.map((d) => (
                      <tr key={d.date} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "6px 8px" }}>{d.date}</td>
                        <td style={{ padding: "6px 8px" }}>{d.reservations}</td>
                        <td style={{ padding: "6px 8px" }}>{fmtMoney(d.deposits, currencySymbol)}</td>
                        <td style={{ padding: "6px 8px" }}>{fmtMoney(d.revenue, currencySymbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* En çok satan ürünler (masa) */}
          {topItems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                En çok satan ürünler (Masa)
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
                    <tr style={{ textAlign: "left", color: "var(--rezvix-text-soft)" }}>
                      <th style={{ padding: "6px 8px" }}>Ürün</th>
                      <th style={{ padding: "6px 8px" }}>Adet</th>
                      <th style={{ padding: "6px 8px" }}>{`Ciro (${currencySymbol})`}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((it, idx) => (
                      <tr key={it.itemId ?? idx} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "6px 8px" }}>{it.title || "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{it.qty}</td>
                        <td style={{ padding: "6px 8px" }}>{fmtMoney(it.revenue, currencySymbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SAĞ: Kanal bazlı masa siparişi performansı + adisyon + paket servis */}
      <div className="rezvix-board-column">
        <div className="rezvix-board-column__header">
          <div className="rezvix-board-column__title">Masa & Menü</div>
          <div className="rezvix-board-column__count">{totalOrders} sipariş</div>
        </div>

        <div className="rezvix-board-column__body" style={{ gap: 12 }}>
          {/* Paket servis paneli (opsiyonel) */}
          {delivery && totalDelivery > 0 && (
            <div
              style={{
                borderRadius: 14,
                padding: 12,
                border: "1px solid var(--rezvix-border-subtle)",
                background: "rgba(255,255,255,0.9)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Paket Servis</div>
                <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>
                  {totalDelivery} sipariş
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">Brüt ciro</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                    {fmtMoney(delivery.grossTotal || 0, currencySymbol)}
                  </div>
                  <div className="rezvix-kitchen-ticket__meta">
                    Ürün + teslimat ücreti dahil
                  </div>
                </div>
                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">Net ciro</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                    {fmtMoney(delivery.netTotal || 0, currencySymbol)}
                  </div>
                  <div className="rezvix-kitchen-ticket__meta">
                    İade/iptal/indirim sonrası
                  </div>
                </div>
              </div>

              {delivery.statusCounts && Object.keys(delivery.statusCounts).length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--rezvix-text-soft)" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 6,
                      color: "var(--rezvix-text-main)",
                    }}
                  >
                    Durum kırılımı
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: 6,
                    }}
                  >
                    {Object.entries(delivery.statusCounts)
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                      .map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            border: "1px solid var(--rezvix-border-subtle)",
                            borderRadius: 10,
                            padding: "6px 8px",
                            background: "rgba(0,0,0,0.02)",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{k}</div>
                          <div>{v} sipariş</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {delivery.byDay?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    Günlük paket servis (sipariş / brüt / net)
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
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--rezvix-text-soft)" }}>
                          <th style={{ padding: "6px 8px" }}>Tarih</th>
                          <th style={{ padding: "6px 8px" }}>Sipariş</th>
                          <th style={{ padding: "6px 8px" }}>{`Brüt (${currencySymbol})`}</th>
                          <th style={{ padding: "6px 8px" }}>{`Net (${currencySymbol})`}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delivery.byDay.map((d) => (
                          <tr key={d.date} style={{ borderTop: "1px solid #eee" }}>
                            <td style={{ padding: "6px 8px" }}>{d.date}</td>
                            <td style={{ padding: "6px 8px" }}>{d.orders}</td>
                            <td style={{ padding: "6px 8px" }}>{fmtMoney(d.gross, currencySymbol)}</td>
                            <td style={{ padding: "6px 8px" }}>{fmtMoney(d.net, currencySymbol)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {deliveryTopItems.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    En çok satan ürünler (Paket)
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
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--rezvix-text-soft)" }}>
                          <th style={{ padding: "6px 8px" }}>Ürün</th>
                          <th style={{ padding: "6px 8px" }}>Adet</th>
                          <th style={{ padding: "6px 8px" }}>{`Ciro (${currencySymbol})`}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryTopItems.map((it, idx) => (
                          <tr key={it.itemId ?? idx} style={{ borderTop: "1px solid #eee" }}>
                            <td style={{ padding: "6px 8px" }}>{it.title || "-"}</td>
                            <td style={{ padding: "6px 8px" }}>{it.qty}</td>
                            <td style={{ padding: "6px 8px" }}>{fmtMoney(it.revenue, currencySymbol)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Kanal bazlı stacked bar */}
          <div
            style={{
              borderRadius: 14,
              padding: 12,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "rgba(255,255,255,0.9)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
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
                      background: "rgba(46, 204, 113, 0.9)",
                      transition: "width 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${(qrRev / channelTotal) * 100}%`,
                      background: "rgba(52, 152, 219, 0.9)",
                      transition: "width 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${(rezvixTableRev / channelTotal) * 100}%`,
                      background: "rgba(155, 89, 182, 0.9)",
                      transition: "width 0.3s ease",
                    }}
                  />
                  <div
                    style={{
                      width: `${(otherRev / channelTotal) * 100}%`,
                      background: "rgba(149, 165, 166, 0.9)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
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
                currencySymbol={currencySymbol}
              />
              <ChannelLegendItem
                label="QR Menü"
                color="rgba(52, 152, 219, 0.9)"
                amount={qrRev}
                count={orders.countsBySource.QR || 0}
                share={pct(qrRev, channelTotal)}
                currencySymbol={currencySymbol}
              />
              <ChannelLegendItem
                label="Rezvix"
                color="rgba(155, 89, 182, 0.9)"
                amount={rezvixTableRev}
                count={orders.countsBySource.REZVIX || 0}
                share={pct(rezvixTableRev, channelTotal)}
                currencySymbol={currencySymbol}
              />
              <ChannelLegendItem
                label="Diğer"
                color="rgba(149, 165, 166, 0.9)"
                amount={otherRev}
                count={orders.countsBySource.UNKNOWN || 0}
                share={pct(otherRev, channelTotal)}
                currencySymbol={currencySymbol}
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
                <span className="rezvix-kitchen-ticket__title">Toplam adisyon</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
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
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {avgSessionDurationMinutes} dk
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Kapalı adisyonların ortalaması
              </div>
            </div>

            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">Masadan alınan ödeme</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {fmtMoney(payments.grandTotal || 0, currencySymbol)}
              </div>
              <div className="rezvix-kitchen-ticket__meta">
                Kart + masada ödeme toplamı
              </div>
            </div>
          </div>

          {/* Günlük sipariş & ciro tablosu */}
          {orders.byDay.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
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
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--rezvix-text-soft)" }}>
                      <th style={{ padding: "6px 8px" }}>Tarih</th>
                      <th style={{ padding: "6px 8px" }}>Sipariş</th>
                      <th style={{ padding: "6px 8px" }}>{`Ciro (${currencySymbol})`}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.byDay.map((d) => (
                      <tr key={d.date} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "6px 8px" }}>{d.date}</td>
                        <td style={{ padding: "6px 8px" }}>{d.orders}</td>
                        <td style={{ padding: "6px 8px" }}>{fmtMoney(d.revenue, currencySymbol)}</td>
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
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
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
                  const maxRevenue = Math.max(...byHour.map((x) => x.revenue || 0), 1);
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
                      <div style={{ width: 80, textAlign: "right", fontSize: 11 }}>
                        {fmtMoney(h.revenue, currencySymbol)}
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
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
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
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--rezvix-text-soft)" }}>
                      <th style={{ padding: "6px 8px" }}>Masa</th>
                      <th style={{ padding: "6px 8px" }}>Adisyon</th>
                      <th style={{ padding: "6px 8px" }}>{`Ciro (${currencySymbol})`}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTables.map((t) => (
                      <tr key={t.tableId} style={{ borderTop: "1px solid #eee" }}>
                        <td style={{ padding: "6px 8px" }}>{t.tableId}</td>
                        <td style={{ padding: "6px 8px" }}>{t.sessionCount}</td>
                        <td style={{ padding: "6px 8px" }}>{fmtMoney(t.revenueTotal, currencySymbol)}</td>
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

/* -------------------------------------------
 * Alt bileşen: Paket Servis Raporu
 * ----------------------------------------- */

const DeliveryReportsView: React.FC<{
  orders: DeliveryOrder[];
  currencySymbol: string;
  range: Range;
}> = ({ orders, currencySymbol, range }) => {
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter((o) => String(o.status) === "delivered");
  const totalRevenue = deliveredOrders.reduce(
    (acc, o) => acc + Number(o.total || 0),
    0
  );

  const onTheWayCount = orders.filter((o) =>
    ["assigned", "picked_up", "on_the_way"].includes(String(o.status))
  ).length;
  const deliveredCount = orders.filter((o) => String(o.status) === "delivered").length;
  const cancelledCount = orders.filter((o) => String(o.status) === "cancelled").length;

  const paymentBreakdown = deliveredOrders.reduce(
    (acc, o) => {
      const pm = String((o as any)?.paymentMethod || "");
      if (pm === "card") {
        acc.card.count += 1;
        acc.card.revenue += Number(o.total || 0);
      } else if (pm === "cash") {
        acc.cash.count += 1;
        acc.cash.revenue += Number(o.total || 0);
      } else if (pm === "card_on_delivery") {
        acc.cardOnDelivery.count += 1;
        acc.cardOnDelivery.revenue += Number(o.total || 0);
      } else {
        acc.other.count += 1;
        acc.other.revenue += Number(o.total || 0);
      }
      return acc;
    },
    {
      card: { count: 0, revenue: 0 },
      cash: { count: 0, revenue: 0 },
      cardOnDelivery: { count: 0, revenue: 0 },
      other: { count: 0, revenue: 0 },
    }
  );

  const byDayMap = orders.reduce((acc: Record<string, { orders: number }>, o) => {
    const dateKey = o.createdAt ? formatYmd(new Date(o.createdAt)) : "";
    if (!dateKey) return acc;
    if (!acc[dateKey]) acc[dateKey] = { orders: 0 };
    acc[dateKey].orders += 1;
    return acc;
  }, {});

  const byDayRevenue = deliveredOrders.reduce((acc: Record<string, number>, o) => {
    const dateKey = o.createdAt ? formatYmd(new Date(o.createdAt)) : "";
    if (!dateKey) return acc;
    acc[dateKey] = (acc[dateKey] ?? 0) + Number(o.total || 0);
    return acc;
  }, {});

  const weekDays = buildLastNDays(range.to || formatYmd(new Date()), 7);
  const weekly = weekDays.map((d) => ({
    date: d,
    orders: byDayMap[d]?.orders ?? 0,
    revenue: byDayRevenue[d] ?? 0,
  }));
  const maxOrders = Math.max(...weekly.map((d) => d.orders), 1);
  const maxRevenue = Math.max(...weekly.map((d) => d.revenue), 1);

  const PAGE_SIZE = 8;
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  React.useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pagedOrders = orders.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const paymentTotal =
    paymentBreakdown.card.revenue +
    paymentBreakdown.cardOnDelivery.revenue +
    paymentBreakdown.cash.revenue +
    paymentBreakdown.other.revenue;

  const paymentSegments = [
    {
      key: "card",
      label: "Online",
      value: paymentBreakdown.card.revenue,
      color: "linear-gradient(180deg, #2D9CDB, #2F80ED)",
    },
    {
      key: "card_on_delivery",
      label: "Kapida Kart",
      value: paymentBreakdown.cardOnDelivery.revenue,
      color: "linear-gradient(180deg, #9B51E0, #7C3AED)",
    },
    {
      key: "cash",
      label: "Kapida Nakit",
      value: paymentBreakdown.cash.revenue,
      color: "linear-gradient(180deg, #F2994A, #F97316)",
    },
    {
      key: "other",
      label: "Diger",
      value: paymentBreakdown.other.revenue,
      color: "linear-gradient(180deg, #9CA3AF, #6B7280)",
    },
  ].filter((s) => s.value > 0);

  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const toggleExpanded = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const buildAddress = (o: any) => {
    const addrText = String(o?.addressText || "").trim();
    if (addrText) return addrText;
    const line1 = String(o?.addressLine1 || "").trim();
    const line2 = String(o?.addressLine2 || "").trim();
    const city = String(o?.city || "").trim();
    const postcode = String(o?.postcode || "").trim();
    const parts = [line1, line2, city, postcode].filter(Boolean);
    return parts.join(" · ");
  };

  const paymentLabel =
    (orders[0] as any)?.paymentMethodLabel != null
      ? (o: any) => String(o?.paymentMethodLabel || "—")
      : (o: any) => {
          const m = String(o?.paymentMethod || "");
          if (m === "card") return "Online Ödeme";
          if (m === "cash") return "Kapıda Nakit";
          if (m === "card_on_delivery") return "Kapıda Kart";
          return "—";
        };

  const calcLineTotal = (it: any) => {
    const qty = Math.max(1, Number(it?.qty || 1));
    const lineTotal = Number(it?.lineTotal || 0);
    if (Number.isFinite(lineTotal) && lineTotal > 0) return lineTotal;
    const unitTotal = Number(it?.unitTotal || 0);
    if (Number.isFinite(unitTotal) && unitTotal > 0) return unitTotal * qty;
    const price = Number(it?.price ?? 0);
    if (Number.isFinite(price) && price > 0) return price * qty;
    return 0;
  };

  return (
    <div className="rezvix-board-layout">
      {/* Sol kolon: özet + chart */}
      <div className="rezvix-board-column">
        <div className="rezvix-board-column__header">
          <div className="rezvix-board-column__title">Paket Servis Özeti</div>
          <div className="rezvix-board-column__count">
            {range.from} – {range.to}
          </div>
        </div>

        <div className="rezvix-board-column__body" style={{ gap: 12 }}>
          <div
            style={{
              borderRadius: 16,
              padding: 14,
              background:
                "linear-gradient(135deg, rgba(47,128,237,0.12), rgba(255,255,255,0.9))",
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
              Toplam Paket Servis Cirosu
            </div>
            <div style={{ fontSize: 30, fontWeight: 700 }}>
              {fmtMoney(totalRevenue, currencySymbol)}
            </div>
            <div style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}>
              {totalOrders} sipariş
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">Teslim edildi</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {deliveredCount}
              </div>
            </div>
            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">Yolda</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {onTheWayCount}
              </div>
            </div>
            <div className="rezvix-kitchen-ticket">
              <div className="rezvix-kitchen-ticket__header">
                <span className="rezvix-kitchen-ticket__title">İptal edildi</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
                {cancelledCount}
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              padding: 12,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "rgba(255,255,255,0.9)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              Ödeme kırılımı (teslim edilenler)
            </div>
            <div
              style={{
                borderRadius: 999,
                overflow: "hidden",
                height: 10,
                background: "rgba(0,0,0,0.06)",
                marginBottom: 10,
              }}
            >
              {paymentTotal > 0 && (
                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                  {paymentSegments.map((seg) => (
                    <div
                      key={seg.key}
                      style={{
                        width: `${(seg.value / paymentTotal) * 100}%`,
                        background: seg.color,
                        transition: "width 0.25s ease",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            {paymentTotal > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 6,
                  marginBottom: 8,
                  fontSize: 11,
                  color: "var(--rezvix-text-soft)",
                }}
              >
                {paymentSegments.map((seg) => (
                  <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: seg.color,
                        display: "inline-block",
                      }}
                    />
                    <span>
                      {seg.label}: {((seg.value / paymentTotal) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 8,
                fontSize: 12,
              }}
            >
              <div className="rezvix-kitchen-ticket">
                <div className="rezvix-kitchen-ticket__header">
                  <span className="rezvix-kitchen-ticket__title">Online Ödeme</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                  {fmtMoney(paymentBreakdown.card.revenue, currencySymbol)}
                </div>
                <div className="rezvix-kitchen-ticket__meta">
                  {paymentBreakdown.card.count} sipariş
                </div>
              </div>
              <div className="rezvix-kitchen-ticket">
                <div className="rezvix-kitchen-ticket__header">
                  <span className="rezvix-kitchen-ticket__title">Kapıda Kart</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                  {fmtMoney(paymentBreakdown.cardOnDelivery.revenue, currencySymbol)}
                </div>
                <div className="rezvix-kitchen-ticket__meta">
                  {paymentBreakdown.cardOnDelivery.count} sipariş
                </div>
              </div>
              <div className="rezvix-kitchen-ticket">
                <div className="rezvix-kitchen-ticket__header">
                  <span className="rezvix-kitchen-ticket__title">Kapıda Nakit</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                  {fmtMoney(paymentBreakdown.cash.revenue, currencySymbol)}
                </div>
                <div className="rezvix-kitchen-ticket__meta">
                  {paymentBreakdown.cash.count} sipariş
                </div>
              </div>
              {paymentBreakdown.other.count > 0 && (
                <div className="rezvix-kitchen-ticket">
                  <div className="rezvix-kitchen-ticket__header">
                    <span className="rezvix-kitchen-ticket__title">Diğer</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                    {fmtMoney(paymentBreakdown.other.revenue, currencySymbol)}
                  </div>
                  <div className="rezvix-kitchen-ticket__meta">
                    {paymentBreakdown.other.count} sipariş
                  </div>
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              padding: 12,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "rgba(255,255,255,0.9)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Haftalık satış / ciro (son 7 gün)
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11, marginBottom: 8 }}>
              <span style={{ color: "rgba(0,0,0,0.6)" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "linear-gradient(180deg, #2D9CDB, #2F80ED)",
                    marginRight: 6,
                  }}
                />
                Sipariş
              </span>
              <span style={{ color: "rgba(0,0,0,0.6)" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "linear-gradient(180deg, #F2994A, #EB5757)",
                    marginRight: 6,
                  }}
                />
                Ciro
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: 10,
                alignItems: "end",
              }}
            >
              {weekly.map((d) => {
                const orderHeight = (d.orders / maxOrders) * 100;
                const revenueHeight = (d.revenue / maxRevenue) * 100;
                return (
                  <div key={d.date} style={{ textAlign: "center" }}>
                    <div
                      style={{
                        height: 120,
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 4,
                        padding: "0 4px",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          height: `${orderHeight}%`,
                          borderRadius: 8,
                          background: "linear-gradient(180deg, #2D9CDB, #2F80ED)",
                          boxShadow: "0 6px 12px rgba(47,128,237,0.2)",
                        }}
                      />
                      <div
                        style={{
                          flex: 1,
                          height: `${revenueHeight}%`,
                          borderRadius: 8,
                          background: "linear-gradient(180deg, #F2994A, #EB5757)",
                          boxShadow: "0 6px 12px rgba(235,87,87,0.2)",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, marginTop: 6, color: "var(--rezvix-text-soft)" }}>
                      {fmtDayLabel(d.date)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--rezvix-text-soft)" }}>
                      {d.orders} sip · {fmtMoney(d.revenue, currencySymbol)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sağ kolon: sipariş listesi */}
      <div className="rezvix-board-column">
        <div className="rezvix-board-column__header">
          <div className="rezvix-board-column__title">Sipariş Listesi</div>
          <div className="rezvix-board-column__count">{totalOrders} kayıt</div>
        </div>
        <div className="rezvix-board-column__body">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              fontSize: 12,
              color: "var(--rezvix-text-soft)",
            }}
          >
            <div>
              Sayfa {safePage} / {totalPages}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "4px 10px",
                  cursor: safePage <= 1 ? "not-allowed" : "pointer",
                  opacity: safePage <= 1 ? 0.5 : 1,
                }}
              >
                Önceki
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={{
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "4px 10px",
                  cursor: safePage >= totalPages ? "not-allowed" : "pointer",
                  opacity: safePage >= totalPages ? 0.5 : 1,
                }}
              >
                Sonraki
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pagedOrders.map((o) => {
              const expanded = expandedId === o._id;
              const items = Array.isArray((o as any).items) ? (o as any).items : [];
              return (
                <div
                  key={o._id}
                  onClick={() => toggleExpanded(o._id)}
                  style={{
                    borderRadius: 14,
                    border: "1px solid var(--rezvix-border-subtle)",
                    background: "rgba(255,255,255,0.9)",
                    padding: 12,
                    cursor: "pointer",
                    transition: "box-shadow 0.2s ease",
                    boxShadow: expanded ? "0 10px 24px rgba(15,23,42,0.08)" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {(o as any).customerName || "Misafir"}
                        {o.createdAt ? (
                          <span style={{ marginLeft: 8, color: "var(--rezvix-text-soft)", fontSize: 11 }}>
                            {fmtDT(o.createdAt)}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>
                        {(o as any).customerPhone || "Telefon yok"} ·{" "}
                        {(o as any).shortCode ? `#${String((o as any).shortCode)}` : o._id.slice(-6)}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 700 }}>
                        {fmtMoney(o.total || 0, currencySymbol)}
                      </div>
                      <div
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            o.status === "delivered"
                              ? "rgba(34,197,94,0.14)"
                              : o.status === "cancelled"
                              ? "rgba(239,68,68,0.12)"
                              : "rgba(59,130,246,0.12)",
                          color:
                            o.status === "delivered"
                              ? "#15803d"
                              : o.status === "cancelled"
                              ? "#b91c1c"
                              : "#1d4ed8",
                        }}
                      >
                        {fmtDeliveryStatus(o.status)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}>
                        {expanded ? "▲" : "▼"}
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div
                      style={{
                        marginTop: 12,
                        borderTop: "1px solid #eee",
                        paddingTop: 10,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}>
                        <strong>Adres:</strong> {buildAddress(o as any) || "—"}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <div style={{ color: "var(--rezvix-text-soft)" }}>Ödeme</div>
                          <div style={{ fontWeight: 600 }}>{paymentLabel(o as any)}</div>
                        </div>
                        <div>
                          <div style={{ color: "var(--rezvix-text-soft)" }}>Ara Toplam</div>
                          <div style={{ fontWeight: 600 }}>
                            {fmtMoney((o as any).subtotal || 0, currencySymbol)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: "var(--rezvix-text-soft)" }}>Teslimat</div>
                          <div style={{ fontWeight: 600 }}>
                            {fmtMoney((o as any).deliveryFee || 0, currencySymbol)}
                          </div>
                        </div>
                      </div>

                      {String((o as any).customerNote || "").trim() && (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ color: "var(--rezvix-text-soft)" }}>Not</div>
                          <div style={{ fontWeight: 600 }}>{(o as any).customerNote}</div>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                          Ürünler
                        </div>
                        {items.length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}>
                            Ürün bilgisi yok.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "grid",
                              gap: 6,
                              borderRadius: 10,
                              background: "rgba(0,0,0,0.02)",
                              padding: 8,
                            }}
                          >
                            {items.map((it: any, idx: number) => (
                              <div
                                key={it.itemId ?? idx}
                                style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}
                              >
                                <div>
                                  {Math.max(1, Number(it?.qty || 1))}× {it?.title || it?.itemTitle || "Ürün"}
                                </div>
                                <div style={{ fontWeight: 600 }}>
                                  {fmtMoney(calcLineTotal(it), currencySymbol)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
  currencySymbol: string;
}> = ({ label, color, amount, count, share, currencySymbol }) => {
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
          {count} sipariş · {fmtMoney(amount, currencySymbol)}
        </div>
        <div style={{ fontSize: 11 }}>{share}% pay</div>
      </div>
    </div>
  );
};
