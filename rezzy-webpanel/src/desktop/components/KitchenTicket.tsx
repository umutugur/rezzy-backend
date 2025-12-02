import React from "react";

export type KitchenTicketItem = {
  name: string;
  quantity: number;
};

export type KitchenTicketProps = {
  id: string;
  tableLabel: string;
  source: "WALK_IN" | "QR" | "REZVIX";
  minutesAgo: number;
  items: KitchenTicketItem[];
  note?: string;
};

export const KitchenTicket: React.FC<KitchenTicketProps> = ({
  tableLabel,
  source,
  minutesAgo,
  items,
  note,
}) => {
  const sourceLabel =
    source === "WALK_IN" ? "Lokal" : source === "QR" ? "QR Menü" : "Rezvix";

  return (
    <article className="rezvix-kitchen-ticket">
      <header className="rezvix-kitchen-ticket__header">
        <div className="rezvix-kitchen-ticket__title">{tableLabel}</div>
        <div className="rezvix-kitchen-ticket__meta">
          {sourceLabel} · +{minutesAgo} dk
        </div>
      </header>

      <ul className="rezvix-kitchen-ticket__items">
        {items.map((item, idx) => (
          <li key={idx} className="rezvix-kitchen-ticket__item">
            <span className="rezvix-kitchen-ticket__name">{item.name}</span>
            <span className="rezvix-kitchen-ticket__qty">×{item.quantity}</span>
          </li>
        ))}
      </ul>

      {note && <div className="rezvix-kitchen-ticket__note">{note}</div>}

      <footer className="rezvix-kitchen-ticket__footer">
        <span>Hazırlanıyor</span>
        <span>Servis &bull; Sıcak</span>
      </footer>
    </article>
  );
};