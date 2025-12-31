// src/desktop/pages/KitchenBoardPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { KitchenTicket, KitchenTicketItem } from "../components/KitchenTicket";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import { api } from "../../api/client";
import { showToast } from "../../ui/Toast";

type KitchenTicketStatus = "NEW" | "IN_PROGRESS" | "READY" | "SERVED";

type BackendKitchenTicket = {
  id: string;
  kitchenStatus: "new" | "preparing" | "ready" | "delivered";
  tableId: string;
  tableLabel: string;
  source: "walk_in" | "qr" | "rezvix" | string;
  minutesAgo: number;
  items: { title: string; qty: number; note?: string }[];
};

export type KitchenTicketWithStatus = {
  id: string;
  status: KitchenTicketStatus;
  tableLabel: string;
  source: "WALK_IN" | "QR" | "REZVIX";
  minutesAgo: number;
  items: KitchenTicketItem[];
  note?: string;
};

function mapStatusForUi(
  status: BackendKitchenTicket["kitchenStatus"]
): KitchenTicketStatus {
  switch (status) {
    case "preparing":
      return "IN_PROGRESS";
    case "ready":
      return "READY";
    case "delivered":
      return "SERVED";
    case "new":
    default:
      return "NEW";
  }
}

function mapSourceForUi(
  source: BackendKitchenTicket["source"]
): "WALK_IN" | "QR" | "REZVIX" {
  const s = String(source || "qr").toLowerCase();
  if (s === "walk_in") return "WALK_IN";
  if (s === "rezvix") return "REZVIX";
  return "QR";
}

function groupByStatus(
  tickets: KitchenTicketWithStatus[],
  status: KitchenTicketStatus
): KitchenTicketWithStatus[] {
  return tickets.filter((t) => t.status === status);
}

type KitchenStatusPayload = "new" | "preparing" | "ready" | "delivered";

function isTodayFromAnyTimestamp(ticket: BackendKitchenTicket, now: Date): boolean {
  // Since BackendKitchenTicket only has minutesAgo, use that to estimate if ticket is from today
  // Assume minutesAgo is minutes since creation
  // If minutesAgo is less than minutes passed since start of today, consider it today
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const minutesSinceStartOfToday = (now.getTime() - startOfToday.getTime()) / 60000;
  return ticket.minutesAgo <= minutesSinceStartOfToday;
}

