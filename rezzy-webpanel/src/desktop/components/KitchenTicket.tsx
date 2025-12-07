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
  const sourceLabel = getSourceLabel(source);
  const footer = getFooterTexts(status);

  const handleStart = () => {
    if (onStart) onStart(id);
  };

  const handleReady = () => {
    if (onReady) onReady(id);
  };

  const handleServe = () => {
    if (onServe) onServe(id);
  };

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
        <div className="rezvix-kitchen-ticket__footer-text">
          <div className="rezvix-kitchen-ticket__footer-primary">
            {footer.primary}
          </div>
          <div className="rezvix-kitchen-ticket__footer-secondary">
            {footer.secondary}
          </div>
        </div>

        <div className="rezvix-kitchen-ticket__footer-actions">
          {status === "NEW" && onStart && (
            <button
              type="button"
              className="rezvix-kitchen-ticket__button rezvix-kitchen-ticket__button--primary"
              onClick={handleStart}
            >
              Hazırlamaya al
            </button>
          )}

          {status === "IN_PROGRESS" && onReady && (
            <button
              type="button"
              className="rezvix-kitchen-ticket__button rezvix-kitchen-ticket__button--primary"
              onClick={handleReady}
            >
              Hazır
            </button>
          )}

          {status === "READY" && onServe && (
            <button
              type="button"
              className="rezvix-kitchen-ticket__button rezvix-kitchen-ticket__button--primary"
              onClick={handleServe}
            >
              Teslim edildi
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};