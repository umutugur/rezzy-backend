import React from "react";

export type KitchenTicketItem = {
  name: string;
  quantity: number;
};

export type KitchenTicketProps = {
  id: string;
  tableLabel: string;
  source: "WALK_IN" | "QR" | "REZZY";
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
    source === "WALK_IN" ? "Lokal" : source === "QR" ? "QR Menü" : "Rezzy";

  return (
    <article className="rezzy-kitchen-ticket">
      <header className="rezzy-kitchen-ticket__header">
        <div className="rezzy-kitchen-ticket__title">{tableLabel}</div>
        <div className="rezzy-kitchen-ticket__meta">
          {sourceLabel} · +{minutesAgo} dk
        </div>
      </header>

      <ul className="rezzy-kitchen-ticket__items">
        {items.map((item, idx) => (
          <li key={idx} className="rezzy-kitchen-ticket__item">
            <span className="rezzy-kitchen-ticket__name">{item.name}</span>
            <span className="rezzy-kitchen-ticket__qty">×{item.quantity}</span>
          </li>
        ))}
      </ul>

      {note && <div className="rezzy-kitchen-ticket__note">{note}</div>}

      <footer className="rezzy-kitchen-ticket__footer">
        <span>Hazırlanıyor</span>
        <span>Servis &bull; Sıcak</span>
      </footer>
    </article>
  );
};