export const KitchenBoardPage: React.FC = () => {
  const user = authStore.getUser();

  // ✅ Önce legacy restaurantId, yoksa membership'ten ilk restoran
  const fallbackMembershipRestaurantId =
    user?.restaurantMemberships?.[0]?.id ?? null;

  const rid =
    asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";

  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<{ tickets: BackendKitchenTicket[] }>(
    {
      queryKey: ["kitchen-tickets", rid],
      queryFn: async () => {
        const res = await api.get(`/orders/restaurants/${rid}/kitchen-tickets`);
        return res.data;
      },
      enabled: !!rid,
      refetchInterval: 5000,
    }
  );

  const tickets: KitchenTicketWithStatus[] = React.useMemo(() => {
    if (!data?.tickets) return [];
    return data.tickets.map((t) => ({
      id: t.id,
      status: mapStatusForUi(t.kitchenStatus),
      tableLabel: t.tableLabel,
      source: mapSourceForUi(t.source),
      minutesAgo: t.minutesAgo,
      items: t.items.map((it) => ({
        name: it.title,
        quantity: it.qty,
      })),
      note: t.items.some((it) => it.note)
        ? t.items.map((it) => it.note).join(" • ")
        : undefined,
    }));
  }, [data]);

  const todayTicketCount = React.useMemo(() => {
    if (!data?.tickets) return 0;
    const now = new Date();
    return data.tickets.filter((t) => isTodayFromAnyTimestamp(t, now)).length;
  }, [data]);

  const newOrders = groupByStatus(tickets, "NEW");
  const inProgress = groupByStatus(tickets, "IN_PROGRESS");
  const ready = groupByStatus(tickets, "READY");
  const served = groupByStatus(tickets, "SERVED");

  const totalTickets = tickets.length;

  const updateStatusMut = useMutation({
    mutationFn: async (params: { orderId: string; nextStatus: KitchenStatusPayload }) => {
      const { orderId, nextStatus } = params;
      await api.patch(`/orders/${orderId}/kitchen-status`, { status: nextStatus });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kitchen-tickets", rid] });
      qc.invalidateQueries({ queryKey: ["restaurant-live-tables", rid] });
    },
    onError: (e: any) => {
      showToast(
        e?.response?.data?.message || e?.message || "Mutfak durumu güncellenemedi",
        "error"
      );
    },
  });

  const getNextBackendStatus = (
    ticketStatus: KitchenTicketStatus
  ): KitchenStatusPayload | null => {
    switch (ticketStatus) {
      case "NEW":
        return "preparing";
      case "IN_PROGRESS":
        return "ready";
      case "READY":
        return "delivered";
      default:
        return null;
    }
  };

  const handleAdvanceStatus = (ticket: KitchenTicketWithStatus) => {
    const next = getNextBackendStatus(ticket.status);
    if (!next) return;
    updateStatusMut.mutate({ orderId: ticket.id, nextStatus: next });
  };

  const isUpdating = updateStatusMut.isPending;

  return (
    <RestaurantDesktopLayout
      activeNav="kitchen"
      title="Mutfak Ekranı"
      subtitle="Yeni siparişler, hazırlananlar ve servise hazır tabaklar."
      summaryChips={[
        {
          label: "Bugünkü fiş",
          value: isLoading ? "Yükleniyor…" : `${todayTicketCount} adet`,
          tone: "success",
        },
        {
          label: "Hazırlanan",
          value: isLoading ? "-" : `${inProgress.length} adet`,
          tone: "warning",
        },
        {
          label: "Servise hazır",
          value: isLoading ? "-" : `${ready.length} adet`,
          tone: "neutral",
        },
      ]}
    >
      {error && (
        <div className="rezvix-error-banner">
          Mutfak fişleri alınamadı. Sayfayı yenilemeyi deneyin.
        </div>
      )}

      <div className="rezvix-board-layout">
        {/* Yeni */}
        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Yeni</div>
            <div className="rezvix-board-column__count">
              {newOrders.length}
            </div>
          </div>
          <div className="rezvix-board-column__body">
            {isLoading ? (
              <div className="rezvix-empty">Yükleniyor…</div>
            ) : newOrders.length === 0 ? (
              <div className="rezvix-empty">Yeni sipariş yok</div>
            ) : (
              newOrders.map((t) => (
                <div key={t.id} className="rezvix-kitchen-card-wrapper">
                  <KitchenTicket
                    {...t}
                    onStart={() => {
                      if (isUpdating) return;
                      handleAdvanceStatus(t);
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Hazırlanıyor */}
        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Hazırlanıyor</div>
            <div className="rezvix-board-column__count">
              {inProgress.length}
            </div>
          </div>
          <div className="rezvix-board-column__body">
            {inProgress.length === 0 ? (
              <div className="rezvix-empty">Hazırlanan sipariş yok</div>
            ) : (
              inProgress.map((t) => (
                <div key={t.id} className="rezvix-kitchen-card-wrapper">
                  <KitchenTicket
                    {...t}
                    onReady={() => {
                      if (isUpdating) return;
                      handleAdvanceStatus(t);
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Hazır */}
        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Hazır</div>
            <div className="rezvix-board-column__count">
              {ready.length}
            </div>
          </div>
          <div className="rezvix-board-column__body">
            {ready.length === 0 ? (
              <div className="rezvix-empty">Servise hazır sipariş yok</div>
            ) : (
              ready.map((t) => (
                <div key={t.id} className="rezvix-kitchen-card-wrapper">
                  <KitchenTicket
                    {...t}
                    onServe={() => {
                      if (isUpdating) return;
                      handleAdvanceStatus(t);
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Teslim edildi */}
        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Teslim edildi</div>
            <div className="rezvix-board-column__count">
              {served.length}
            </div>
          </div>
          <div className="rezvix-board-column__body">
            {served.length === 0 ? (
              <div className="rezvix-empty">
                <div className="rezvix-empty__icon">🍽️</div>
                <div className="rezvix-empty__title">
                  Teslim edilen sipariş yok
                </div>
                <div className="rezvix-empty__text">
                  Hazır tabaklar servis edildikçe burada listelenecek.
                </div>
              </div>
            ) : (
              served.map((t) => (
                <div key={t.id} className="rezvix-kitchen-card-wrapper">
                  <KitchenTicket {...t} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </RestaurantDesktopLayout>
  );
};