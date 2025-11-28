import React from "react";
import { useQuery } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { EmptyState } from "../components/EmptyState";
import { api } from "../../api/client";
import { authStore } from "../../store/auth";

// ---- Türler (RestaurantReservationsPage ile aynı model) ----
type Row = {
  _id: string;
  dateTimeUTC: string;
  partySize: number;
  totalPrice?: number;
  depositAmount?: number;
  status:
    | "pending"
    | "confirmed"
    | "arrived"
    | "cancelled"
    | "no_show"
    | string;
  receiptUrl?: string;
  user?: { name?: string; email?: string };
};

type Resp = { items: Row[]; total: number; page: number; limit: number };

// ---- Yardımcılar ----
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

async function fetchRezzyOrders(rid: string): Promise<Resp> {
  const today = new Date();
  const params = {
    from: ymd(today),
    page: 1,
    limit: 50,
  };
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params,
  });
  return data as Resp;
}

export const RezzyOrdersPage: React.FC = () => {
  const user = authStore.getUser();
  const rid = user?.restaurantId || "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["desktop-rezzy-orders", rid],
    queryFn: () => fetchRezzyOrders(rid),
    enabled: !!rid,
  });

  const rows: Row[] = data?.items ?? [];

  const pending = rows.filter((r) => r.status === "pending");
  const active = rows.filter(
    (r) => r.status === "confirmed" || r.status === "arrived"
  );
  const problematic = rows.filter(
    (r) => r.status === "cancelled" || r.status === "no_show"
  );

  const totalOrders = rows.length;
  const activeCount = active.length;
  const pendingCount = pending.length;
  const todayTotalAmount = rows.reduce(
    (sum, r) => sum + (r.totalPrice ?? 0),
    0
  );

  const hasData = totalOrders > 0;

  const renderCard = (r: Row) => {
    const dt = new Date(r.dateTimeUTC);
    const when = dt.toLocaleString("tr-TR");

    return (
      <article key={r._id} className="rezzy-kitchen-ticket">
        <div className="rezzy-kitchen-ticket__header">
          <div className="rezzy-kitchen-ticket__title">
            {r.user?.name || "İsimsiz misafir"}
          </div>
          <div className="rezzy-kitchen-ticket__meta">{when}</div>
        </div>

        <ul className="rezzy-kitchen-ticket__items">
          <li className="rezzy-kitchen-ticket__item">
            <span className="rezzy-kitchen-ticket__name">
              {r.partySize} kişi
            </span>
            <span className="rezzy-kitchen-ticket__qty">
              {fmtStatus(r.status)}
            </span>
          </li>
          <li className="rezzy-kitchen-ticket__item">
            <span className="rezzy-kitchen-ticket__name">Toplam</span>
            <span className="rezzy-kitchen-ticket__qty">
              {r.totalPrice != null
                ? `${r.totalPrice.toLocaleString("tr-TR")}₺`
                : "—"}
            </span>
          </li>
          <li className="rezzy-kitchen-ticket__item">
            <span className="rezzy-kitchen-ticket__name">Depozito</span>
            <span className="rezzy-kitchen-ticket__qty">
              {r.depositAmount != null
                ? `${r.depositAmount.toLocaleString("tr-TR")}₺`
                : "—"}
            </span>
          </li>
        </ul>

        {r.user?.email && (
          <div className="rezzy-kitchen-ticket__footer">
            <span>{r.user.email}</span>
          </div>
        )}
      </article>
    );
  };

  return (
    <RestaurantDesktopLayout
      activeNav="rezzy"
      title="Rezzy & QR Siparişleri"
      subtitle="Rezzy rezervasyonlarından ve QR menüden gelen siparişleri buradan yönetin."
      summaryChips={[
        {
          label: "Toplam sipariş",
          value: `${totalOrders} adet`,
          tone: "neutral",
        },
        {
          label: "Aktif",
          value: `${activeCount} adet`,
          tone: activeCount > 0 ? "success" : "neutral",
        },
        {
          label: "Bekleyen",
          value: `${pendingCount} adet`,
          tone: pendingCount > 0 ? "warning" : "neutral",
        },
      ]}
    >
      {isLoading && (
        <div className="rezzy-empty">
          <div className="rezzy-empty__icon">⏳</div>
          <div className="rezzy-empty__title">Siparişler getiriliyor…</div>
          <div className="rezzy-empty__text">
            Rezzy ve QR siparişleri birkaç saniye içinde yüklenecek.
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="rezzy-empty">
          <div className="rezzy-empty__icon">⚠️</div>
          <div className="rezzy-empty__title">Siparişler yüklenemedi</div>
          <div className="rezzy-empty__text">
            Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı
            kontrol edin.
          </div>
        </div>
      )}

      {!isLoading && !isError && !hasData && (
        <EmptyState
          icon="📲"
          title="Henüz aktif Rezzy / QR siparişi yok"
          text="Rezzy rezervasyonları ve QR menü siparişleri burada listelenecek."
        />
      )}

      {!isLoading && !isError && hasData && (
        <div className="rezzy-board-layout">
          <div className="rezzy-board-column">
            <div className="rezzy-board-column__header">
              <div className="rezzy-board-column__title">Bekleyen</div>
              <div className="rezzy-board-column__count">
                {pending.length}
              </div>
            </div>
            <div className="rezzy-board-column__body">
              {pending.map(renderCard)}
            </div>
          </div>

          <div className="rezzy-board-column">
            <div className="rezzy-board-column__header">
              <div className="rezzy-board-column__title">Aktif</div>
              <div className="rezzy-board-column__count">{active.length}</div>
            </div>
            <div className="rezzy-board-column__body">
              {active.map(renderCard)}
            </div>
          </div>

          <div className="rezzy-board-column">
            <div className="rezzy-board-column__header">
              <div className="rezzy-board-column__title">Sorunlu</div>
              <div className="rezzy-board-column__count">
                {problematic.length}
              </div>
            </div>
            <div className="rezzy-board-column__body">
              {problematic.map(renderCard)}
            </div>
          </div>
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};