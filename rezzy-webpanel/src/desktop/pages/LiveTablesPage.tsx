import React from "react";
import { useQuery } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { TableCard, TableStatus } from "../components/TableCard";
import {
  restaurantGetLiveTables,
  type LiveTable,
} from "../../api/client";
import { authStore } from "../../store/auth";

type MockTableLike = {
  id: string;
  name: string;
  location: string;
  status: TableStatus;
  total?: number;
  sinceMinutes?: number;
};

// ---- Yardımcılar ----

function mapStatus(status: LiveTable["status"]): TableStatus {
  switch (status) {
    case "empty":
      return "IDLE";
    case "waiter_call":
      return "NEED_HELP";
    case "bill_request":
      return "PAYING";
    case "occupied":
    case "order_active":
    default:
      return "OPEN";
  }
}

function formatLocation(t: LiveTable): string {
  if (typeof t.floor === "number") {
    return `Kat ${t.floor}`;
  }
  return "Salon";
}

function minutesSince(iso: string | null): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return undefined;
  return Math.round(diffMs / 60000);
}

export const LiveTablesPage: React.FC = () => {
  const user = authStore.getUser();
  const rid = user?.restaurantId || "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-live-tables", rid],
    queryFn: () => restaurantGetLiveTables(rid),
    enabled: !!rid,
  });

  const tables: LiveTable[] = data?.tables ?? [];

  // Özetler
  const occupiedCount = tables.filter((t) => t.status !== "empty").length;
  const waiterCallCount = tables.filter((t) => t.status === "waiter_call").length;
  const billRequestCount = tables.filter((t) => t.status === "bill_request").length;

  const mapped: MockTableLike[] = tables.map((t) => ({
    id: t.id,
    name: t.name,
    location: formatLocation(t),
    status: mapStatus(t.status),
    total: t.totals?.grandTotal ?? undefined,
    sinceMinutes: minutesSince(t.lastOrderAt),
  }));

  const hasData = mapped.length > 0;

  return (
    <RestaurantDesktopLayout
      activeNav="tables"
      title="Canlı Masalar"
      subtitle="Lokal adisyonlar, Rezzy ve QR siparişleri tek ekranda."
      summaryChips={[
        {
          label: "Dolu masa",
          value: `${occupiedCount} adet`,
          tone: "success",
        },
        {
          label: "Garson çağrısı",
          value: `${waiterCallCount} masa`,
          tone: waiterCallCount > 0 ? "danger" : "neutral",
        },
        {
          label: "Hesap isteyen",
          value: `${billRequestCount} masa`,
          tone: billRequestCount > 0 ? "warning" : "neutral",
        },
      ]}
    >
      {isLoading && (
        <div className="rezzy-empty">
          <div className="rezzy-empty__icon">⏳</div>
          <div className="rezzy-empty__title">Masalar getiriliyor…</div>
          <div className="rezzy-empty__text">
            Canlı masa durumları birkaç saniye içinde yüklenecek.
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="rezzy-empty">
          <div className="rezzy-empty__icon">⚠️</div>
          <div className="rezzy-empty__title">Masalar yüklenemedi</div>
          <div className="rezzy-empty__text">
            Lütfen sayfayı yenilemeyi deneyin. Sorun devam ederse bağlantınızı kontrol edin.
          </div>
        </div>
      )}

      {!isLoading && !isError && !hasData && (
        <div className="rezzy-empty">
          <div className="rezzy-empty__icon">🪑</div>
          <div className="rezzy-empty__title">Tanımlı masa bulunamadı</div>
          <div className="rezzy-empty__text">
            Masa planı oluşturulduğunda, canlı masa durumu burada görünecek.
          </div>
        </div>
      )}

      {!isLoading && !isError && hasData && (
        <div className="rezzy-tables-grid">
          {mapped.map((t) => (
            <TableCard
              key={t.id}
              name={t.name}
              location={t.location}
              status={t.status}
              total={t.total}
              sinceMinutes={t.sinceMinutes}
            />
          ))}
        </div>
      )}
    </RestaurantDesktopLayout>
  );
};