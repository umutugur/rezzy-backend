// src/desktop/components/KitchenTicket.tsx
import React from "react";

export type KitchenTicketStatus = "NEW" | "IN_PROGRESS" | "READY" | "SERVED";

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

  // kolon tarafında kullanmak istersen:
  status: KitchenTicketStatus;
  // (şu an bu dosyada kullanmıyorum, ama parent rahatça prop geçebilsin diye tanımlı)
  onStart?: (id: string) => void;
  onReady?: (id: string) => void;
  onServe?: (id: string) => void;
};

function getSourceLabel(source: "WALK_IN" | "QR" | "REZVIX") {
  if (source === "WALK_IN") return "Lokal";
  if (source === "QR") return "QR Menü";
  return "Rezvix";
}

function getFooterTexts(status: KitchenTicketStatus): {
  primary: string;
  secondary: string;
} {
  switch (status) {
    case "NEW":
      return { primary: "Yeni sipariş", secondary: "Hazırlamaya alınacak" };
    case "IN_PROGRESS":
      return { primary: "Hazırlanıyor", secondary: "Servis • Sıcak" };
    case "READY":
      return { primary: "Servise hazır", secondary: "Servise çıkmayı bekliyor" };
    case "SERVED":
      return { primary: "Teslim edildi", secondary: "Servis tamamlandı" };
    default:
      return { primary: "", secondary: "" };
  }
}

export const KitchenTicket: React.FC<KitchenTicketProps> = ({
  tableLabel,
  source,
  minutesAgo,
  items,
  note,
  status,
}) => {
  const sourceLabel = getSourceLabel(source);
  const footer = getFooterTexts(status);

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
            <span className="rezvix-kitchen-ticket__qty">
              ×{item.quantity}
            </span>
          </li>
        ))}
      </ul>

      {note && <div className="rezvix-kitchen-ticket__note">{note}</div>}

      <footer className="rezvix-kitchen-ticket__footer">
        <span>{footer.primary}</span>
        <span>{footer.secondary}</span>
      </footer>
    </article>
  );
};