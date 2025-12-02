import React from "react";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { KitchenTicket, KitchenTicketItem } from "../components/KitchenTicket";

type KitchenTicketStatus = "NEW" | "IN_PROGRESS" | "READY" | "SERVED";

type KitchenTicketWithStatus = {
  id: string;
  status: KitchenTicketStatus;
  tableLabel: string;
  source: "WALK_IN" | "QR" | "REZVIX";
  minutesAgo: number;
  items: KitchenTicketItem[];
  note?: string;
};

const mockKitchenTickets: KitchenTicketWithStatus[] = [
  {
    id: "k1",
    status: "NEW",
    tableLabel: "Masa 4 · Teras",
    source: "REZVIX",
    minutesAgo: 3,
    items: [
      { name: "Rakılı Meze Tabağı", quantity: 1 },
      { name: "Kalamar Tava", quantity: 1 },
    ],
    note: "Glutensiz ekmek rica ediyor.",
  },
  {
    id: "k2",
    status: "IN_PROGRESS",
    tableLabel: "Masa 2 · Bahçe",
    source: "QR",
    minutesAgo: 9,
    items: [
      { name: "Burger Menü", quantity: 2 },
      { name: "Patates Kızartması", quantity: 1 },
    ],
  },
  {
    id: "k3",
    status: "READY",
    tableLabel: "Masa 1 · İç Salon",
    source: "WALK_IN",
    minutesAgo: 16,
    items: [{ name: "Karışık Izgara", quantity: 2 }],
    note: "Acılı sos ayrıca.",
  },
];

const groupByStatus = (status: KitchenTicketStatus) =>
  mockKitchenTickets.filter((t) => t.status === status);

export const KitchenBoardPage: React.FC = () => {
  const newOrders = groupByStatus("NEW");
  const inProgress = groupByStatus("IN_PROGRESS");
  const ready = groupByStatus("READY");
  const served = groupByStatus("SERVED");

  const totalTickets = mockKitchenTickets.length;

  return (
    <RestaurantDesktopLayout
      activeNav="kitchen"
      title="Mutfak Ekranı"
      subtitle="Yeni siparişler, hazırlananlar ve servise hazır tabaklar."
      summaryChips={[
        {
          label: "Toplam fiş",
          value: `${totalTickets} adet`,
          tone: "success",
        },
        {
          label: "Hazırlanan",
          value: `${inProgress.length} adet`,
          tone: "warning",
        },
        {
          label: "Servise hazır",
          value: `${ready.length} adet`,
          tone: "neutral",
        },
      ]}
    >
      <div className="rezvix-board-layout">
        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Yeni</div>
            <div className="rezvix-board-column__count">{newOrders.length}</div>
          </div>
          <div className="rezvix-board-column__body">
            {newOrders.map((t) => (
              <KitchenTicket key={t.id} {...t} />
            ))}
          </div>
        </div>

        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Hazırlanıyor</div>
            <div className="rezvix-board-column__count">{inProgress.length}</div>
          </div>
          <div className="rezvix-board-column__body">
            {inProgress.map((t) => (
              <KitchenTicket key={t.id} {...t} />
            ))}
          </div>
        </div>

        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Hazır</div>
            <div className="rezvix-board-column__count">{ready.length}</div>
          </div>
          <div className="rezvix-board-column__body">
            {ready.map((t) => (
              <KitchenTicket key={t.id} {...t} />
            ))}
          </div>
        </div>

        <div className="rezvix-board-column">
          <div className="rezvix-board-column__header">
            <div className="rezvix-board-column__title">Teslim edildi</div>
            <div className="rezvix-board-column__count">{served.length}</div>
          </div>
          <div className="rezvix-board-column__body">
            {served.length === 0 ? (
              <div className="rezvix-empty">
                <div className="rezvix-empty__icon">🍽️</div>
                <div className="rezvix-empty__title">Teslim edilen sipariş yok</div>
                <div className="rezvix-empty__text">
                  Hazır tabaklar servis edildikçe burada listelenecek.
                </div>
              </div>
            ) : (
              served.map((t) => <KitchenTicket key={t.id} {...t} />)
            )}
          </div>
        </div>
      </div>
    </RestaurantDesktopLayout>
  );
};