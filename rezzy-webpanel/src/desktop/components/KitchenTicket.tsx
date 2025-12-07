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

  status: KitchenTicketStatus;
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
  secondary?: string;
} {
  switch (status) {
    case "NEW":
      return { primary: "Yeni sipariş", secondary: "Hazırlamaya alınabilir" };
    case "IN_PROGRESS":
      return { primary: "Hazırlanıyor", secondary: "Servise hazır olacak" };
    case "READY":
      return { primary: "Servise hazır", secondary: "Teslim edilmeyi bekliyor" };
    case "SERVED":
      return { primary: "Teslim edildi", secondary: "Tamamlandı" };
    default:
      return { primary: "" };
  }
}

export const KitchenTicket: React.FC<KitchenTicketProps> = ({
  id,
  tableLabel,
  source,
  minutesAgo,
  items,
  note,
  status,
  onStart,
  onReady,
  onServe,
}) => {
  const footer = getFooterTexts(status);

  return (
    <article
      className={`rezvix-kitchen-ticket status-${status.toLowerCase()}`}
    >
      <header className="rezvix-kitchen-ticket__header">
        <div className="rezvix-kitchen-ticket__title">{tableLabel}</div>
        <div className="rezvix-kitchen-ticket__meta">
          {getSourceLabel(source)} · +{minutesAgo} dk
        </div>
      </header>

      <ul className="rezvix-kitchen-ticket__items">
        {items.map((item, idx) => (
          <li key={idx} className="rezvix-kitchen-ticket__item">
            <span>{item.name}</span>
            <span className="qty">×{item.quantity}</span>
          </li>
        ))}
      </ul>

      {note && <div className="rezvix-kitchen-ticket__note">{note}</div>}

      <footer className="rezvix-kitchen-ticket__footer">
        <div className="info">
          <div className="title">{footer.primary}</div>
          {footer.secondary && <div className="sub">{footer.secondary}</div>}
        </div>

        <div className="actions">
          {status === "NEW" && (
            <button className="kbtn primary" onClick={() => onStart?.(id)}>
              Hazırlamaya al
            </button>
          )}

          {status === "IN_PROGRESS" && (
            <button className="kbtn warning" onClick={() => onReady?.(id)}>
              Hazır
            </button>
          )}

          {status === "READY" && (
            <button className="kbtn success" onClick={() => onServe?.(id)}>
              Teslim edildi
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};