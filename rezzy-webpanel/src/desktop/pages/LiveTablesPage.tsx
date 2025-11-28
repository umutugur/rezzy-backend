import React from "react";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import { TableCard, TableStatus, TableChannel } from "../components/TableCard";

type MockTable = {
  id: string;
  name: string;
  location: string;
  status: TableStatus;
  channel?: TableChannel;
  total?: number;
  guestCount?: number;
  sinceMinutes?: number;
};

const mockTables: MockTable[] = [
  {
    id: "t1",
    name: "Masa 1",
    location: "İç Salon",
    status: "OPEN",
    channel: "WALK_IN",
    total: 840,
    guestCount: 3,
    sinceMinutes: 22,
  },
  {
    id: "t2",
    name: "Masa 2",
    location: "Bahçe",
    status: "PAYING",
    channel: "QR",
    total: 420,
    guestCount: 2,
    sinceMinutes: 48,
  },
  {
    id: "t3",
    name: "Masa 3",
    location: "İç Salon",
    status: "IDLE",
  },
  {
    id: "t4",
    name: "Masa 4",
    location: "Teras",
    status: "OPEN",
    channel: "REZZY",
    total: 1640,
    guestCount: 5,
    sinceMinutes: 35,
  },
];

export const LiveTablesPage: React.FC = () => {
  return (
    <RestaurantDesktopLayout
      activeNav="tables"
      title="Canlı Masalar"
      subtitle="Lokal adisyonlar, Rezzy ve QR siparişleri tek ekranda."
    >
      <div className="rezzy-tables-grid">
        {mockTables.map((t) => (
          <TableCard key={t.id} {...t} />
        ))}
      </div>
    </RestaurantDesktopLayout>
  );
};